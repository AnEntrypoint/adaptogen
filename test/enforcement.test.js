import { test, expect } from "bun:test";
import { freshMem } from "./helpers.js";

test("soft enforcement allows but counts the violation", () => {
  const ds = freshMem();
  ds.remember({ id: "a" });
  ds.remember({ id: "b" });
  const e = ds.link("a", "b", { guard: "vars.ok == true", enforcement: "soft" });
  ds.setCursor(["a"]);
  const r = ds.transition("b");
  expect(r.ok && r.value.applied).toBe(true);
  expect(r.ok && r.value.trace.decision).toBe("warn");
  expect(ds.getStat("edge", e.ok ? e.value.id : "")?.softViolations).toBe(1);
  ds.close();
});

test("hard enforcement blocks a failing guard, allows a passing one", () => {
  const ds = freshMem();
  ds.remember({ id: "a" });
  ds.remember({ id: "b" });
  ds.link("a", "b", { guard: "vars.ok == true", enforcement: "hard" });
  ds.setCursor(["a"]);
  expect(ds.transition("b").ok && ds.cursor()).toEqual(["a"]); // blocked, cursor unchanged
  expect(ds.transition("b", { ok: true }).ok && ds.cursor()).toEqual(["b"]);
  ds.close();
});

test("blocked attempt is recorded and counted", () => {
  const ds = freshMem();
  ds.remember({ id: "a" });
  ds.remember({ id: "b" });
  const e = ds.link("a", "b", { guard: "false", enforcement: "hard" });
  ds.setCursor(["a"]);
  ds.transition("b");
  expect(ds.getStat("edge", e.ok ? e.value.id : "")?.blocks).toBe(1);
  expect(ds.store.readEvents({ type: "BlockedAttempt" }).length).toBe(1);
  ds.close();
});

test("escalation promotes soft to hard after threshold", () => {
  const ds = freshMem();
  ds.setTunable("escalationThreshold", 2);
  ds.remember({ id: "a" });
  ds.remember({ id: "b" });
  const e = ds.link("a", "b", { guard: "vars.ok == true", enforcement: "soft" });
  const eid = e.ok ? e.value.id : "";
  ds.setCursor(["a"]);
  ds.transition("b"); // soft #1
  ds.setCursor(["a"]);
  ds.transition("b"); // soft #2 -> promote
  expect(ds.store.getEdge(eid)?.enforcement).toBe("hard");
  ds.close();
});

test("edge enforcement overrides zone boundary (precedence)", () => {
  const ds = freshMem();
  ds.remember({ id: "in" });
  ds.remember({ id: "out" });
  ds.link("in", "out", { enforcement: "off" });
  ds.defineZone("z", ["in"], { boundary: "hard" });
  ds.setCursor(["in"]);
  expect(ds.transition("out").ok && ds.cursor()).toEqual(["out"]);
  ds.close();
});

test("explain names the deciding rule without mutating", () => {
  const ds = freshMem();
  ds.remember({ id: "a" });
  ds.remember({ id: "b" });
  ds.link("a", "b", { guard: "vars.ok == true", enforcement: "hard" });
  ds.setCursor(["a"]);
  const seqBefore = ds.store.lastSeq();
  const r = ds.explainTransition("b");
  expect(r.ok).toBe(true);
  if (r.ok) {
    expect(r.value.decision).toBe("deny");
    expect(r.value.reasons.join(" ")).toContain("guard");
  }
  expect(ds.store.lastSeq()).toBe(seqBefore);
  ds.close();
});
