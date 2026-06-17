import { test, expect } from "bun:test";
import { freshMem } from "./helpers.ts";

test("reward updates ema and successes; replay reproduces stats", () => {
  const ds = freshMem();
  ds.remember({ id: "a" });
  ds.remember({ id: "b" });
  const e = ds.link("a", "b");
  ds.setCursor(["a"]);
  const t = ds.transition("b");
  ds.reward(1, { edgeId: t.ok ? t.value.edgeId! : "" });
  const before = ds.getStat("edge", e.ok ? e.value.id : "")!;
  expect(before.emaReward).toBeGreaterThan(0);
  expect(before.successes).toBe(1);
  ds.store.rebuild();
  const after = ds.getStat("edge", e.ok ? e.value.id : "")!;
  expect(after.emaReward).toBeCloseTo(before.emaReward, 9);
  expect(after.visits).toBe(before.visits);
  ds.close();
});

test("suggest ranks the rewarded edge first under greedy", () => {
  const ds = freshMem();
  ds.setTunable("explore", "greedy");
  for (const id of ["a", "b", "c"]) ds.remember({ id });
  ds.link("a", "b");
  ds.link("a", "c");
  ds.setCursor(["a"]);
  const t = ds.transition("b");
  ds.reward(1, { edgeId: t.ok ? t.value.edgeId! : "" });
  ds.setCursor(["a"]);
  const sug = ds.suggest();
  expect(sug[0]!.to).toBe("b");
  ds.close();
});

test("confidence grows with visits", () => {
  const ds = freshMem();
  ds.setTunable("explore", "greedy");
  for (const id of ["a", "b"]) ds.remember({ id });
  ds.link("a", "b");
  ds.setCursor(["a"]);
  expect(ds.suggest()[0]!.confidence).toBe(0); // unvisited
  ds.transition("b");
  ds.setCursor(["a"]);
  expect(ds.suggest()[0]!.confidence).toBeGreaterThan(0);
  ds.close();
});

test("trace reward spreads decayed credit over recent path", () => {
  const ds = freshMem();
  for (const id of ["a", "b", "c"]) ds.remember({ id });
  ds.link("a", "b");
  ds.link("b", "c");
  ds.setCursor(["a"]);
  const t1 = ds.transition("b");
  const t2 = ds.transition("c");
  ds.reward(1, { trace: true, depth: 2 });
  const e1 = ds.getStat("edge", t1.ok ? t1.value.edgeId! : "")!;
  const e2 = ds.getStat("edge", t2.ok ? t2.value.edgeId! : "")!;
  expect(e1.emaReward).toBeGreaterThan(0);
  expect(e2.emaReward).toBeGreaterThan(0);
  // most-recent edge (t2) gets full weight, older (t1) decayed -> t2 >= t1
  expect(e2.emaReward).toBeGreaterThanOrEqual(e1.emaReward);
  ds.close();
});
