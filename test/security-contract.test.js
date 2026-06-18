// Security boundaries and the Result/output contract. The guard DSL runs
// agent-authored strings, so prototype-pollution and injection are the threat
// model; agent input must always come back as a typed Result, never a throw or a
// silently-executed string. Output is ASCII-only.
import { test, expect } from "bun:test";
import { freshMem } from "./helpers.js";
import { compileGuard, evalGuard } from "../src/index.js";
import { ERROR_CODES } from "../src/errors.js";

// ---- guard DSL: operators, sandbox, limits ---------------------------------

test("the guard DSL evaluates all documented operators", () => {
  const ctx = {
    from: "a", to: "b", fromTags: ["x"], toTags: ["safe"],
    edge: { label: "go", weight: 3 },
    stat: { visits: 5, emaReward: 0.5, successes: 4, failures: 0 },
    vars: { approved: true },
  };
  const cases = [
    ["stat.failures < 3", true],
    ["stat.visits >= 5 && vars.approved == true", true],
    ["edge.weight > 2 || from == 'z'", true],
    ["toTags has 'safe'", true],
    ["from in ['a', 'q']", true],
    ["!(vars.approved == false)", true],
    ["stat.emaReward <= 0.4", false],
  ];
  for (const [src, want] of cases) {
    const c = compileGuard(src);
    expect(c.ok).toBe(true);
    expect(evalGuard(c.value, ctx)).toBe(want);
  }
});

test("guard compilation rejects prototype-pollution paths", () => {
  for (const src of ["__proto__ == 1", "constructor == 1", "vars.__proto__ == 1", "a.prototype == 1"]) {
    expect(compileGuard(src).ok).toBe(false);
  }
});

test("a missing context key reads as undefined and compares false (never throws)", () => {
  const c = compileGuard("vars.nope == true");
  expect(c.ok).toBe(true);
  expect(() => evalGuard(c.value, { vars: {} })).not.toThrow();
  expect(evalGuard(c.value, { vars: {} })).toBe(false);
});

test("a deeply nested / overlong guard is rejected, not evaluated", () => {
  const deep = Array(200).fill("(a == a)").join(" && ");
  expect(compileGuard(deep).ok).toBe(false);
});

test("no eval: a guard string with code does not execute", () => {
  // If this were eval'd it would throw a ReferenceError; the DSL just fails to parse.
  globalThis.__pwned = false;
  const c = compileGuard("(globalThis.__pwned = true)");
  expect(c.ok).toBe(false);
  expect(globalThis.__pwned).toBe(false);
  delete globalThis.__pwned;
});

// ---- injection attempts route through bound params -------------------------

test("a tag / text recall with SQL metacharacters cannot inject", () => {
  const ds = freshMem();
  ds.remember({ id: "a", tags: ["o'); DROP TABLE nodes;--"], payload: { t: "x" } });
  // must not throw and must not corrupt the table
  expect(() => ds.recall({ tag: "o'); DROP TABLE nodes;--" })).not.toThrow();
  expect(() => ds.recall({ text: "'; DROP TABLE nodes; --" })).not.toThrow();
  expect(ds.getNode("a")).not.toBeNull();
  ds.close();
});

test("id charset is enforced on node and edge ids", () => {
  const ds = freshMem();
  expect(ds.remember({ id: "ok_id-1" }).ok).toBe(true);
  expect(ds.remember({ id: "bad/id" }).ok).toBe(false);
  ds.remember({ id: "a" });
  ds.remember({ id: "b" });
  expect(ds.link("a", "b", { id: "bad id" }).ok).toBe(false);
  ds.close();
});

test("a prototype-pollution payload does not poison Object.prototype", () => {
  const ds = freshMem();
  const r = ds.remember({ id: "a", payload: JSON.parse('{"__proto__": {"pwned": 1}}') });
  expect(r.ok).toBe(true);
  expect({}.pwned).toBeUndefined();
  ds.close();
});

// ---- Result contract -------------------------------------------------------

test("agent input never throws; failures are typed Results", () => {
  const ds = freshMem();
  // a battery of bad inputs -- each returns a Result, none throw
  const calls = [
    () => ds.remember({ id: "" }),
    () => ds.link("x", "y"),
    () => ds.transition("nowhere"),
    () => ds.reward(1),
    () => ds.setCursor(["ghost"]),
    () => ds.setTunable("epsilon", 99),
    () => ds.rollback("no-such-checkpoint"),
    () => ds.defineZone("z", ["ghost"]),
  ];
  for (const c of calls) {
    let r;
    expect(() => (r = c())).not.toThrow();
    expect(r.ok).toBe(false);
    expect(ERROR_CODES).toContain(r.error.code);
    expect(typeof r.error.details === "object" || r.error.details === undefined).toBe(true);
  }
  ds.close();
});

test("error codes are ASCII and toJSON is serializable", () => {
  const ds = freshMem();
  const r = ds.transition("nowhere"); // empty cursor -> fail
  expect(r.ok).toBe(false);
  const json = r.error.toJSON();
  expect(JSON.parse(JSON.stringify(json)).code).toBe(r.error.code);
  for (const code of ERROR_CODES) expect(/^[\x00-\x7F]+$/.test(code)).toBe(true);
  ds.close();
});

// ---- ASCII-only output -----------------------------------------------------

test("render / mermaid / dot output stays ASCII even with unicode labels", () => {
  const ds = freshMem();
  ds.remember({ id: "a", label: "café → résumé ✅" });
  ds.remember({ id: "b" });
  ds.link("a", "b", { label: "go→" });
  ds.setCursor(["a"]);
  for (const out of [ds.render(), ds.toMermaid(), ds.toDot()]) {
    expect(/^[\x00-\x7F]*$/.test(out)).toBe(true);
  }
  ds.close();
});
