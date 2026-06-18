// Error/edge paths the main suites left uncovered: branch-merge guard, migrate
// fault propagation, missing-node status, and orphan-stat repair via rebuild.
import { test, expect } from "bun:test";
import { freshMem } from "./helpers.js";

test("merge() refuses a branch with no fork marker", () => {
  const main = freshMem();
  const notABranch = freshMem(); // never created via branch(), so no __fork_seq
  const r = main.merge(notABranch);
  expect(r.ok).toBe(false);
  expect(r.error.code).toBe("Conflict");
  main.close();
  notABranch.close();
});

test("migrate() surfaces a thrown apply() as a MigrationError Result", () => {
  const ds = freshMem();
  ds.remember({ id: "n", kind: "doc", payload: { v: 1 } });
  const r = ds.migrate("doc", () => {
    throw new Error("boom");
  });
  expect(r.ok).toBe(false);
  expect(r.error.code).toBe("MigrationError");
  expect(r.error.message).toContain("boom");
  ds.close();
});

test("store.nodeStatus() returns null for a missing node", () => {
  const ds = freshMem();
  expect(ds.store.nodeStatus("ghost")).toBeNull();
  ds.close();
});

test("repair() rebuilds away an orphaned stat", () => {
  const ds = freshMem();
  ds.remember({ id: "a" });
  // Manufacture an orphan stat for a node that does not exist.
  ds.store.ensureStat("node", "ghost");
  ds.store.bumpVisit("node", "ghost", ds.store.lastSeq());
  expect(ds.validate().violations.some((v) => v.kind === "OrphanStat")).toBe(true);
  ds.repair();
  expect(ds.validate().ok).toBe(true);
  ds.close();
});
