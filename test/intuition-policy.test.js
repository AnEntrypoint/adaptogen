// Intuition (UCB/epsilon/greedy ranking, decay, confidence, deterministic ties)
// and enforcement policy (auto escalate/demote, edge-over-zone precedence).
import { test, expect } from "bun:test";
import { freshMem } from "./helpers.js";

function softEdge(ds, threshold) {
  // a->b on a soft edge whose guard always fails, so each transition is a soft
  // violation that counts toward escalation.
  ds.setTunable("escalationThreshold", threshold);
  ds.remember({ id: "a" });
  ds.remember({ id: "b" });
  ds.link("a", "b", { enforcement: "soft", guard: "vars.ok == true" });
  ds.setCursor(["a"]);
}

test("a soft edge auto-promotes to hard at exactly escalationThreshold", () => {
  const ds = freshMem();
  softEdge(ds, 2);
  ds.transition("b"); // soft #1, applied
  ds.setCursor(["a"]);
  const second = ds.transition("b"); // soft #2 -> promote to hard
  expect(second.value.applied).toBe(true);
  const edge = ds.store.allEdges().find((e) => e.src === "a" && e.dst === "b");
  expect(edge.enforcement).toBe("hard");
  // now blocked
  ds.setCursor(["a"]);
  expect(ds.transition("b").value.applied).toBe(false);
  ds.close();
});

test("escalationThreshold 0 disables auto-promotion", () => {
  const ds = freshMem();
  softEdge(ds, 0);
  for (let i = 0; i < 4; i++) {
    ds.setCursor(["a"]);
    ds.transition("b");
  }
  const edge = ds.store.allEdges().find((e) => e.src === "a" && e.dst === "b");
  expect(edge.enforcement).toBe("soft");
  ds.close();
});

test("a hard edge auto-demotes to soft after demotionCleanRuns clean uses", () => {
  const ds = freshMem();
  ds.setTunable("demotionCleanRuns", 2);
  ds.remember({ id: "a" });
  ds.remember({ id: "b" });
  ds.link("a", "b", { enforcement: "hard" }); // no guard -> clean each time
  for (let i = 0; i < 2; i++) {
    ds.setCursor(["a"]);
    expect(ds.transition("b").value.applied).toBe(true);
  }
  const edge = ds.store.allEdges().find((e) => e.src === "a" && e.dst === "b");
  expect(edge.enforcement).toBe("soft");
  ds.close();
});

test("edge enforcement overrides a zone boundary policy", () => {
  const ds = freshMem();
  ds.remember({ id: "in" });
  ds.remember({ id: "out" });
  ds.link("in", "out", { enforcement: "off" }); // explicit gate
  ds.defineZone("z", ["in"], { boundary: "hard" }); // crossing out would be hard
  ds.setCursor(["in"]);
  expect(ds.transition("out").value.applied).toBe(true); // edge 'off' gates through
  ds.close();
});

test("decayed reward goes stale with seq distance", () => {
  const ds = freshMem();
  ds.setTunable("decayHalfLife", 1);
  ds.remember({ id: "a" });
  ds.remember({ id: "b" });
  const e = ds.link("a", "b").value;
  ds.setCursor(["a"]);
  ds.transition("b");
  ds.reward(1, { edgeId: e.id });
  const fresh = ds.getStat("edge", e.id).emaReward;
  // age the log so the decayed contribution shrinks
  for (let i = 0; i < 20; i++) ds.remember({ id: `pad${i}` });
  ds.setCursor(["a"]);
  const ranked = ds.suggest();
  expect(ranked[0].breakdown.reward).toBeLessThan(fresh);
  ds.close();
});

test("confidence grows with visits; thin data is low-confidence", () => {
  const ds = freshMem();
  ds.remember({ id: "a" });
  ds.remember({ id: "b" });
  ds.link("a", "b");
  ds.setCursor(["a"]);
  const thin = ds.suggest()[0].confidence;
  for (let i = 0; i < 10; i++) {
    ds.setCursor(["a"]);
    ds.transition("b");
  }
  ds.setCursor(["a"]);
  const thick = ds.suggest()[0].confidence;
  expect(thick).toBeGreaterThan(thin);
  ds.close();
});

test("greedy ignores the explore term that ucb adds", () => {
  const ds = freshMem();
  ds.remember({ id: "a" });
  ds.remember({ id: "b" });
  ds.link("a", "b");
  ds.setCursor(["a"]);
  ds.transition("b"); // seed a visit so the UCB term is non-zero (log(1)=0 otherwise)
  ds.setCursor(["a"]);
  ds.setTunable("explore", "greedy");
  expect(ds.suggest()[0].breakdown.explore).toBe(0);
  ds.setTunable("explore", "ucb");
  expect(ds.suggest()[0].breakdown.explore).toBeGreaterThan(0);
  ds.close();
});

test("suggest ties break deterministically by edgeId", () => {
  const ds = freshMem();
  ds.remember({ id: "a" });
  ds.remember({ id: "b" });
  ds.remember({ id: "c" });
  ds.link("a", "b");
  ds.link("a", "c");
  ds.setCursor(["a"]);
  ds.setTunable("explore", "greedy"); // no random term -> pure tie
  const first = ds.suggest().map((m) => m.edgeId);
  const second = ds.suggest().map((m) => m.edgeId);
  expect(first).toEqual(second);
  ds.close();
});
