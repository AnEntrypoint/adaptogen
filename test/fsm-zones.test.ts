import { test, expect } from "bun:test";
import { freshMem } from "./helpers.ts";

test("legal transition applies, illegal rejected, cursor moves", () => {
  const ds = freshMem();
  for (const id of ["a", "b", "c"]) ds.remember({ id });
  ds.link("a", "b");
  ds.setCursor(["a"]);
  const r = ds.transition("b");
  expect(r.ok && r.value.applied).toBe(true);
  expect(ds.cursor()).toEqual(["b"]);
  const r2 = ds.transition("a");
  expect(r2.ok).toBe(false);
  ds.close();
});

test("multi-cursor add and persistence", () => {
  const ds = freshMem();
  for (const id of ["a", "b"]) ds.remember({ id });
  ds.setCursor(["a", "b"]);
  expect(ds.cursor().sort()).toEqual(["a", "b"]);
  ds.close();
});

test("legalMoves lists allowed moves only", () => {
  const ds = freshMem();
  for (const id of ["a", "b", "c"]) ds.remember({ id });
  ds.link("a", "b");
  ds.link("a", "c", { guard: "false", enforcement: "hard" });
  ds.setCursor(["a"]);
  const moves = ds.legalMoves();
  expect(moves.map((m) => m.to)).toEqual(["b"]);
  ds.close();
});

test("zone boundary hard-blocks crossing without a gate", () => {
  const ds = freshMem();
  ds.remember({ id: "in" });
  ds.remember({ id: "out" });
  ds.link("in", "out");
  ds.defineZone("z", ["in"], { intra: "off", boundary: "hard" });
  ds.setCursor(["in"]);
  const r = ds.transition("out");
  expect(r.ok && r.value.applied).toBe(false);
  expect(ds.cursor()).toEqual(["in"]);
  ds.close();
});

test("gated crossing allowed via edge enforcement off", () => {
  const ds = freshMem();
  ds.remember({ id: "in" });
  ds.remember({ id: "out" });
  ds.link("in", "out", { enforcement: "off" });
  ds.defineZone("z", ["in"], { boundary: "hard" });
  ds.setCursor(["in"]);
  expect(ds.transition("out").ok && ds.cursor()).toEqual(["out"]);
  ds.close();
});

test("intra-zone transitions are free", () => {
  const ds = freshMem();
  ds.remember({ id: "a" });
  ds.remember({ id: "b" });
  ds.link("a", "b");
  ds.defineZone("z", ["a", "b"], { intra: "off", boundary: "hard" });
  ds.setCursor(["a"]);
  const r = ds.transition("b");
  expect(r.ok && r.value.applied).toBe(true);
  ds.close();
});

test("deriveZone collects the safe reachable subset", () => {
  const ds = freshMem();
  for (const id of ["a", "b", "c"]) ds.remember({ id, payload: { safe: true } });
  ds.remember({ id: "d", payload: { safe: false } });
  ds.link("a", "b");
  ds.link("b", "c");
  ds.link("c", "d");
  const r = ds.deriveZone("a", "payload.safe == true");
  expect(r.ok && r.value.members).toEqual(["a", "b", "c"]);
  ds.close();
});
