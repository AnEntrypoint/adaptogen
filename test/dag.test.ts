import { test, expect } from "bun:test";
import { freshMem } from "./helpers.ts";

test("dependency cycle rejected with path", () => {
  const ds = freshMem();
  for (const id of ["a", "b", "c"]) ds.remember({ id });
  expect(ds.depend("b", "a").ok).toBe(true);
  expect(ds.depend("c", "b").ok).toBe(true);
  const r = ds.depend("a", "c");
  expect(r.ok).toBe(false);
  if (!r.ok) {
    expect(r.error.code).toBe("CycleRejected");
    expect((r.error.details?.cycle as string[]).length).toBeGreaterThan(1);
  }
  ds.close();
});

test("transition edges are exempt from cycle check", () => {
  const ds = freshMem();
  ds.remember({ id: "a" });
  ds.remember({ id: "b" });
  ds.link("a", "b", { kind: "transition" });
  expect(ds.link("b", "a", { kind: "transition" }).ok).toBe(true);
  ds.close();
});

test("topo order respects dependencies", () => {
  const ds = freshMem();
  for (const id of ["a", "b", "c"]) ds.remember({ id });
  ds.depend("b", "a");
  ds.depend("c", "b");
  const { order, cyclic } = ds.topo();
  expect(cyclic).toBe(false);
  expect(order.indexOf("a")).toBeLessThan(order.indexOf("b"));
  expect(order.indexOf("b")).toBeLessThan(order.indexOf("c"));
  ds.close();
});

test("ready frontier advances as prerequisites complete", () => {
  const ds = freshMem();
  ds.remember({ id: "a" });
  ds.remember({ id: "b" });
  ds.depend("b", "a");
  expect(ds.ready([])).toContain("a");
  expect(ds.ready([])).not.toContain("b");
  expect(ds.ready(["a"])).toContain("b");
  ds.close();
});

test("reachability ancestors/descendants", () => {
  const ds = freshMem();
  for (const id of ["a", "b", "c"]) ds.remember({ id });
  ds.depend("b", "a");
  ds.depend("c", "b");
  expect(ds.descendants("a").sort()).toEqual(["b", "c"]);
  expect(ds.ancestors("c").sort()).toEqual(["a", "b"]);
  ds.close();
});

test("deep dependency chain does not stack-overflow", () => {
  const ds = freshMem();
  const N = 2000;
  for (let i = 0; i < N; i++) ds.remember({ id: "n" + i });
  for (let i = 1; i < N; i++) ds.depend("n" + i, "n" + (i - 1));
  const closing = ds.depend("n0", "n" + (N - 1));
  expect(closing.ok).toBe(false); // closing the chain is a cycle, caught iteratively
  expect(ds.topo().cyclic).toBe(false);
  ds.close();
});
