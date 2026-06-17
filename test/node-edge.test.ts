import { test, expect } from "bun:test";
import { freshMem } from "./helpers.ts";

test("node create/get roundtrip and version bump", () => {
  const ds = freshMem();
  ds.remember({ id: "n1", label: "first", payload: { x: 1 } });
  expect(ds.getNode("n1")?.payload.x).toBe(1);
  expect(ds.getNode("n1")?.version).toBe(1);
  ds.remember({ id: "n1", payload: { x: 2 } });
  expect(ds.getNode("n1")?.version).toBe(2);
  expect(ds.getNode("n1")?.payload.x).toBe(2);
  ds.close();
});

test("archive hides from active recall", () => {
  const ds = freshMem();
  ds.remember({ id: "n1" });
  ds.archive("n1");
  expect(ds.getNode("n1")?.status).toBe("archived");
  expect(ds.recall({ status: "active" }).find((n) => n.id === "n1")).toBeUndefined();
  ds.close();
});

test("recall by text matches label and payload", () => {
  const ds = freshMem();
  ds.remember({ id: "n1", label: "alpha beta", payload: { note: "gamma" } });
  ds.remember({ id: "n2", label: "delta" });
  expect(ds.recall({ text: "alpha" }).map((h) => h.id)).toContain("n1");
  expect(ds.recall({ text: "gamma" }).map((h) => h.id)).toContain("n1");
  ds.close();
});

test("recall by kind and tag", () => {
  const ds = freshMem();
  ds.remember({ id: "n1", kind: "fact", tags: ["red"] });
  ds.remember({ id: "n2", kind: "task", tags: ["blue"] });
  expect(ds.recall({ kind: "fact" }).map((h) => h.id)).toEqual(["n1"]);
  expect(ds.recall({ tag: "blue" }).map((h) => h.id)).toEqual(["n2"]);
  ds.close();
});

test("edge to missing node rejected; both kinds creatable", () => {
  const ds = freshMem();
  ds.remember({ id: "a" });
  ds.remember({ id: "b" });
  const bad = ds.link("a", "ghost");
  expect(bad.ok).toBe(false);
  if (!bad.ok) expect(bad.error.code).toBe("NotFound");
  expect(ds.link("a", "b", { kind: "transition" }).ok).toBe(true);
  expect(ds.link("a", "b", { kind: "dependency" }).ok).toBe(true);
  ds.close();
});
