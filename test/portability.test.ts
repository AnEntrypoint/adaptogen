import { test, expect } from "bun:test";
import { freshMem } from "./helpers.ts";
import { importState } from "../src/index.ts";

test("export then import yields an identical projection", () => {
  const a = freshMem();
  a.remember({ id: "a", payload: { x: 1 } });
  a.remember({ id: "b" });
  a.link("a", "b");
  a.setCursor(["a"]);
  a.defineZone("z", ["a"], { boundary: "hard" });
  const bundle = a.export();
  const b = importState(":memory:", bundle, { now: () => 1, rand: () => 0.5 });
  expect(b.getNode("a")?.payload.x).toBe(1);
  expect(b.getNode("b")).toBeTruthy();
  expect(b.cursor()).toEqual(["a"]);
  expect(b.zonesOf("a")).toEqual(["z"]);
  expect(b.verifyIntegrity().ok).toBe(true);
  a.close();
  b.close();
});

test("bootstrap seed produces a usable starter model", () => {
  const seeded = freshMem({ seed: true });
  expect(seeded.cursor()).toEqual(["idle"]);
  expect(seeded.getNode("working")).toBeTruthy();
  const sug = seeded.suggest();
  expect(sug.map((s) => s.to)).toContain("working");
  seeded.close();
});
