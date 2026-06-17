// Data model first. dstate is an event-sourced DAG+FSM: the event log is the
// single source of truth; every other table is a deterministic projection of it.
//
// A graph node is simultaneously memory (its `payload`), an FSM state (the
// cursor can sit on it), and a DAG node (dependency edges order it). Edges carry
// policy (guard + enforcement) and accrue intuition (stats). One structure,
// three readings.

export type NodeStatus = "active" | "archived" | "deprecated";
export type EdgeKind = "transition" | "dependency";
export type EnforcementMode = "off" | "soft" | "hard";
export type ScopeKind = "node" | "edge";

export type NodeId = string;
export type EdgeId = string;
export type EventId = string;

export interface DNode {
  id: NodeId;
  /** free-form type tag, e.g. "state", "fact", "task" */
  kind: string;
  label: string;
  /** arbitrary JSON: this is the node's memory cell */
  payload: Record<string, unknown>;
  tags: string[];
  status: NodeStatus;
  /** bumped on every update; basis for optimistic concurrency */
  version: number;
  createdSeq: number;
  updatedSeq: number;
  /** optional dense vector for similarity recall; null when no embedder */
  embedding: number[] | null;
}

export interface DEdge {
  id: EdgeId;
  src: NodeId;
  dst: NodeId;
  kind: EdgeKind;
  label: string;
  /** guard DSL expression; null = always-pass */
  guard: string | null;
  /** per-edge override; null = inherit from zone/global */
  enforcement: EnforcementMode | null;
  /** intuition prior; biases suggest() ranking */
  weight: number;
  version: number;
  createdSeq: number;
}

export interface Zone {
  name: string;
  /** enforcement for transitions whose endpoints are both inside the zone */
  intra: EnforcementMode;
  /** enforcement for transitions crossing the zone boundary */
  boundary: EnforcementMode;
  members: NodeId[];
  createdSeq: number;
}

export interface Stat {
  scopeKind: ScopeKind;
  scopeId: string;
  visits: number;
  successes: number;
  failures: number;
  softViolations: number;
  blocks: number;
  /** exponential moving average of reward, decayed by recency */
  emaReward: number;
  /** seq at which this stat was last touched (for decay math) */
  lastSeq: number;
}

export interface Checkpoint {
  name: string;
  seq: number;
  snapshotId: string;
  createdSeq: number;
}

// ---- events -------------------------------------------------------------

export type DEventType =
  | "NodeUpserted"
  | "NodeStatusChanged"
  | "EdgeUpserted"
  | "EdgeRemoved"
  | "ZoneDefined"
  | "ZoneMembership"
  | "EnforcementChanged"
  | "CursorMoved"
  | "TransitionTaken"
  | "BlockedAttempt"
  | "SoftViolation"
  | "RewardApplied"
  | "ConfigSet"
  | "SnapshotTaken"
  | "CheckpointCreated"
  | "Migrated";

export interface DEvent<P = Record<string, unknown>> {
  seq: number;
  id: EventId;
  type: DEventType;
  ts: number;
  payload: P;
  /** sha256 over the canonical (seq,type,ts,payload) tuple */
  checksum: string;
  /** hash of the previous event, linking the chain */
  prevHash: string;
  /** sha256(checksum + prevHash): this event's link in the chain */
  hash: string;
}

/** A pending mutation before it is sealed into the log. */
export interface DraftEvent<P = Record<string, unknown>> {
  type: DEventType;
  payload: P;
}

// ---- decision / enforcement results ------------------------------------

export type Decision = "allow" | "warn" | "deny";

export interface DecisionTrace {
  decision: Decision;
  /** which level set the effective enforcement */
  enforcementSource: "edge" | "zone" | "global" | "none";
  effectiveEnforcement: EnforcementMode;
  guard: { present: boolean; passed: boolean; reason?: string };
  boundary: { crossing: boolean; gated: boolean; zoneFrom?: string; zoneTo?: string };
  escalation: { soft_violations: number; promoted: boolean };
  reasons: string[];
}

export interface TransitionOutcome {
  applied: boolean;
  from: NodeId | null;
  to: NodeId;
  edgeId: EdgeId | null;
  trace: DecisionTrace;
}

// ---- intuition ----------------------------------------------------------

export interface Suggestion {
  edgeId: EdgeId;
  to: NodeId;
  /** combined exploit+explore score */
  score: number;
  /** [0,1] confidence; low means thin data */
  confidence: number;
  enforcement: EnforcementMode;
  visits: number;
  emaReward: number;
}

// ---- validation ---------------------------------------------------------

export type ViolationKind =
  | "DagCycle"
  | "DanglingEdge"
  | "TransitionToDeadNode"
  | "CursorOnDeadNode"
  | "OrphanStat"
  | "DanglingZoneMember"
  | "HashChainBreak"
  | "ChecksumMismatch"
  | "DuplicateId";

export interface Violation {
  kind: ViolationKind;
  locus: string;
  detail: string;
  fixable: boolean;
}

export interface ValidationReport {
  ok: boolean;
  violations: Violation[];
}

export interface IntegrityReport {
  ok: boolean;
  checkedEvents: number;
  firstBreakSeq: number | null;
  detail: string | null;
}
