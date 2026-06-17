// Public surface. The DState facade plus the evolve/validate/checkpoint/render/
// history operations, exposed both as standalone functions and (for ergonomics)
// as methods on DState so the agent calls everything through one object. This is
// the API the agent uses to remember, decide, and optimize itself.

import { DState } from "./engine.ts";
import * as evolveM from "./evolve.ts";
import * as validateM from "./validate.ts";
import * as checkpointM from "./checkpoint.ts";
import * as renderM from "./render.ts";
import { history } from "./history.ts";
import type { HistoryFilter, HistoryEntry } from "./history.ts";
import { exportState } from "./portability.ts";
import type { ExportBundle } from "./portability.ts";
import type { Result } from "./errors.ts";
import type { ValidationReport, IntegrityReport } from "./types.ts";
import type { OptimizeSuggestion } from "./evolve.ts";
import type { Metrics } from "./render.ts";

declare module "./engine.ts" {
  interface DState {
    splitState(nodeId: string, newId: string, moveEdgeIds: string[]): Result<{ from: string; to: string }>;
    mergeStates(a: string, b: string): Result<{ into: string }>;
    gc(): { deprecated: string[]; prunedEdges: number };
    migrate(kind: string, apply: (p: Record<string, unknown>) => Record<string, unknown>, toVersion?: number): Result<{ migrated: number }>;
    optimize(): OptimizeSuggestion[];
    reweight(): { reweighted: number };
    selfIterate(): Result<{ applied: OptimizeSuggestion[]; reweighted: number; valid: boolean }>;
    validate(): ValidationReport;
    repair(): { fixed: unknown[]; quarantined: unknown[] };
    verifyIntegrity(): IntegrityReport;
    checkpoint(name: string): Result<{ seq: number }>;
    rollback(name: string): Result<{ seq: number }>;
    listCheckpoints(): Array<{ name: string; seq: number }>;
    branch(filename: string): Result<DState>;
    merge(branchDs: DState): Result<{ merged: number }>;
    discard(): void;
    render(): string;
    metrics(): Metrics;
    toMermaid(): string;
    toDot(): string;
    history(filter?: HistoryFilter): HistoryEntry[];
    snapshot(): string;
    compact(retain?: number): { snapshotId: string; pruned: number };
    export(): ExportBundle;
  }
}

const ext: ThisType<DState> & Record<string, (...args: any[]) => unknown> = {
  splitState(nodeId: string, newId: string, moveEdgeIds: string[]) {
    return evolveM.splitState(this, nodeId, newId, moveEdgeIds);
  },
  mergeStates(a: string, b: string) {
    return evolveM.mergeStates(this, a, b);
  },
  gc() {
    return evolveM.gc(this);
  },
  migrate(kind: string, apply: (p: Record<string, unknown>) => Record<string, unknown>, toVersion?: number) {
    return evolveM.migrate(this, kind, apply, toVersion);
  },
  optimize() {
    return evolveM.optimize(this);
  },
  reweight() {
    return evolveM.reweight(this);
  },
  selfIterate() {
    return evolveM.selfIterate(this);
  },
  validate() {
    return validateM.validate(this);
  },
  repair() {
    return validateM.repair(this);
  },
  verifyIntegrity() {
    return validateM.verifyIntegrity(this);
  },
  checkpoint(name: string) {
    return checkpointM.checkpoint(this, name);
  },
  rollback(name: string) {
    return checkpointM.rollback(this, name);
  },
  listCheckpoints() {
    return checkpointM.listCheckpoints(this);
  },
  branch(filename: string) {
    return checkpointM.branch(this, filename);
  },
  merge(branchDs: DState) {
    return checkpointM.merge(this, branchDs);
  },
  discard() {
    return checkpointM.discard(this);
  },
  render() {
    return renderM.render(this);
  },
  metrics() {
    return renderM.metrics(this);
  },
  toMermaid() {
    return renderM.toMermaid(this);
  },
  toDot() {
    return renderM.toDot(this);
  },
  history(filter?: HistoryFilter) {
    return history(this, filter);
  },
  snapshot() {
    return this.store.snapshot();
  },
  compact(retain?: number) {
    return this.store.compact(retain);
  },
  export() {
    return exportState(this);
  },
};

Object.assign(DState.prototype, ext);

export { DState };
export type { DStateOptions, RememberInput, RecallQuery, LinkOptions, RewardOptions, MoveInfo, Tunables } from "./engine.ts";
export * from "./types.ts";
export { DStateError, ok, err, isOk, isErr, unwrap } from "./errors.ts";
export type { Result, DStateErrorCode } from "./errors.ts";
export { DEFAULT_TUNABLES } from "./config.ts";
export { compileGuard, evalGuard } from "./guard.ts";
export { exportState, importState } from "./portability.ts";
export type { ExportBundle } from "./portability.ts";
export type { OptimizeSuggestion } from "./evolve.ts";
export type { HistoryFilter, HistoryEntry } from "./history.ts";
export type { Metrics } from "./render.ts";
export { IdGen, isValidId } from "./ids.ts";
