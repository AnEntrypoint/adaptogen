// Machine-readable self-description so an agent can introspect dstate's full
// surface without reading source: the verbs it can call, the typed error codes a
// Result may carry, the guard DSL grammar, and the enforcement levels. Pure data
// plus describe(); ASCII only.

import { ERROR_CODES } from "./errors.js";

export const MANIFEST = {
  name: "dstate",
  summary:
    "Agent-owned, self-evolving DAG+FSM state store: durable memory, policy, and intuition in one event-sourced graph.",
  enforcement: {
    levels: ["off", "soft", "hard"],
    meaning: {
      off: "transition always allowed (an explicit gate through a boundary)",
      soft: "transition warned and recorded as a soft violation, still applied",
      hard: "transition denied",
    },
  },
  errorCodes: ERROR_CODES,
  guardDSL: {
    summary:
      "loop-free, depth- and length-bounded predicate over a read-only context; no eval/Function; own-property paths only (rejects __proto__/prototype/constructor)",
    operators: ["&&", "||", "!", "==", "!=", ">", ">=", "<", "<=", "in", "has"],
    literals: ["number", "'string'", "true", "false", "null", "[a, b, ...]"],
    context: [
      "from", "to", "fromTags", "toTags", "fromKind", "toKind",
      "edge.label", "edge.weight",
      "stat.visits", "stat.emaReward", "stat.successes", "stat.failures",
      "vars.*",
    ],
    example: "to.ready == true && stat.failures < 3",
  },
  verbs: {
    memory: [
      ["remember", "{ id, kind?, label?, payload?, tags?, status?, embedding?, expectVersion? } -> Result<DNode>"],
      ["getNode", "(id) -> DNode | null"],
      ["recall", "({ id?, kind?, tag?, status?, text?, embedding?, limit? }) -> DNode[]"],
      ["setStatus", "(id, status) -> Result<DNode>"],
      ["archive", "(id) -> Result<DNode>"],
      ["deprecate", "(id) -> Result<DNode>"],
    ],
    edges: [
      ["link", "(from, to, { id?, kind?, label?, guard?, enforcement?, weight? }) -> Result<DEdge>"],
      ["depend", "(node, prereq, opts?) -> Result<DEdge>"],
      ["unlink", "(edgeId) -> Result<true>"],
      ["setEnforcement", "(edgeId, mode) -> Result<DEdge>"],
    ],
    fsm: [
      ["cursor", "() -> NodeId[]"],
      ["setCursor", "(nodes) -> Result<NodeId[]>"],
      ["legalMoves", "(vars?) -> MoveInfo[]"],
      ["explainTransition", "(to, vars?) -> Result<DecisionTrace>"],
      ["transition", "(to, vars?) -> Result<TransitionOutcome>"],
      ["suggest", "(vars?) -> Suggestion[]"],
      ["reward", "(value, { edgeId?, trace?, depth?, lambda? }) -> Result"],
    ],
    dag: [
      ["ready", "(done?) -> NodeId[]"],
      ["topo", "() -> { order, cyclic }"],
      ["reachable", "(from, kind?) -> NodeId[]"],
      ["ancestors", "(of, kind?) -> NodeId[]"],
      ["descendants", "(of, kind?) -> NodeId[]"],
    ],
    zones: [
      ["defineZone", "(name, members, { intra?, boundary? }) -> Result<Zone>"],
      ["addToZone", "(name, node) -> Result<Zone>"],
      ["removeFromZone", "(name, node) -> Result<Zone>"],
      ["deriveZone", "(seed, predicate?) -> Result<{ members }>"],
      ["zones", "() -> Zone[]"],
    ],
    evolve: [
      ["splitState", "(nodeId, newId, moveEdgeIds) -> Result"],
      ["mergeStates", "(a, b) -> Result"],
      ["gc", "() -> { deprecated, prunedEdges }"],
      ["migrate", "(kind, apply, toVersion?) -> Result"],
      ["optimize", "() -> OptimizeSuggestion[]"],
      ["reweight", "() -> { reweighted }"],
      ["selfIterate", "() -> Result"],
    ],
    integrity: [
      ["validate", "() -> ValidationReport"],
      ["repair", "() -> { fixed, quarantined }"],
      ["verifyIntegrity", "() -> IntegrityReport"],
    ],
    durability: [
      ["checkpoint", "(name) -> Result<{ seq }>"],
      ["rollback", "(name) -> Result<{ seq }>"],
      ["listCheckpoints", "() -> { name, seq }[]"],
      ["branch", "(filename) -> Result<DState>"],
      ["merge", "(branchDs) -> Result<{ merged }>"],
      ["discard", "() -> void"],
      ["snapshot", "() -> string"],
      ["compact", "(retain?) -> { snapshotId, pruned }"],
      ["export", "() -> ExportBundle"],
    ],
    config: [
      ["getTunables", "() -> Tunables"],
      ["setTunable", "(key, value) -> Result<Tunables>"],
    ],
    observe: [
      ["render", "() -> string (ASCII live view)"],
      ["metrics", "() -> Metrics"],
      ["toMermaid", "() -> string"],
      ["toDot", "() -> string"],
      ["history", "(filter?) -> HistoryEntry[]"],
      ["describe", "() -> this manifest"],
    ],
  },
};
