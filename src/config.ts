// Tunables the agent reads and sets to optimize itself. Stored as ConfigSet
// events (cfg:* meta rows) so changes are durable and auditable. Each setter is
// range-checked: an out-of-range knob is a typed InvalidConfig error, never a
// silently-accepted bad value.

import type { EnforcementMode } from "./types.ts";
import { ok, fail } from "./errors.ts";
import type { Result } from "./errors.ts";

export interface Tunables {
  /** fallback enforcement for a failing guard with no edge override */
  defaultEnforcement: EnforcementMode;
  /** soft violations on an edge before it auto-promotes to hard; 0 = never */
  escalationThreshold: number;
  /** clean transitions on a promoted edge before it demotes back to soft; 0 = never */
  demotionCleanRuns: number;
  /** seq distance over which ema reward influence halves */
  decayHalfLife: number;
  /** UCB exploration constant */
  ucbC: number;
  /** exploration policy for suggest() */
  explore: "ucb" | "epsilon" | "greedy";
  /** epsilon for epsilon-greedy */
  epsilon: number;
  /** ema alpha for reward updates */
  rewardAlpha: number;
  /** ops between auto-snapshots; 0 = off */
  snapshotInterval: number;
  /** events retained past a snapshot on compaction */
  retain: number;
  /** hard cap on a node payload's serialized size */
  maxPayloadBytes: number;
}

export const DEFAULT_TUNABLES: Tunables = {
  defaultEnforcement: "soft",
  escalationThreshold: 3,
  demotionCleanRuns: 5,
  decayHalfLife: 200,
  ucbC: 1.4,
  explore: "ucb",
  epsilon: 0.1,
  rewardAlpha: 0.3,
  snapshotInterval: 200,
  retain: 1000,
  maxPayloadBytes: 256 * 1024,
};

const MODES: EnforcementMode[] = ["off", "soft", "hard"];

export function validateTunable(key: keyof Tunables, value: unknown): Result<unknown> {
  switch (key) {
    case "defaultEnforcement":
      return MODES.includes(value as EnforcementMode)
        ? ok(value)
        : fail("InvalidConfig", `defaultEnforcement must be off|soft|hard`);
    case "explore":
      return ["ucb", "epsilon", "greedy"].includes(value as string)
        ? ok(value)
        : fail("InvalidConfig", `explore must be ucb|epsilon|greedy`);
    case "epsilon":
      return isNum(value, 0, 1) ? ok(value) : fail("InvalidConfig", "epsilon in [0,1]");
    case "rewardAlpha":
      return isNum(value, 0, 1) ? ok(value) : fail("InvalidConfig", "rewardAlpha in [0,1]");
    case "ucbC":
      return isNum(value, 0, 100) ? ok(value) : fail("InvalidConfig", "ucbC in [0,100]");
    case "escalationThreshold":
    case "demotionCleanRuns":
    case "snapshotInterval":
    case "retain":
      return isInt(value, 0) ? ok(value) : fail("InvalidConfig", `${key} must be a non-negative integer`);
    case "decayHalfLife":
      return isNum(value, 1, Number.MAX_SAFE_INTEGER) ? ok(value) : fail("InvalidConfig", "decayHalfLife >= 1");
    case "maxPayloadBytes":
      return isInt(value, 64) ? ok(value) : fail("InvalidConfig", "maxPayloadBytes >= 64");
    default:
      return fail("InvalidConfig", `unknown tunable '${String(key)}'`);
  }
}

function isNum(v: unknown, lo: number, hi: number): boolean {
  return typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
}
function isInt(v: unknown, lo: number): boolean {
  return typeof v === "number" && Number.isInteger(v) && v >= lo;
}
