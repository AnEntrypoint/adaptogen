// Database open + pragmas. WAL for durability under crash, NORMAL sync for the
// WAL fast path, foreign_keys on, a busy_timeout so concurrent readers wait
// rather than erroring. FTS5 is probed once and its availability cached: the
// recall path degrades to LIKE when the build lacks it.

import { Database } from "bun:sqlite";

export interface OpenResult {
  db: Database;
  ftsEnabled: boolean;
}

export function openDatabase(filename: string): OpenResult {
  const db = new Database(filename);
  // PRAGMAs: in-memory dbs ignore journal_mode but the calls are harmless.
  db.run("PRAGMA journal_mode = WAL;");
  db.run("PRAGMA synchronous = NORMAL;");
  db.run("PRAGMA foreign_keys = ON;");
  db.run("PRAGMA busy_timeout = 5000;");
  const ftsEnabled = probeFts(db);
  return { db, ftsEnabled };
}

function probeFts(db: Database): boolean {
  try {
    db.run("CREATE VIRTUAL TABLE IF NOT EXISTS __fts_probe USING fts5(x);");
    db.run("DROP TABLE IF EXISTS __fts_probe;");
    return true;
  } catch {
    return false;
  }
}
