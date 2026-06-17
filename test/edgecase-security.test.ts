import { test, expect } from "bun:test";
import { freshMem } from "./helpers.ts";
import { compileGuard, evalGuard } from "../src/index.ts";

test("empty graph: no cursor, empty suggestions, no crash", () => {
  const ds = freshMem();
  expect(ds.cursor()).toEqual([]);
  expect(ds.suggest()).toEqual([]);
  expect(ds.ready([])).toEqual([]);
  expect(ds.validate().ok).toBe(true);
  ds.close();
});

test("oversized payload is rejected", () => {
  const ds = freshMem();
  ds.setTunable("maxPayloadBytes", 100);
  const r = ds.remember({ id: "a", payload: { big: "x".repeat(500) } });
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.error.code).toBe("PayloadTooLarge");
  ds.close();
});

test("self-loop reentry transition is allowed", () => {
  const ds = freshMem();
  ds.remember({ id: "a" });
  ds.link("a", "a");
  ds.setCursor(["a"]);
  const r = ds.transition("a");
  expect(r.ok && r.value.applied).toBe(true);
  expect(ds.cursor()).toEqual(["a"]);
  ds.close();
});

test("invalid ids are rejected", () => {
  const ds = freshMem();
  expect(ds.remember({ id: "bad id!" }).ok).toBe(false);
  expect(ds.remember({ id: "" }).ok).toBe(false);
  expect(ds.remember({ id: "ok_id-1:2.3" }).ok).toBe(true);
  ds.close();
});

test("guard DSL rejects prototype-escape identifiers at parse", () => {
  expect(compileGuard("constructor == 1").ok).toBe(false);
  expect(compileGuard("a.__proto__ == 1").ok).toBe(false);
  expect(compileGuard("a.prototype.x == 1").ok).toBe(false);
  expect(compileGuard("payload.x == 1").ok).toBe(true);
});

test("guard cannot reach host globals", () => {
  const g = compileGuard("globalThis == null");
  expect(g.ok).toBe(true);
  if (g.ok) {
    // globalThis resolves to undefined in the sandbox, not the real global object
    expect(evalGuard(g.value, {})).toBe(false);
  }
  const g2 = compileGuard("vars.x > 5 && vars.y == 'go'");
  expect(g2.ok).toBe(true);
  if (g2.ok) {
    expect(evalGuard(g2.value, { vars: { x: 9, y: "go" } })).toBe(true);
    expect(evalGuard(g2.value, { vars: { x: 1, y: "go" } })).toBe(false);
  }
});

test("guard expression depth and length are bounded", () => {
  const deep = "(".repeat(200) + "1" + ")".repeat(200);
  expect(compileGuard(deep).ok).toBe(false);
  expect(compileGuard("a".repeat(5000)).ok).toBe(false);
});

test("transition to a non-existent target is a typed error", () => {
  const ds = freshMem();
  ds.remember({ id: "a" });
  ds.setCursor(["a"]);
  const r = ds.transition("ghost");
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.error.code).toBe("NotFound");
  ds.close();
});
