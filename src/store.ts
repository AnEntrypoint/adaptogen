// The event-sourced spine. `append` is the ONLY mutation path: it seals a draft
// into the log (seq, checksum, hash chain) and folds it into the projection in
// one transaction, so the log and the materialized tables can never disagree.
// Everything else here is read, replay, snapshot, recovery, integrity.

import { Database } from "bun:sqlite";
import { openDatabase } from "./db.ts";
import { createSchema, PROJECTION_TABLES } from "./schema.ts";
import {
  GENESIS_HASH,
  eventChecksum,
  eventHash,
  canonicalize,
  sha256,
} from "./hash.ts";
import type {
  DEvent,
  DEventType,
  DraftEvent,
  DNode,
  DEdge,
  Zone,
  Stat,
  NodeId,
  NodeStatus,
  IntegrityReport,
} from "./types.ts";
import { IdGen } from "./ids.ts";

interface EventRow {
  seq: number;
  id: string;
  type: string;
  ts: number;
  payload: string;
  checksum: string;
  prev_hash: string;
  hash: string;
}

export interface StoreOptions {
  now?: () => number;
  rand?: () => number;
  ids?: IdGen;
}

export class Store {
  readonly db: Database;
  readonly ftsEnabled: boolean;
  readonly ids: IdGen;
  private now: () => number;
  private headSeq = 0;
  private headHashValue = GENESIS_HASH;

  constructor(filename: string, opts: StoreOptions = {}) {
    const { db, ftsEnabled } = openDatabase(filename);
    this.db = db;
    this.ftsEnabled = ftsEnabled;
    this.now = opts.now ?? (() => Date.now());
    this.ids = opts.ids ?? new IdGen({ now: opts.now, rand: opts.rand });
    createSchema(db, ftsEnabled);
    this.loadHead();
  }

  // ---- head tracking ----------------------------------------------------

  private loadHead(): void {
    const row = this.db
      .query<{ seq: number; hash: string }>(
        "SELECT seq, hash FROM events ORDER BY seq DESC LIMIT 1",
      )
      .get();
    if (row) {
      this.headSeq = row.seq;
      this.headHashValue = row.hash;
    } else {
      this.headSeq = 0;
      this.headHashValue = GENESIS_HASH;
    }
  }

  lastSeq(): number {
    return this.headSeq;
  }
  headHash(): string {
    return this.headHashValue;
  }

  // ---- append (the only mutation path) ---------------------------------

  private appendInternal(draft: DraftEvent): DEvent {
    const seq = this.headSeq + 1;
    const ts = this.now();
    const id = this.ids.next("E");
    const checksum = eventChecksum(seq, draft.type, ts, draft.payload);
    const prevHash = this.headHashValue;
    const hash = eventHash(checksum, prevHash);
    const ev: DEvent = {
      seq,
      id,
      type: draft.type,
      ts,
      payload: draft.payload,
      checksum,
      prevHash,
      hash,
    };
    this.db.run(
      "INSERT INTO events(seq,id,type,ts,payload,checksum,prev_hash,hash) VALUES(?,?,?,?,?,?,?,?)",
      seq,
      id,
      ev.type,
      ts,
      canonicalize(ev.payload),
      checksum,
      prevHash,
      hash,
    );
    this.applyEvent(ev);
    this.headSeq = seq;
    this.headHashValue = hash;
    return ev;
  }

  append(draft: DraftEvent): DEvent {
    let ev!: DEvent;
    const tx = this.db.transaction(() => {
      ev = this.appendInternal(draft);
    });
    tx();
    return ev;
  }

  /** Append several drafts atomically; on any failure none are applied. */
  appendMany(drafts: DraftEvent[]): DEvent[] {
    const out: DEvent[] = [];
    const tx = this.db.transaction(() => {
      for (const d of drafts) out.push(this.appendInternal(d));
    });
    tx();
    return out;
  }

  // ---- read ------------------------------------------------------------

  getEvent(seq: number): DEvent | null {
    const row = this.db
      .query<EventRow>("SELECT * FROM events WHERE seq = ?")
      .get(seq);
    return row ? this.rowToEvent(row) : null;
  }

  readEvents(opts: { fromSeq?: number; toSeq?: number; type?: DEventType } = {}): DEvent[] {
    const from = opts.fromSeq ?? 0;
    const to = opts.toSeq ?? Number.MAX_SAFE_INTEGER;
    const rows = opts.type
      ? this.db
          .query<EventRow>(
            "SELECT * FROM events WHERE seq >= ? AND seq <= ? AND type = ? ORDER BY seq",
          )
          .all(from, to, opts.type)
      : this.db
          .query<EventRow>("SELECT * FROM events WHERE seq >= ? AND seq <= ? ORDER BY seq")
          .all(from, to);
    return rows.map((r) => this.rowToEvent(r));
  }

  private rowToEvent(row: EventRow): DEvent {
    return {
      seq: row.seq,
      id: row.id,
      type: row.type as DEventType,
      ts: row.ts,
      payload: JSON.parse(row.payload),
      checksum: row.checksum,
      prevHash: row.prev_hash,
      hash: row.hash,
    };
  }

  // ---- projection: apply one event -------------------------------------

  applyEvent(ev: DEvent): void {
    const p = ev.payload as Record<string, any>;
    switch (ev.type) {
      case "NodeUpserted":
        this.pNodeUpsert(p, ev.seq);
        break;
      case "NodeStatusChanged":
        this.db.run("UPDATE nodes SET status = ?, updated_seq = ? WHERE id = ?", p.status, ev.seq, p.id);
        break;
      case "EdgeUpserted":
        this.pEdgeUpsert(p, ev.seq);
        break;
      case "EdgeRemoved":
        this.db.run("DELETE FROM edges WHERE id = ?", p.id);
        this.db.run("DELETE FROM stats WHERE scope_kind = 'edge' AND scope_id = ?", p.id);
        break;
      case "ZoneDefined":
        this.pZoneDefine(p, ev.seq);
        break;
      case "ZoneMembership":
        if (p.op === "add") this.db.run("INSERT OR IGNORE INTO zone_members(zone,node) VALUES(?,?)", p.zone, p.node);
        else this.db.run("DELETE FROM zone_members WHERE zone = ? AND node = ?", p.zone, p.node);
        break;
      case "EnforcementChanged":
        if (p.scope === "edge") this.db.run("UPDATE edges SET enforcement = ? WHERE id = ?", p.mode, p.id);
        else if (p.scope === "zone-intra") this.db.run("UPDATE zones SET intra = ? WHERE name = ?", p.mode, p.id);
        else if (p.scope === "zone-boundary") this.db.run("UPDATE zones SET boundary = ? WHERE name = ?", p.mode, p.id);
        break;
      case "CursorMoved":
        this.db.run("DELETE FROM cursor");
        for (const n of p.set as NodeId[]) this.db.run("INSERT OR IGNORE INTO cursor(node) VALUES(?)", n);
        break;
      case "TransitionTaken":
        if (p.from != null) this.db.run("DELETE FROM cursor WHERE node = ?", p.from);
        this.db.run("INSERT OR IGNORE INTO cursor(node) VALUES(?)", p.to);
        this.bumpVisit("edge", p.edgeId, ev.seq);
        this.bumpVisit("node", p.to, ev.seq);
        break;
      case "BlockedAttempt":
        if (p.edgeId) this.bumpCounter("edge", p.edgeId, "blocks", ev.seq);
        break;
      case "SoftViolation":
        if (p.edgeId) this.bumpCounter("edge", p.edgeId, "soft_violations", ev.seq);
        break;
      case "RewardApplied":
        this.pReward(p, ev.seq);
        break;
      case "ConfigSet":
        this.db.run(
          "INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
          "cfg:" + p.key,
          JSON.stringify(p.value),
        );
        break;
      case "CheckpointCreated":
        this.db.run(
          "INSERT INTO checkpoints(name,seq,snapshot_id,created_seq) VALUES(?,?,?,?) " +
            "ON CONFLICT(name) DO UPDATE SET seq = excluded.seq, snapshot_id = excluded.snapshot_id, created_seq = excluded.created_seq",
          p.name,
          p.seq,
          p.snapshotId,
          ev.seq,
        );
        break;
      case "Migrated":
      case "SnapshotTaken":
        // No projection-table effect: handled via side tables at emit time.
        break;
    }
  }

  private pNodeUpsert(p: Record<string, any>, seq: number): void {
    const existing = this.db.query<{ version: number; created_seq: number }>(
      "SELECT version, created_seq FROM nodes WHERE id = ?",
    ).get(p.id);
    const version = existing ? existing.version + 1 : 1;
    const createdSeq = existing ? existing.created_seq : seq;
    this.db.run(
      "INSERT INTO nodes(id,kind,label,payload,tags,status,version,created_seq,updated_seq,embedding) " +
        "VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET " +
        "kind=excluded.kind,label=excluded.label,payload=excluded.payload,tags=excluded.tags," +
        "status=excluded.status,version=excluded.version,updated_seq=excluded.updated_seq,embedding=excluded.embedding",
      p.id,
      p.kind,
      p.label,
      JSON.stringify(p.payload ?? {}),
      JSON.stringify(p.tags ?? []),
      p.status ?? "active",
      version,
      createdSeq,
      seq,
      p.embedding ? JSON.stringify(p.embedding) : null,
    );
    if (this.ftsEnabled) {
      this.db.run("DELETE FROM nodes_fts WHERE id = ?", p.id);
      const content = `${p.label} ${JSON.stringify(p.payload ?? {})} ${(p.tags ?? []).join(" ")}`;
      this.db.run("INSERT INTO nodes_fts(id, content) VALUES(?, ?)", p.id, content);
    }
  }

  private pEdgeUpsert(p: Record<string, any>, seq: number): void {
    const existing = this.db.query<{ version: number; created_seq: number }>(
      "SELECT version, created_seq FROM edges WHERE id = ?",
    ).get(p.id);
    const version = existing ? existing.version + 1 : 1;
    const createdSeq = existing ? existing.created_seq : seq;
    this.db.run(
      "INSERT INTO edges(id,src,dst,kind,label,guard,enforcement,weight,version,created_seq) " +
        "VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET " +
        "src=excluded.src,dst=excluded.dst,kind=excluded.kind,label=excluded.label,guard=excluded.guard," +
        "enforcement=excluded.enforcement,weight=excluded.weight,version=excluded.version",
      p.id,
      p.src,
      p.dst,
      p.kind,
      p.label ?? "",
      p.guard ?? null,
      p.enforcement ?? null,
      p.weight ?? 1,
      version,
      createdSeq,
    );
  }

  private pZoneDefine(p: Record<string, any>, seq: number): void {
    this.db.run(
      "INSERT INTO zones(name,intra,boundary,created_seq) VALUES(?,?,?,?) " +
        "ON CONFLICT(name) DO UPDATE SET intra=excluded.intra, boundary=excluded.boundary",
      p.name,
      p.intra ?? "soft",
      p.boundary ?? "hard",
      seq,
    );
    this.db.run("DELETE FROM zone_members WHERE zone = ?", p.name);
    for (const n of (p.members ?? []) as NodeId[]) {
      this.db.run("INSERT OR IGNORE INTO zone_members(zone,node) VALUES(?,?)", p.name, n);
    }
  }

  private pReward(p: Record<string, any>, seq: number): void {
    const alpha: number = p.alpha ?? 0.3;
    for (const sc of p.scopes as Array<{ kind: string; id: string; weight?: number }>) {
      const w = sc.weight ?? 1;
      const reward = (p.value as number) * w;
      this.ensureStat(sc.kind, sc.id);
      const s = this.db.query<{ ema_reward: number }>(
        "SELECT ema_reward FROM stats WHERE scope_kind = ? AND scope_id = ?",
      ).get(sc.kind, sc.id)!;
      const ema = s.ema_reward * (1 - alpha) + reward * alpha;
      const successCol = (p.value as number) >= 0 ? "successes" : "failures";
      this.db.run(
        `UPDATE stats SET ema_reward = ?, ${successCol} = ${successCol} + 1, last_seq = ? WHERE scope_kind = ? AND scope_id = ?`,
        ema,
        seq,
        sc.kind,
        sc.id,
      );
    }
  }

  private ensureStat(kind: string, id: string): void {
    this.db.run("INSERT OR IGNORE INTO stats(scope_kind, scope_id) VALUES(?,?)", kind, id);
  }
  private bumpVisit(kind: string, id: string, seq: number): void {
    this.ensureStat(kind, id);
    this.db.run(
      "UPDATE stats SET visits = visits + 1, last_seq = ? WHERE scope_kind = ? AND scope_id = ?",
      seq,
      kind,
      id,
    );
  }
  private bumpCounter(kind: string, id: string, col: "blocks" | "soft_violations", seq: number): void {
    this.ensureStat(kind, id);
    this.db.run(
      `UPDATE stats SET ${col} = ${col} + 1, last_seq = ? WHERE scope_kind = ? AND scope_id = ?`,
      seq,
      kind,
      id,
    );
  }

  // ---- replay / rebuild ------------------------------------------------

  private clearProjection(): void {
    for (const t of PROJECTION_TABLES) this.db.run(`DELETE FROM ${t}`);
    if (this.ftsEnabled) this.db.run("DELETE FROM nodes_fts");
  }

  /** Full rebuild from the entire log. Projection is a pure fold of events. */
  rebuild(): void {
    const tx = this.db.transaction(() => {
      this.clearProjection();
      for (const ev of this.readEvents()) this.applyEvent(ev);
    });
    tx();
  }

  // ---- snapshot --------------------------------------------------------

  /** Capture the projection at the current head into the snapshots side table. */
  snapshot(): string {
    const id = this.ids.next("S");
    const data = this.serializeProjection();
    this.db.run(
      "INSERT INTO snapshots(id, seq, ts, data) VALUES(?,?,?,?)",
      id,
      this.headSeq,
      this.now(),
      JSON.stringify(data),
    );
    // Record a pointer event so the log notes a snapshot existed at this seq.
    this.append({ type: "SnapshotTaken", payload: { snapshotId: id, seq: this.headSeq } });
    return id;
  }

  private serializeProjection(): Record<string, unknown[]> {
    const out: Record<string, unknown[]> = {};
    for (const t of PROJECTION_TABLES) {
      out[t] = this.db.query(`SELECT * FROM ${t}`).all();
    }
    return out;
  }

  private loadSnapshot(id: string): { seq: number } | null {
    const row = this.db.query<{ seq: number; data: string }>(
      "SELECT seq, data FROM snapshots WHERE id = ?",
    ).get(id);
    if (!row) return null;
    const data = JSON.parse(row.data) as Record<string, Record<string, unknown>[]>;
    const tx = this.db.transaction(() => {
      this.clearProjection();
      for (const t of PROJECTION_TABLES) {
        for (const rec of data[t] ?? []) {
          const cols = Object.keys(rec);
          const placeholders = cols.map(() => "?").join(",");
          this.db.run(
            `INSERT INTO ${t}(${cols.join(",")}) VALUES(${placeholders})`,
            ...cols.map((c) => rec[c] as unknown),
          );
        }
      }
      if (this.ftsEnabled) {
        this.db.run("DELETE FROM nodes_fts");
        for (const n of this.db.query<{ id: string; label: string; payload: string; tags: string }>(
          "SELECT id,label,payload,tags FROM nodes",
        ).all()) {
          const content = `${n.label} ${n.payload} ${(JSON.parse(n.tags) as string[]).join(" ")}`;
          this.db.run("INSERT INTO nodes_fts(id, content) VALUES(?, ?)", n.id, content);
        }
      }
    });
    tx();
    return { seq: row.seq };
  }

  latestSnapshotId(): string | null {
    const row = this.db.query<{ id: string }>(
      "SELECT id FROM snapshots ORDER BY seq DESC, id DESC LIMIT 1",
    ).get();
    return row ? row.id : null;
  }

  // ---- recovery --------------------------------------------------------

  /**
   * Boot recovery. Verify the hash chain; if a break is found (a crash that
   * truncated or corrupted the trailing write) trim the log to the last good
   * seq. Then load the newest snapshot at/under that seq and replay the tail.
   * Returns the recovery report.
   */
  recover(): { lastGoodSeq: number; trimmed: number; replayedFrom: number; snapshotId: string | null } {
    const integrity = this.verifyIntegrity();
    let trimmed = 0;
    if (!integrity.ok && integrity.firstBreakSeq != null) {
      const cut = integrity.firstBreakSeq - 1;
      const res = this.db.run("DELETE FROM events WHERE seq > ?", cut);
      trimmed = res.changes;
      this.loadHead();
    }
    // Pick newest snapshot whose seq <= head.
    const snapRow = this.db.query<{ id: string; seq: number }>(
      "SELECT id, seq FROM snapshots WHERE seq <= ? ORDER BY seq DESC LIMIT 1",
    ).get(this.headSeq);
    let replayFrom = 1;
    let snapshotId: string | null = null;
    if (snapRow) {
      this.loadSnapshot(snapRow.id);
      replayFrom = snapRow.seq + 1;
      snapshotId = snapRow.id;
    } else {
      this.clearProjection();
    }
    const tail = this.readEvents({ fromSeq: replayFrom });
    const tx = this.db.transaction(() => {
      for (const ev of tail) this.applyEvent(ev);
    });
    tx();
    return { lastGoodSeq: this.headSeq, trimmed, replayedFrom: replayFrom, snapshotId };
  }

  /** Discard events after `seq` (used by rollback). Caller rebuilds projection. */
  truncateAfter(seq: number): number {
    const res = this.db.run("DELETE FROM events WHERE seq > ?", seq);
    this.loadHead();
    return res.changes;
  }

  // ---- compaction ------------------------------------------------------

  /**
   * Snapshot, then prune events strictly before the snapshot seq minus the
   * retention window. Bounds both replay cost and disk while keeping `retain`
   * recent events for audit. Snapshots referenced by checkpoints are preserved.
   */
  compact(retain = 0): { snapshotId: string; pruned: number } {
    const snapshotId = this.snapshot();
    const snapSeq = this.headSeq; // SnapshotTaken bumped head; snapshot captured prior state
    const cutoff = Math.max(0, snapSeq - retain - 1);
    // Keep any event at/after the oldest snapshot still needed for recovery.
    const res = this.db.run("DELETE FROM events WHERE seq <= ? AND type != 'SnapshotTaken'", cutoff);
    return { snapshotId, pruned: res.changes };
  }

  // ---- integrity -------------------------------------------------------

  verifyIntegrity(): IntegrityReport {
    const rows = this.db.query<EventRow>("SELECT * FROM events ORDER BY seq").all();
    let prevHash = GENESIS_HASH;
    let checked = 0;
    let expectedSeq = 0;
    for (const row of rows) {
      checked++;
      expectedSeq++;
      if (row.seq !== expectedSeq) {
        return { ok: false, checkedEvents: checked, firstBreakSeq: row.seq, detail: `seq gap: expected ${expectedSeq}, got ${row.seq}` };
      }
      const payload = JSON.parse(row.payload);
      const checksum = eventChecksum(row.seq, row.type as DEventType, row.ts, payload);
      if (checksum !== row.checksum) {
        return { ok: false, checkedEvents: checked, firstBreakSeq: row.seq, detail: `checksum mismatch at seq ${row.seq}` };
      }
      if (row.prev_hash !== prevHash) {
        return { ok: false, checkedEvents: checked, firstBreakSeq: row.seq, detail: `prev_hash mismatch at seq ${row.seq}` };
      }
      const hash = eventHash(checksum, prevHash);
      if (hash !== row.hash) {
        return { ok: false, checkedEvents: checked, firstBreakSeq: row.seq, detail: `hash mismatch at seq ${row.seq}` };
      }
      prevHash = row.hash;
    }
    return { ok: true, checkedEvents: checked, firstBreakSeq: null, detail: null };
  }

  // ---- config (meta cfg:* rows) ---------------------------------------

  getConfig<T = unknown>(key: string): T | undefined {
    const row = this.db.query<{ value: string }>("SELECT value FROM meta WHERE key = ?").get("cfg:" + key);
    return row ? (JSON.parse(row.value) as T) : undefined;
  }

  // ---- row readers (typed) --------------------------------------------

  getNode(id: NodeId): DNode | null {
    const r = this.db.query<any>("SELECT * FROM nodes WHERE id = ?").get(id);
    return r ? rowToNode(r) : null;
  }
  /** Cheap status probe for hot paths: avoids parsing the full node row. */
  nodeStatus(id: NodeId): NodeStatus | null {
    const r = this.db.query<{ status: string }>("SELECT status FROM nodes WHERE id = ?").get(id);
    return r ? (r.status as NodeStatus) : null;
  }
  allNodes(): DNode[] {
    return this.db.query<any>("SELECT * FROM nodes").all().map(rowToNode);
  }
  getEdge(id: string): DEdge | null {
    const r = this.db.query<any>("SELECT * FROM edges WHERE id = ?").get(id);
    return r ? rowToEdge(r) : null;
  }
  allEdges(): DEdge[] {
    return this.db.query<any>("SELECT * FROM edges").all().map(rowToEdge);
  }
  outEdges(src: NodeId, kind?: string): DEdge[] {
    const rows = kind
      ? this.db.query<any>("SELECT * FROM edges WHERE src = ? AND kind = ?").all(src, kind)
      : this.db.query<any>("SELECT * FROM edges WHERE src = ?").all(src);
    return rows.map(rowToEdge);
  }
  inEdges(dst: NodeId, kind?: string): DEdge[] {
    const rows = kind
      ? this.db.query<any>("SELECT * FROM edges WHERE dst = ? AND kind = ?").all(dst, kind)
      : this.db.query<any>("SELECT * FROM edges WHERE dst = ?").all(dst);
    return rows.map(rowToEdge);
  }
  getZone(name: string): Zone | null {
    const z = this.db.query<any>("SELECT * FROM zones WHERE name = ?").get(name);
    if (!z) return null;
    const members = this.db.query<{ node: string }>("SELECT node FROM zone_members WHERE zone = ?").all(name).map((m) => m.node);
    return { name: z.name, intra: z.intra, boundary: z.boundary, members, createdSeq: z.created_seq };
  }
  allZones(): Zone[] {
    return this.db.query<{ name: string }>("SELECT name FROM zones").all().map((r) => this.getZone(r.name)!).filter(Boolean);
  }
  zonesOf(node: NodeId): string[] {
    return this.db.query<{ zone: string }>("SELECT zone FROM zone_members WHERE node = ?").all(node).map((r) => r.zone);
  }
  getStat(kind: string, id: string): Stat | null {
    const r = this.db.query<any>("SELECT * FROM stats WHERE scope_kind = ? AND scope_id = ?").get(kind, id);
    return r ? rowToStat(r) : null;
  }
  allStats(): Stat[] {
    return this.db.query<any>("SELECT * FROM stats").all().map(rowToStat);
  }
  snapshotSeq(id: string): number | null {
    const r = this.db.query<{ seq: number }>("SELECT seq FROM snapshots WHERE id = ?").get(id);
    return r ? r.seq : null;
  }
  allZoneMembers(): Array<{ zone: string; node: string }> {
    return this.db.query<{ zone: string; node: string }>("SELECT zone, node FROM zone_members").all();
  }
  cursor(): NodeId[] {
    return this.db.query<{ node: string }>("SELECT node FROM cursor").all().map((r) => r.node);
  }

  close(): void {
    this.db.close();
  }
}

// ---- row mappers --------------------------------------------------------

function rowToNode(r: any): DNode {
  return {
    id: r.id,
    kind: r.kind,
    label: r.label,
    payload: JSON.parse(r.payload),
    tags: JSON.parse(r.tags),
    status: r.status,
    version: r.version,
    createdSeq: r.created_seq,
    updatedSeq: r.updated_seq,
    embedding: r.embedding ? JSON.parse(r.embedding) : null,
  };
}
function rowToEdge(r: any): DEdge {
  return {
    id: r.id,
    src: r.src,
    dst: r.dst,
    kind: r.kind,
    label: r.label,
    guard: r.guard,
    enforcement: r.enforcement,
    weight: r.weight,
    version: r.version,
    createdSeq: r.created_seq,
  };
}
function rowToStat(r: any): Stat {
  return {
    scopeKind: r.scope_kind,
    scopeId: r.scope_id,
    visits: r.visits,
    successes: r.successes,
    failures: r.failures,
    softViolations: r.soft_violations,
    blocks: r.blocks,
    emaReward: r.ema_reward,
    lastSeq: r.last_seq,
  };
}

export { sha256 };
