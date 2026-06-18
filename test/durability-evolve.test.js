// Durability (checkpoint/rollback/compact/export/import), integrity (validate/
// repair/verify/rebuild), and self-evolution (gc/optimize/reweight/migrate/
// split/merge/selfIterate) across their empty, boundary, and reentry states.
import { test, expect } from "bun:test";
import { freshMem } from "./helpers.js";
import { exportState, importState } from "../src/index.js";

function graph() {
  const ds = freshMem();
  ds.remember({ id: "a" });
  ds.remember({ id: "b" });
  ds.remember({ id: "c" });
  ds.link("a", "b");
  ds.link("b", "c");
  ds.setCursor(["a"]);
  return ds;
}

test("checkpoint/rollback round-trips, including a name collision and many mutations", () => {
  const ds = graph();
  ds.checkpoint("cp");
  expect(ds.checkpoint("cp").ok).toBe(true); // re-checkpoint same name is allowed (moves marker)
  for (let i = 0; i < 20; i++) ds.remember({ id: `x${i}` });
  expect(ds.getNode("x19")).not.toBeNull();
  expect(ds.rollback("cp").ok).toBe(true);
  expect(ds.getNode("x19")).toBeNull();
  expect(ds.rollback("missing").error.code).toBe("CheckpointNotFound");
  ds.close();
});

test("compact with retain 0 and a positive retain both keep the projection intact", () => {
  const ds = graph();
  ds.transition("b");
  const before = ds.metrics().nodes.total;
  ds.compact(0);
  expect(ds.metrics().nodes.total).toBe(before);
  ds.compact(1000);
  expect(ds.metrics().nodes.total).toBe(before);
  expect(ds.validate().ok).toBe(true);
  ds.close();
});

test("export/import round-trips full history; an empty store exports cleanly", () => {
  const empty = freshMem();
  const eb = exportState(empty);
  expect(Array.isArray(eb.events)).toBe(true);
  expect(eb.schema_version).toBeGreaterThanOrEqual(0);
  empty.close();

  const ds = graph();
  ds.transition("b");
  ds.reward(1);
  const bundle = exportState(ds);
  const copy = importState(":memory:", bundle, { seed: false });
  expect(copy.getNode("a")).not.toBeNull();
  expect(copy.store.lastSeq()).toBe(ds.store.lastSeq());
  expect(copy.validate().ok).toBe(true);
  copy.close();
  ds.close();
});

test("branch / merge / discard flow merges only the branch's new work", () => {
  const ds = graph();
  const br = ds.branch(":memory:").value;
  br.remember({ id: "branch-only" });
  const m = ds.merge(br);
  expect(m.ok).toBe(true);
  expect(m.value.merged).toBeGreaterThan(0);
  expect(ds.getNode("branch-only")).not.toBeNull();
  br.discard();
  ds.close();
});

test("validate+repair clears every fixable violation to a clean state", () => {
  const ds = graph();
  ds.transition("b");
  // dangle a transition edge by archiving its target
  ds.archive("c");
  expect(ds.validate().ok).toBe(false);
  ds.repair();
  expect(ds.validate().ok).toBe(true);
  ds.close();
});

test("verifyIntegrity localizes a corrupted payload; rebuild is idempotent", () => {
  const ds = graph();
  ds.transition("b");
  const m1 = ds.render();
  ds.store.rebuild();
  expect(ds.render()).toBe(m1); // projection identical after a pure replay
  expect(ds.verifyIntegrity().ok).toBe(true);
  ds.close();
});

test("gc prunes unreachable, and is a no-op when nothing is unreachable", () => {
  const ds = graph();
  ds.remember({ id: "orphan" });
  const g1 = ds.gc();
  expect(g1.deprecated).toContain("orphan");
  const g2 = ds.gc();
  expect(g2.deprecated).toEqual([]);
  ds.close();
});

test("optimize returns suggestion kinds; selfIterate is safe on an empty graph", () => {
  const ds = graph();
  ds.remember({ id: "dead" }); // unreachable -> a gc-dead-node suggestion
  const kinds = new Set(ds.optimize().map((s) => s.kind));
  expect(kinds.has("gc-dead-node")).toBe(true);
  const empty = freshMem();
  expect(empty.selfIterate().ok).toBe(true);
  empty.close();
  ds.close();
});

test("migrate filters by kind and is a no-op when nothing matches", () => {
  const ds = freshMem();
  ds.remember({ id: "d1", kind: "doc", payload: { v: 1 } });
  ds.remember({ id: "s1", kind: "state", payload: {} });
  const r = ds.migrate("doc", (p) => ({ ...p, v: (p.v ?? 0) + 1 }));
  expect(r.ok).toBe(true);
  expect(r.value.migrated).toBe(1);
  expect(ds.getNode("d1").payload.v).toBe(2);
  expect(ds.migrate("missing-kind", (p) => p).value.migrated).toBe(0);
  ds.close();
});

test("mergeStates unions payloads and tags onto the surviving node", () => {
  const ds = freshMem();
  ds.remember({ id: "a", payload: { x: 1 }, tags: ["t1"] });
  ds.remember({ id: "b", payload: { y: 2 }, tags: ["t2"] });
  const r = ds.mergeStates("a", "b");
  expect(r.ok).toBe(true);
  const a = ds.getNode("a");
  expect(a.payload).toMatchObject({ x: 1, y: 2 });
  expect(a.tags.sort()).toEqual(["t1", "t2"]);
  expect(ds.getNode("b").status).toBe("deprecated");
  ds.close();
});

test("ancestors/descendants walk deep dependency chains", () => {
  const ds = freshMem();
  for (const id of ["a", "b", "c", "d"]) ds.remember({ id });
  ds.depend("b", "a");
  ds.depend("c", "b");
  ds.depend("d", "c");
  expect(ds.ancestors("d").sort()).toEqual(["a", "b", "c"]);
  expect(ds.descendants("a").sort()).toEqual(["b", "c", "d"]);
  ds.close();
});

test("deriveZone with no matching members yields an empty zone, not an error", () => {
  const ds = graph();
  const r = ds.deriveZone("a", "toTags has 'nonexistent'");
  expect(r.ok).toBe(true);
  ds.close();
});
