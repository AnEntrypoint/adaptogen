import { test, expect } from "bun:test";
import { freshMem } from "./helpers.ts";

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
