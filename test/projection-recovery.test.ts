import { test, expect } from "bun:test";
import { freshMem, tmpFile, cleanupFile } from "./helpers.ts";
import { DState } from "../src/index.ts";

test("incremental projection equals full rebuild", () => {
  const ds = freshMem();
  ds.remember({ id: "a", payload: { x: 1 } });
  ds.remember({ id: "b" });
  ds.link("a", "b");
  ds.setCursor(["a"]);
  const before = JSON.stringify(ds.store.allNodes());
  ds.store.rebuild();
  expect(JSON.stringify(ds.store.allNodes())).toBe(before);
  expect(ds.cursor()).toEqual(["a"]);
  ds.close();
});

test("snapshot + tail recovery equals full state", () => {
  const ds = freshMem();
  ds.remember({ id: "a" });
  ds.snapshot();
  ds.remember({ id: "b" });
  ds.store.recover();
  expect(ds.getNode("a")).toBeTruthy();
  expect(ds.getNode("b")).toBeTruthy();
  expect(ds.verifyIntegrity().ok).toBe(true);
  ds.close();
});

test("recovery trims a torn trailing event", () => {
  const ds = freshMem();
  ds.remember({ id: "a" });
  ds.remember({ id: "b" });
  const head = ds.store.lastSeq();
  ds.store.db.run(
    "INSERT INTO events(seq,id,type,ts,payload,checksum,prev_hash,hash) VALUES(?,?,?,?,?,?,?,?)",
    head + 1,
    "EBAD",
    "TransitionTaken",
    1,
    "{}",
    "torn",
    "torn",
    "torn",
  );
  const rec = ds.store.recover();
  expect(rec.trimmed).toBe(1);
  expect(ds.store.lastSeq()).toBe(head);
  expect(ds.verifyIntegrity().ok).toBe(true);
  ds.close();
});

test("session reopen preserves full state and cursor", () => {
  const f = tmpFile();
  const a = DState.open(f, { seed: false, lock: true });
  a.remember({ id: "a" });
  a.remember({ id: "b" });
  a.link("a", "b");
  a.setCursor(["a"]);
  a.close();
  const b = DState.open(f, { seed: false, lock: true });
  expect(b.getNode("a")).toBeTruthy();
  expect(b.cursor()).toEqual(["a"]);
  expect(b.verifyIntegrity().ok).toBe(true);
  b.close();
  cleanupFile(f);
});
