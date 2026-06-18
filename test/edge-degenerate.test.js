// Degenerate, empty, boundary, and reentry states across the whole surface. An
// agent drives this store from arbitrary points, so every verb must behave on an
// empty graph, on missing entities, and at its input limits -- never throw on
// agent input, always return a typed Result or a well-defined empty value.
import { test, expect } from "bun:test";
import { freshMem } from "./helpers.js";

// ---- empty graph: every read is defined, nothing throws --------------------

test("reads on an empty graph return defined empties", () => {
  const ds = freshMem();
  expect(ds.cursor()).toEqual([]);
  expect(ds.suggest()).toEqual([]);
  expect(ds.legalMoves()).toEqual([]);
  expect(ds.ready()).toEqual([]);
  expect(ds.topo()).toEqual({ order: [], cyclic: false });
  expect(ds.zones()).toEqual([]);
  expect(ds.validate().ok).toBe(true);
  expect(ds.history()).toEqual([]);
  const m = ds.metrics();
  expect(m.nodes.total).toBe(0);
  expect(typeof m.ftsEnabled).toBe("boolean");
  expect(typeof ds.render()).toBe("string");
  expect(ds.toMermaid()).toContain("graph LR");
  expect(ds.toDot()).toContain("digraph adaptogen");
  ds.close();
});

// ---- remember: degenerate inputs -------------------------------------------

test("remember rejects an empty/invalid id with InvalidInput, never throws", () => {
  const ds = freshMem();
  expect(ds.remember({ id: "" }).ok).toBe(false);
  expect(ds.remember({ id: "" }).error.code).toBe("InvalidInput");
  expect(ds.remember({ id: "has space" }).ok).toBe(false);
  ds.close();
});

test("remember accepts a null/absent payload and treats absent tags as empty", () => {
  const ds = freshMem();
  expect(ds.remember({ id: "a", payload: null }).ok).toBe(true);
  const n = ds.remember({ id: "b" }).value;
  expect(n.tags).toEqual([]);
  ds.close();
});

test("remember upserts by id, preserving fields not re-supplied", () => {
  const ds = freshMem();
  ds.remember({ id: "a", label: "first", payload: { x: 1 } });
  const v2 = ds.remember({ id: "a", payload: { x: 2 } }).value;
  expect(v2.label).toBe("first"); // carried
  expect(v2.payload).toEqual({ x: 2 });
  expect(v2.version).toBe(2);
  ds.close();
});

test("remember enforces the payload size cap", () => {
  const ds = freshMem();
  const big = "x".repeat(ds.getTunables().maxPayloadBytes + 1);
  const r = ds.remember({ id: "a", payload: { big } });
  expect(r.ok).toBe(false);
  expect(r.error.code).toBe("PayloadTooLarge");
  ds.close();
});

test("a remembered embedding round-trips and drives cosine recall", () => {
  const ds = freshMem();
  ds.remember({ id: "near", embedding: [1, 0, 0] });
  ds.remember({ id: "far", embedding: [0, 1, 0] });
  expect(ds.getNode("near").embedding).toEqual([1, 0, 0]);
  const ranked = ds.recall({ embedding: [0.9, 0.1, 0] });
  expect(ranked[0].id).toBe("near");
  ds.close();
});

// ---- recall: empty and boundary --------------------------------------------

test("recall of nothing returns [] and respects a limit boundary", () => {
  const ds = freshMem();
  expect(ds.recall({ text: "nonexistent", kind: "ghost" })).toEqual([]);
  for (let i = 0; i < 5; i++) ds.remember({ id: `n${i}`, kind: "k" });
  expect(ds.recall({ kind: "k", limit: 2 }).length).toBe(2);
  expect(ds.recall({ kind: "k", limit: 0 }).length).toBe(1); // clamped to >=1
  ds.close();
});

// ---- links: self-loop, duplicate, dead target, cycle -----------------------

test("a transition self-loop is allowed; a dependency self-loop is a cycle", () => {
  const ds = freshMem();
  ds.remember({ id: "a" });
  expect(ds.link("a", "a").ok).toBe(true);
  expect(ds.depend("a", "a").ok).toBe(false); // a depends on a -> cycle
  ds.close();
});

test("duplicate edges are distinct ids; unlink then relink works", () => {
  const ds = freshMem();
  ds.remember({ id: "a" });
  ds.remember({ id: "b" });
  const e1 = ds.link("a", "b").value;
  const e2 = ds.link("a", "b").value;
  expect(e1.id).not.toBe(e2.id);
  expect(ds.unlink(e1.id).ok).toBe(true);
  expect(ds.unlink(e1.id).ok).toBe(false); // already gone
  expect(ds.link("a", "b").ok).toBe(true);
  ds.close();
});

test("link to a missing node fails NotFound; a guard that will not compile fails", () => {
  const ds = freshMem();
  ds.remember({ id: "a" });
  expect(ds.link("a", "ghost").ok).toBe(false);
  expect(ds.link("a", "ghost").error.code).toBe("NotFound");
  ds.remember({ id: "b" });
  const g = ds.link("a", "b", { guard: "this is not valid ((" });
  expect(g.ok).toBe(false);
  expect(g.error.code).toBe("GuardParseError");
  ds.close();
});

test("a dependency cycle is rejected with the offending path", () => {
  const ds = freshMem();
  ds.remember({ id: "a" });
  ds.remember({ id: "b" });
  ds.depend("b", "a"); // b depends on a
  const r = ds.depend("a", "b"); // a depends on b -> cycle
  expect(r.ok).toBe(false);
  expect(r.error.code).toBe("CycleRejected");
  expect(Array.isArray(r.error.details.cycle)).toBe(true);
  ds.close();
});

// ---- cursor: invalid and multi-head ----------------------------------------

test("setCursor rejects a missing/dead node and accepts multiple heads", () => {
  const ds = freshMem();
  ds.remember({ id: "a" });
  ds.remember({ id: "b" });
  expect(ds.setCursor(["a", "b"]).ok).toBe(true);
  expect(ds.cursor()).toEqual(["a", "b"]);
  expect(ds.setCursor(["ghost"]).ok).toBe(false);
  ds.archive("b");
  expect(ds.setCursor(["b"]).ok).toBe(false); // dead
  ds.close();
});

// ---- transition: same node, dead target ------------------------------------

test("transition to a dead target fails, to a missing target fails NotFound", () => {
  const ds = freshMem();
  ds.remember({ id: "a" });
  ds.remember({ id: "b" });
  ds.link("a", "b");
  ds.setCursor(["a"]);
  expect(ds.transition("ghost").error.code).toBe("NotFound");
  ds.archive("b");
  expect(ds.transition("b").error.code).toBe("IllegalTransition");
  ds.close();
});

// ---- suggest strategies on thin/empty data ---------------------------------

test("suggest under greedy/epsilon/ucb all return [] when no moves exist", () => {
  const ds = freshMem();
  ds.remember({ id: "a" });
  ds.setCursor(["a"]);
  for (const explore of ["greedy", "epsilon", "ucb"]) {
    ds.setTunable("explore", explore);
    expect(ds.suggest()).toEqual([]);
  }
  ds.close();
});

// ---- tunables: range + consistency -----------------------------------------

test("setTunable rejects out-of-range and getTunables reflects a set value", () => {
  const ds = freshMem();
  expect(ds.setTunable("epsilon", 5).ok).toBe(false);
  expect(ds.setTunable("epsilon", 5).error.code).toBe("InvalidConfig");
  expect(ds.setTunable("ucbC", 2).ok).toBe(true);
  expect(ds.getTunables().ucbC).toBe(2);
  ds.close();
});

// ---- getStat: missing entity, after unlink ---------------------------------

test("getStat is null for a missing entity and survives an unlink", () => {
  const ds = freshMem();
  ds.remember({ id: "a" });
  ds.remember({ id: "b" });
  const e = ds.link("a", "b").value;
  expect(ds.getStat("edge", "ghost")).toBeNull();
  ds.setCursor(["a"]);
  ds.transition("b");
  expect(ds.getStat("edge", e.id).visits).toBeGreaterThan(0);
  ds.unlink(e.id);
  // stat may linger until repair/rebuild, but the call must not throw
  expect(() => ds.getStat("edge", e.id)).not.toThrow();
  ds.close();
});

// ---- dag helpers -----------------------------------------------------------

test("ready respects done deps; reachable follows only the asked kind", () => {
  const ds = freshMem();
  ds.remember({ id: "a" });
  ds.remember({ id: "b" });
  ds.remember({ id: "c" });
  ds.depend("b", "a"); // b needs a
  ds.link("a", "c"); // transition a->c
  expect(ds.ready([])).toContain("a");
  expect(ds.ready([])).not.toContain("b");
  expect(ds.ready(["a"])).toContain("b");
  expect(ds.reachable("a", "transition")).toContain("c");
  expect(ds.reachable("a", "transition")).not.toContain("b");
  ds.close();
});
