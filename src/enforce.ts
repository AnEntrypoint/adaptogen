// The enforcement decision: the single place soft/hard is resolved. A transition
// is allowed unless a policy reason applies (failing guard, boundary crossing, or
// an above-off intra policy). Each reason is governed by an enforcement mode; the
// final decision is the strictest of the applicable ones. Edge enforcement "off"
// is the gate that lets an otherwise-blocked crossing through. The whole result
// is a structured trace so explain() can name the exact deciding rule.

import type { Decision, DecisionTrace, EnforcementMode } from "./types.ts";

const DEC_RANK: Record<Decision, number> = { allow: 0, warn: 1, deny: 2 };

export function modeToDecision(mode: EnforcementMode): Decision {
  return mode === "off" ? "allow" : mode === "soft" ? "warn" : "deny";
}

export interface DecideInput {
  guard: { present: boolean; passed: boolean; expr?: string };
  crossing: boolean;
  zoneFrom?: string;
  zoneTo?: string;
  /** per-edge override; "off" acts as an explicit gate; null = inherit */
  edgeEnforcement: EnforcementMode | null;
  /** strictest boundary mode of zones left/entered */
  boundaryEnforcement: EnforcementMode;
  /** strictest intra mode of shared zones */
  intraEnforcement: EnforcementMode;
  /** global fallback used for a failing guard with no edge override */
  globalDefault: EnforcementMode;
  softViolations: number;
  escalationThreshold: number;
}

interface Candidate {
  decision: Decision;
  mode: EnforcementMode;
  source: "edge" | "zone" | "global" | "none";
  reason: string | null;
}

export function decide(input: DecideInput): DecisionTrace {
  const reasons: string[] = [];
  const candidates: Candidate[] = [];

  // 1. Guard. Governed by the edge override, falling back to the global default.
  const guardViolated = input.guard.present && !input.guard.passed;
  if (guardViolated) {
    const mode = input.edgeEnforcement ?? input.globalDefault;
    const source = input.edgeEnforcement != null ? "edge" : "global";
    reasons.push(`guard failed: ${input.guard.expr ?? "<expr>"}`);
    candidates.push({ decision: modeToDecision(mode), mode, source, reason: "guard" });
  }

  // 2. Boundary crossing. Edge "off" is the gate.
  if (input.crossing) {
    const gated = input.edgeEnforcement === "off";
    const mode: EnforcementMode = gated ? "off" : input.boundaryEnforcement;
    const source = gated ? "edge" : "zone";
    reasons.push(
      gated
        ? `zone boundary crossing ${input.zoneFrom ?? "?"}->${input.zoneTo ?? "?"} (gated)`
        : `zone boundary crossing ${input.zoneFrom ?? "?"}->${input.zoneTo ?? "?"}`,
    );
    candidates.push({ decision: modeToDecision(mode), mode, source, reason: "boundary" });
  }

  // 3. Intra policy above off (a zone that governs internal moves).
  if (!input.crossing && input.intraEnforcement !== "off") {
    const gated = input.edgeEnforcement === "off";
    const mode: EnforcementMode = gated ? "off" : input.intraEnforcement;
    const source = gated ? "edge" : "zone";
    reasons.push(`intra-zone policy ${input.intraEnforcement}`);
    candidates.push({ decision: modeToDecision(mode), mode, source, reason: "intra" });
  }

  // Strictest candidate wins; deterministic by registration order on ties.
  let winner: Candidate = { decision: "allow", mode: "off", source: "none", reason: null };
  for (const c of candidates) if (DEC_RANK[c.decision] > DEC_RANK[winner.decision]) winner = c;

  const promoted =
    winner.decision === "warn" &&
    input.escalationThreshold > 0 &&
    input.softViolations + 1 >= input.escalationThreshold;

  return {
    decision: winner.decision,
    enforcementSource: winner.source,
    effectiveEnforcement: winner.mode,
    guard: {
      present: input.guard.present,
      passed: input.guard.passed,
      ...(guardViolated ? { reason: input.guard.expr } : {}),
    },
    boundary: {
      crossing: input.crossing,
      gated: input.edgeEnforcement === "off" && input.crossing,
      ...(input.zoneFrom ? { zoneFrom: input.zoneFrom } : {}),
      ...(input.zoneTo ? { zoneTo: input.zoneTo } : {}),
    },
    escalation: { soft_violations: input.softViolations, promoted },
    reasons,
  };
}
