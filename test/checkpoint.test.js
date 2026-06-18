import { test, expect } from "bun:test";
import { freshMem } from "./helpers.js";

test("rollback restores projection and cursor exactly", () => {
  const ds = freshMem();
  ds.remember({ id: "a" });
  ds.remember({ id: "b" });
  ds.link("a", "b");
  ds.setCursor(["a"]);
  ds.checkpoint("cp1");
  ds.transition("b");
  expect(ds.cursor()).toEqual(["b"]);
  const r = ds.rollback("cp1");
  expect(r.ok).toBe(true);
  expect(ds.cursor()).toEqual(["a"]);
  expect(ds.getNode("b")).toBeTruthy();
  expect(ds.verifyIntegrity().ok).toBe(true);
  ds.close();
});

test("rollback to a missing checkpoint errors", () => {
  const ds = freshMem();
  const r = ds.rollback("nope");
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.error.code).toBe("CheckpointNotFound");
  ds.close();
});

test("branch isolates mutations; main is untouched", () => {
  const main = freshMem();
  main.remember({ id: "a" });
  const br = main.branch(":memory:");
  expect(br.ok).toBe(true);
  if (br.ok) {
    br.value.remember({ id: "b" });
    expect(main.getNode("b")).toBeNull();
    expect(br.value.getNode("a")).toBeTruthy();
    expect(br.value.getNode("b")).toBeTruthy();
    br.value.close();
  }
  expect(main.getNode("a")).toBeTruthy();
  expect(main.getNode("b")).toBeNull();
  main.close();
});
