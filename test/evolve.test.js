import { test, expect } from "bun:test";
import { freshMem } from "./helpers.js";

test("split moves named out-edges onto the clone", () => {
  const ds = freshMem();
  for (const id of ["a", "b", "c"]) ds.remember({ id });
  ds.link("a", "b");
  const e2 = ds.link("a", "c");
  const sp = ds.splitState("a", "a2", [e2.ok ? e2.value.id : ""]);
  expect(sp.ok).toBe(true);
  expect(ds.store.getEdge(e2.ok ? e2.value.id : "")?.src).toBe("a2");
  ds.close();
});

test("merge rewires edges and deprecates the absorbed node", () => {
  const ds = freshMem();
  for (const id of ["a", "b", "x"]) ds.remember({ id });
  ds.link("x", "b"); // into b
  ds.link("b", "a"); // out of b
  ds.mergeStates("a", "b");
  expect(ds.getNode("b")?.status).toBe("deprecated");
  // x now points at a; a has a self/forward edge replacing b->a
  expect(ds.store.outEdges("x").some((e) => e.dst === "a")).toBe(true);
  ds.close();
});

test("gc deprecates unreachable, unvisited nodes only", () => {
  const ds = freshMem();
  ds.remember({ id: "a" });
  ds.remember({ id: "orphan" });
  ds.setCursor(["a"]);
  const r = ds.gc();
  expect(r.deprecated).toContain("orphan");
  expect(ds.getNode("a")?.status).toBe("active");
  ds.close();
});

test("migrate transforms payloads and is reversible", () => {
  const ds = freshMem();
  ds.remember({ id: "a", kind: "v", payload: { n: 1 } });
  ds.migrate("v", (p) => ({ ...p, n: (p.n) + 10 }));
  expect(ds.getNode("a")?.payload.n).toBe(11);
  ds.migrate("v", (p) => ({ ...p, n: (p.n) - 10 }));
  expect(ds.getNode("a")?.payload.n).toBe(1);
  ds.close();
});

test("optimize surfaces duplicate edges and dead nodes", () => {
  const ds = freshMem();
  for (const id of ["a", "b", "dead"]) ds.remember({ id });
  ds.link("a", "b");
  ds.link("a", "b");
  ds.setCursor(["a"]);
  const sug = ds.optimize();
  expect(sug.some((s) => s.kind === "merge-duplicate-edge")).toBe(true);
  expect(sug.some((s) => s.kind === "gc-dead-node" && s.target === "dead")).toBe(true);
  ds.close();
});

test("reweight raises the weight of a rewarded edge", () => {
  const ds = freshMem();
  ds.remember({ id: "a" });
  ds.remember({ id: "b" });
  const e = ds.link("a", "b");
  ds.setCursor(["a"]);
  const t = ds.transition("b");
  ds.reward(1, { edgeId: t.ok ? t.value.edgeId : "" });
  ds.reweight();
  expect(ds.store.getEdge(e.ok ? e.value.id : "").weight).toBeGreaterThan(1);
  ds.close();
});

test("selfIterate applies safe edits and keeps invariants", () => {
  const ds = freshMem();
  for (const id of ["a", "b", "dead"]) ds.remember({ id });
  ds.link("a", "b");
  ds.setCursor(["a"]);
  const r = ds.selfIterate();
  expect(r.ok).toBe(true);
  if (r.ok) expect(r.value.valid).toBe(true);
  expect(ds.validate().ok).toBe(true);
  expect(ds.getNode("dead")?.status).toBe("deprecated");
  ds.close();
});
