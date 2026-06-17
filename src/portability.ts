// Portable export/import. State is project-resident, never platform-resident:
// the full history serializes to plain JSON (event drafts in order) and replays
// into a fresh store, reconstructing an identical projection and a fresh, valid
// hash chain. Storage-pointer events (snapshots/checkpoints) are omitted; they
// are local optimizations, not part of the portable truth.

import { DState } from "./engine.ts";
import type { DStateOptions } from "./engine.ts";
import { SCHEMA_VERSION } from "./schema.ts";
import type { DEventType } from "./types.ts";

export interface ExportBundle {
  schema_version: number;
  events: Array<{ type: DEventType; payload: Record<string, unknown> }>;
}

const SKIP: DEventType[] = ["SnapshotTaken", "CheckpointCreated"];

export function exportState(ds: DState): ExportBundle {
  return {
    schema_version: SCHEMA_VERSION,
    events: ds.store
      .readEvents()
      .filter((e) => !SKIP.includes(e.type))
      .map((e) => ({ type: e.type, payload: e.payload })),
  };
}

export function importState(filename: string, bundle: ExportBundle, opts: DStateOptions = {}): DState {
  const ds = DState.open(filename, { ...opts, seed: false });
  ds.store.appendMany(bundle.events.map((e) => ({ type: e.type, payload: e.payload })));
  return ds;
}
