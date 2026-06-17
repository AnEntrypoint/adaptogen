import { test, expect } from "bun:test";
import { freshMem } from "./helpers.ts";
import { decayedReward } from "../src/intuition.ts";
import type { Stat } from "../src/types.ts";

test("similarity recall ranks by cosine and degrades without embeddings", () => {
  const ds = freshMem();
  ds.remember({ id: "a", embedding: [1, 0, 0] });
  ds.remember({ id: "b", embedding: [0, 1, 0] });
  ds.remember({ id: "c", embedding: [0.9, 0.1, 0] });
  const hits = ds.recall({ embedding: [1, 0, 0], limit: 2 });
  expect(hits.map((h) => h.id)).toEqual(["a", "c"]);
  // a node with no embedding is unreachable by similarity but found by text
  ds.remember({ id: "d", label: "zzz" });
  expect(ds.recall({ text: "zzz" }).map((h) => h.id)).toContain("d");
  ds.close();
});

test("decayedReward halves over each half-life of staleness", () => {
  const stat: Stat = {
    scopeKind: "edge",
    scopeId: "e",
    visits: 1,
    successes: 1,
    failures: 0,
    softViolations: 0,
    blocks: 0,
    emaReward: 1,
    lastSeq: 0,
  };
  expect(decayedReward(stat, 0, 100)).toBeCloseTo(1, 6);
  expect(decayedReward(stat, 100, 100)).toBeCloseTo(0.5, 6);
  expect(decayedReward(stat, 200, 100)).toBeCloseTo(0.25, 6);
});

test("merge replays branch-only work onto main", () => {
  const main = freshMem();
  main.remember({ id: "a" });
  const br = main.branch(":memory:");
  expect(br.ok).toBe(true);
  if (br.ok) {
    br.value.remember({ id: "b" });
    expect(main.getNode("b")).toBeNull();
    const m = main.merge(br.value);
    expect(m.ok).toBe(true);
    expect(main.getNode("b")).toBeTruthy();
    expect(main.verifyIntegrity().ok).toBe(true);
    br.value.close();
  }
  main.close();
});

test("overlapping zones resolve to the strictest boundary (nesting)", () => {
  const ds = freshMem();
  ds.remember({ id: "in" });
  ds.remember({ id: "out" });
  ds.link("in", "out");
  ds.defineZone("soft", ["in"], { boundary: "soft" });
  ds.defineZone("hard", ["in"], { boundary: "hard" });
  ds.setCursor(["in"]);
  // `in` is in both zones; crossing out must take the strictest boundary (hard)
  const r = ds.transition("out");
  expect(r.ok && r.value.applied).toBe(false);
  ds.close();
});
