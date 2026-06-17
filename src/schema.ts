// Schema DDL + migrations. The log (`events`), side tables (`snapshots`,
// `checkpoints`, `meta`) and the projection tables (`nodes`, `edges`, `zones`,
// `zone_members`, `stats`, `cursor`, `nodes_fts`) are all created here. Only the
// projection tables are cleared by rebuild(); everything else is durable.

import { Database } from "bun:sqlite";

export const SCHEMA_VERSION = 1;

export const PROJECTION_TABLES = [
  "nodes",
  "edges",
  "zones",
  "zone_members",
  "stats",
  "cursor",
] as const;

const DDL = `
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  seq       INTEGER PRIMARY KEY,
  id        TEXT NOT NULL,
  type      TEXT NOT NULL,
  ts        INTEGER NOT NULL,
  payload   TEXT NOT NULL,
  checksum  TEXT NOT NULL,
  prev_hash TEXT NOT NULL,
  hash      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);

CREATE TABLE IF NOT EXISTS nodes (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL,
  label       TEXT NOT NULL,
  payload     TEXT NOT NULL,
  tags        TEXT NOT NULL,
  status      TEXT NOT NULL,
  version     INTEGER NOT NULL,
  created_seq INTEGER NOT NULL,
  updated_seq INTEGER NOT NULL,
  embedding   TEXT
);
CREATE INDEX IF NOT EXISTS idx_nodes_status ON nodes(status);
CREATE INDEX IF NOT EXISTS idx_nodes_kind   ON nodes(kind);

CREATE TABLE IF NOT EXISTS edges (
  id          TEXT PRIMARY KEY,
  src         TEXT NOT NULL,
  dst         TEXT NOT NULL,
  kind        TEXT NOT NULL,
  label       TEXT NOT NULL,
  guard       TEXT,
  enforcement TEXT,
  weight      REAL NOT NULL,
  version     INTEGER NOT NULL,
  created_seq INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_edges_src  ON edges(src);
CREATE INDEX IF NOT EXISTS idx_edges_dst  ON edges(dst);
CREATE INDEX IF NOT EXISTS idx_edges_kind ON edges(kind);

CREATE TABLE IF NOT EXISTS zones (
  name        TEXT PRIMARY KEY,
  intra       TEXT NOT NULL,
  boundary    TEXT NOT NULL,
  created_seq INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS zone_members (
  zone TEXT NOT NULL,
  node TEXT NOT NULL,
  PRIMARY KEY (zone, node)
);
CREATE INDEX IF NOT EXISTS idx_zone_members_node ON zone_members(node);

CREATE TABLE IF NOT EXISTS stats (
  scope_kind      TEXT NOT NULL,
  scope_id        TEXT NOT NULL,
  visits          INTEGER NOT NULL DEFAULT 0,
  successes       INTEGER NOT NULL DEFAULT 0,
  failures        INTEGER NOT NULL DEFAULT 0,
  soft_violations INTEGER NOT NULL DEFAULT 0,
  blocks          INTEGER NOT NULL DEFAULT 0,
  ema_reward      REAL NOT NULL DEFAULT 0,
  last_seq        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (scope_kind, scope_id)
);

CREATE TABLE IF NOT EXISTS cursor (
  node TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS snapshots (
  id   TEXT PRIMARY KEY,
  seq  INTEGER NOT NULL,
  ts   INTEGER NOT NULL,
  data TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS checkpoints (
  name        TEXT PRIMARY KEY,
  seq         INTEGER NOT NULL,
  snapshot_id TEXT NOT NULL,
  created_seq INTEGER NOT NULL
);
`;

export function createSchema(db: Database, ftsEnabled: boolean): void {
  db.exec(DDL);
  if (ftsEnabled) {
    // External-content-free FTS: id stored UNINDEXED so we can map matches back.
    db.run(
      "CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(id UNINDEXED, content);",
    );
  }
  runMigrations(db);
}

function runMigrations(db: Database): void {
  const row = db
    .query<{ value: string }>("SELECT value FROM meta WHERE key = 'schema_version'")
    .get();
  const current = row ? Number(row.value) : 0;
  // Forward migrations would live here, keyed on `current`. v1 is the baseline.
  if (current < SCHEMA_VERSION) {
    db.run(
      "INSERT INTO meta(key, value) VALUES('schema_version', ?) " +
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      String(SCHEMA_VERSION),
    );
  }
}
