// The agent-fluency surface added for one-call stepping, recovery hints, and
// score introspection. These are the methods an agent leans on every tick, so
// every branch (applied / denied / no-moves / reward) is pinned here.
import { test, expect } from "bun:test";
import { freshMem } from "./helpers.js";

function chain() {
  const ds = freshMem();
  ds.remember({ id: "a" });
  ds.remember({ id: "b" });
  ds.remember({ id: "c" });
  ds.link("a", "b");
  ds.link("b", "c");
  ds.setCursor(["a"]);
  return ds;
}

test("step() takes the suggested move, rewards it, and reports done", () => {
  const ds = chain();
  const r1 = ds.step({ reward: 1 });
  expect(r1.ok).toBe(true);
  expect(r1.value.to).toBe("b");
  expect(r1.value.applied).toBe(true);
  expect(r1.value.denied).toBe(false);
  expect(r1.value.reward.scopes).toBeGreaterThan(0);
  expect(r1.value.done).toBe(false);
  const r2 = ds.step({ reward: 1 });
  expect(r2.value.to).toBe("c");
  expect(r2.value.done).toBe(true); // c is terminal
  ds.close();
});

test("step() on an empty cursor and on no-moves returns coded fails with hints", () => {
  const ds = freshMem();
  const empty = ds.step({});
  expect(empty.ok).toBe(false);
  expect(empty.error.code).toBe("InvalidInput");
  expect(empty.error.details.hint).toBeTruthy();

  ds.remember({ id: "x" });
  ds.setCursor(["x"]); // no out-edges
  const none = ds.step({});
  expect(none.ok).toBe(false);
  expect(none.error.code).toBe("NoMoves");
  expect(none.error.details.hint).toBeTruthy();
  ds.close();
});

test("step() honors an explicit target and skips reward when omitted", () => {
  const ds = chain();
  ds.link("a", "c"); // now two moves from a
  const r = ds.step({ to: "c" });
  expect(r.value.to).toBe("c");
  expect(r.value.reward).toBeNull();
  ds.close();
});

test("step() surfaces a denied hard move without rewarding", () => {
  const ds = freshMem();
  ds.remember({ id: "a" });
  ds.remember({ id: "b" });
  // the only edge a->b is hard-guarded and the guard fails without vars.ok
  expect(ds.link("a", "b", { enforcement: "hard", guard: "vars.ok == true" }).ok).toBe(true);
  ds.setCursor(["a"]);
  const r = ds.step({ to: "b", reward: 1 });
  expect(r.ok).toBe(true);
  expect(r.value.applied).toBe(false);
  expect(r.value.denied).toBe(true);
  expect(r.value.reward).toBeNull();
  ds.close();
});

test("transition outcome carries a soft_warned flag", () => {
  const ds = freshMem();
  ds.remember({ id: "a" });
  ds.remember({ id: "b" });
  ds.link("a", "b", { enforcement: "soft", guard: "vars.ok == true" });
  ds.setCursor(["a"]);
  const r = ds.transition("b"); // guard fails -> soft warn, still applied
  expect(r.ok).toBe(true);
  expect(r.value.applied).toBe(true);
  expect(r.value.soft_warned).toBe(true);
  ds.close();
});

test("reward with no recent transition fails with a recovery hint", () => {
  const ds = freshMem();
  const r = ds.reward(1);
  expect(r.ok).toBe(false);
  expect(r.error.details.hint).toContain("transition");
  ds.close();
});

test("suggest() exposes a score breakdown of reward + weight + explore", () => {
  const ds = chain();
  const moves = ds.suggest();
  expect(moves.length).toBeGreaterThan(0);
  const m = moves[0];
  expect(m.breakdown).toBeDefined();
  expect(m.score).toBeCloseTo(m.breakdown.reward + m.breakdown.weight + m.breakdown.explore, 9);
  ds.close();
});

test("recall by a tag containing a quote matches exactly, not as a substring", () => {
  const ds = freshMem();
  ds.remember({ id: "n1", tags: ['say"hi'] });
  ds.remember({ id: "n2", tags: ["safe"] });
  expect(ds.recall({ tag: 'say"hi' }).map((n) => n.id)).toEqual(["n1"]);
  // "saf" must not match the "safe" tag (exact element, not substring)
  expect(ds.recall({ tag: "saf" }).map((n) => n.id)).toEqual([]);
  ds.close();
});

test("the decision trace escalation key is camelCase", () => {
  const ds = freshMem();
  ds.remember({ id: "a" });
  ds.remember({ id: "b" });
  ds.link("a", "b");
  ds.setCursor(["a"]);
  const tr = ds.explainTransition("b");
  expect(tr.ok).toBe(true);
  expect(tr.value.escalation).toHaveProperty("softViolations");
  expect(tr.value.escalation).not.toHaveProperty("soft_violations");
  ds.close();
});

test("bumpCounter rejects a column outside the allow-list", () => {
  const ds = freshMem();
  ds.remember({ id: "a" });
  expect(() => ds.store.bumpCounter("node", "a", "successes; DROP TABLE stats", 1)).toThrow();
  ds.close();
});
