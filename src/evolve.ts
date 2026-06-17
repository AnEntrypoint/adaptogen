// Self-evolution: the structural and policy edits the agent applies to its own
// graph, plus optimize() which mines accumulated signal for what to change.
// Everything routes through the engine's event-sourced verbs, so every evolution
// is replayable and reversible. selfIterate() ties it into a safe closed loop:
// reweight -> apply safe suggestions -> validate -> rollback on regression.

import type { DState } from "./engine.ts";
import { ok, fail } from "./errors.ts";
import type { Result } from "./errors.ts";
import { reachable } from "./graph.ts";
import type { NodeId } from "./types.ts";
import { validate } from "./validate.ts";
import { checkpoint, rollback } from "./checkpoint.ts";

export interface OptimizeSuggestion {
  kind: "gc-dead-node" | "merge-duplicate-edge" | "prune-low-value-edge" | "promote-soft-to-hard" | "tighten-zone";
  target: string;
  detail: string;
  score: number;
}

/** Clone a node into newId and move the named out-edges onto the clone. */
export function splitState(ds: DState, nodeId: NodeId, newId: string, moveEdgeIds: string[]): Result<{ from: NodeId; to: NodeId }> {
  const node = ds.store.getNode(nodeId);
  if (!node) return fail("NotFound", `node ${nodeId} not found`);
  if (ds.store.getNode(newId)) return fail("DuplicateId", `node ${newId} already exists`);
  const created = ds.remember({ id: newId, kind: node.kind, label: `${node.label} (split)`, payload: { ...node.payload }, tags: node.tags });
  if (!created.ok) return created;
  for (const eid of moveEdgeIds) {
    const e = ds.store.getEdge(eid);
    if (!e || e.src !== nodeId) continue;
    ds.store.append({ type: "EdgeRemoved", payload: { id: eid } });
    ds.store.append({
      type: "EdgeUpserted",
      payload: { id: eid, src: newId, dst: e.dst, kind: e.kind, label: e.label, guard: e.guard, enforcement: e.enforcement, weight: e.weight },
    });
  }
  return ok({ from: nodeId, to: newId });
}

/** Rewire all of b's edges onto a, union payloads, archive b. */
export function mergeStates(ds: DState, a: NodeId, b: NodeId): Result<{ into: NodeId }> {
  const na = ds.store.getNode(a);
  const nb = ds.store.getNode(b);
  if (!na || !nb) return fail("NotFound", `merge needs both nodes`);
  ds.remember({ id: a, payload: { ...nb.payload, ...na.payload }, tags: [...new Set([...na.tags, ...nb.tags])] });
  for (const e of ds.store.outEdges(b)) {
    ds.store.append({ type: "EdgeRemoved", payload: { id: e.id } });
    if (e.dst !== a) {
      ds.store.append({ type: "EdgeUpserted", payload: { id: ds.ids.next("G"), src: a, dst: e.dst, kind: e.kind, label: e.label, guard: e.guard, enforcement: e.enforcement, weight: e.weight } });
    }
  }
  for (const e of ds.store.inEdges(b)) {
    ds.store.append({ type: "EdgeRemoved", payload: { id: e.id } });
    if (e.src !== a) {
      ds.store.append({ type: "EdgeUpserted", payload: { id: ds.ids.next("G"), src: e.src, dst: a, kind: e.kind, label: e.label, guard: e.guard, enforcement: e.enforcement, weight: e.weight } });
    }
  }
  ds.store.append({ type: "NodeStatusChanged", payload: { id: b, status: "deprecated" } });
  return ok({ into: a });
}

/** Deprecate nodes unreachable from the cursor and never visited; prune their edges. */
export function gc(ds: DState): { deprecated: NodeId[]; prunedEdges: number } {
  const live = new Set<NodeId>();
  for (const c of ds.store.cursor()) {
    live.add(c);
    for (const r of reachable(ds.store, c, "transition")) live.add(r);
  }
  const deprecated: NodeId[] = [];
  let pruned = 0;
  for (const n of ds.store.allNodes()) {
    if (n.status !== "active") continue;
    if (live.has(n.id)) continue;
    if (n.tags.includes("seed")) continue;
    const stat = ds.store.getStat("node", n.id);
    if (stat && stat.visits > 0) continue;
    ds.store.append({ type: "NodeStatusChanged", payload: { id: n.id, status: "deprecated" } });
    deprecated.push(n.id);
    for (const e of [...ds.store.outEdges(n.id), ...ds.store.inEdges(n.id)]) {
      ds.store.append({ type: "EdgeRemoved", payload: { id: e.id } });
      pruned++;
    }
  }
  return { deprecated, prunedEdges: pruned };
}

/** Migrate every node of `kind` by applying `apply` to its payload. */
export function migrate(ds: DState, kind: string, apply: (p: Record<string, unknown>) => Record<string, unknown>, toVersion = 0): Result<{ migrated: number }> {
  let count = 0;
  for (const n of ds.store.allNodes()) {
    if (n.kind !== kind) continue;
    let next: Record<string, unknown>;
    try {
      next = apply({ ...n.payload });
    } catch (e) {
      return fail("MigrationError", `migrate failed on ${n.id}: ${(e as Error).message}`);
    }
    ds.remember({ id: n.id, payload: next });
    count++;
  }
  ds.store.append({ type: "Migrated", payload: { kind, toVersion, migrated: count } });
  return ok({ migrated: count });
}

/** Mine the graph + stats for structural improvements. Read-only; returns a plan. */
export function optimize(ds: DState): OptimizeSuggestion[] {
  const out: OptimizeSuggestion[] = [];
  const live = new Set<NodeId>();
  for (const c of ds.store.cursor()) {
    live.add(c);
    for (const r of reachable(ds.store, c, "transition")) live.add(r);
  }
  for (const n of ds.store.allNodes()) {
    if (n.status !== "active" || n.tags.includes("seed")) continue;
    const stat = ds.store.getStat("node", n.id);
    if (!live.has(n.id) && (!stat || stat.visits === 0)) {
      out.push({ kind: "gc-dead-node", target: n.id, detail: `unreachable and never visited`, score: 0.9 });
    }
  }
  const seen = new Map<string, string>();
  for (const e of ds.store.allEdges()) {
    const key = `${e.src}>${e.dst}:${e.kind}`;
    if (seen.has(key)) {
      out.push({ kind: "merge-duplicate-edge", target: e.id, detail: `duplicate of ${seen.get(key)}`, score: 0.7 });
    } else {
      seen.set(key, e.id);
    }
    const stat = ds.store.getStat("edge", e.id);
    if (stat && stat.visits >= 3 && stat.emaReward < 0) {
      out.push({ kind: "prune-low-value-edge", target: e.id, detail: `ema ${stat.emaReward.toFixed(2)} over ${stat.visits} visits`, score: 0.6 });
    }
    const threshold = ds.getTunables().escalationThreshold;
    if (stat && threshold > 0 && e.enforcement !== "hard" && stat.softViolations >= threshold) {
      out.push({ kind: "promote-soft-to-hard", target: e.id, detail: `${stat.softViolations} soft violations >= ${threshold}`, score: 0.8 });
    }
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}

/** Recompute transition edge weights from accumulated reward to bias suggest(). */
export function reweight(ds: DState): { reweighted: number } {
  let count = 0;
  for (const e of ds.store.allEdges()) {
    if (e.kind !== "transition") continue;
    const stat = ds.store.getStat("edge", e.id);
    const weight = Math.max(0.01, 1 + (stat?.emaReward ?? 0));
    ds.store.append({ type: "EdgeUpserted", payload: { id: e.id, src: e.src, dst: e.dst, kind: e.kind, label: e.label, guard: e.guard, enforcement: e.enforcement, weight } });
    count++;
  }
  return { reweighted: count };
}

/**
 * One safe self-improvement iteration. Checkpoint, reweight, apply the safe
 * subset of optimize() suggestions (gc + soft->hard promotion), then validate.
 * On a broken invariant, roll back to the checkpoint and report the failure.
 */
export function selfIterate(ds: DState): Result<{ applied: OptimizeSuggestion[]; reweighted: number; valid: boolean }> {
  const cpName = "self-iterate-" + ds.store.lastSeq();
  checkpoint(ds, cpName);
  const { reweighted } = reweight(ds);
  const suggestions = optimize(ds);
  const applied: OptimizeSuggestion[] = [];
  for (const s of suggestions) {
    if (s.kind === "gc-dead-node") {
      ds.setStatus(s.target, "deprecated");
      applied.push(s);
    } else if (s.kind === "promote-soft-to-hard") {
      ds.setEnforcement(s.target, "hard");
      applied.push(s);
    }
  }
  const report = validate(ds);
  if (!report.ok) {
    rollback(ds, cpName);
    return fail("Conflict", `self-iteration broke invariants: ${report.violations.map((v) => v.kind).join(",")}`);
  }
  return ok({ applied, reweighted, valid: true });
}
