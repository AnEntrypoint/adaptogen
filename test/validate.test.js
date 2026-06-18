import { test, expect } from "bun:test";
import { freshMem } from "./helpers.js";

test("validate detects a transition to a dead node and repair removes it", () => {
  const ds = freshMem();
  ds.remember({ id: "a" });
  ds.remember({ id: "b" });
  ds.link("a", "b");
  ds.archive("b");
  const rep = ds.validate();
  expect(rep.ok).toBe(false);
  expect(rep.violations.some((v) => v.kind === "TransitionToDeadNode")).toBe(true);
  const fix = ds.repair();
  expect(fix.fixed.length).toBeGreaterThan(0);
  expect(ds.validate().ok).toBe(true);
  ds.close();
});

test("validate flags an active node depending on a dead prereq and repair removes it", () => {
  const ds = freshMem();
  ds.remember({ id: "task" });
  ds.remember({ id: "prereq" });
  ds.depend("task", "prereq"); // task depends on prereq
  ds.archive("prereq"); // prereq dies out from under a live dependent
  const rep = ds.validate();
  expect(rep.ok).toBe(false);
  expect(rep.violations.some((v) => v.kind === "DependencyToDeadNode")).toBe(true);
  ds.repair();
  expect(ds.validate().ok).toBe(true);
  ds.close();
});

test("link rejects a non-finite or negative weight", () => {
  const ds = freshMem();
  ds.remember({ id: "a" });
  ds.remember({ id: "b" });
  expect(ds.link("a", "b", { weight: NaN }).ok).toBe(false);
  expect(ds.link("a", "b", { weight: -1 }).ok).toBe(false);
  expect(ds.link("a", "b", { weight: "2" }).ok).toBe(false);
  expect(ds.link("a", "b", { weight: 3 }).ok).toBe(true);
  ds.close();
});

test("repair resets a cursor sitting on a dead node", () => {
  const ds = freshMem();
  ds.remember({ id: "a" });
  ds.setCursor(["a"]);
  ds.store.append({ type: "NodeStatusChanged", payload: { id: "a", status: "deprecated" } });
  expect(ds.validate().violations.some((v) => v.kind === "CursorOnDeadNode")).toBe(true);
  ds.repair();
  expect(ds.validate().ok).toBe(true);
  ds.close();
});

test("integrity verify localizes a byte flip", () => {
  const ds = freshMem();
  ds.remember({ id: "a" });
  ds.remember({ id: "b" });
  ds.store.db.run("UPDATE events SET payload = ? WHERE seq = 1", JSON.stringify({ id: "x" }));
  const r = ds.verifyIntegrity();
  expect(r.ok).toBe(false);
  expect(r.firstBreakSeq).toBe(1);
  ds.close();
});
