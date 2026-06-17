import { test, expect } from "bun:test";
import { freshMem } from "./helpers.ts";

test("append assigns strictly increasing seq", () => {
  const ds = freshMem();
  ds.remember({ id: "a" });
  ds.remember({ id: "b" });
  ds.remember({ id: "c" });
  const evs = ds.store.readEvents();
  for (let i = 1; i < evs.length; i++) expect(evs[i]!.seq).toBe(evs[i - 1]!.seq + 1);
  ds.close();
});

test("hash chain links and integrity verifies", () => {
  const ds = freshMem();
  ds.remember({ id: "a" });
  ds.remember({ id: "b" });
  const r = ds.verifyIntegrity();
  expect(r.ok).toBe(true);
  expect(r.checkedEvents).toBe(2);
  ds.close();
});

test("tampering one event localizes the break", () => {
  const ds = freshMem();
  ds.remember({ id: "a" });
  ds.remember({ id: "b" });
  ds.remember({ id: "c" });
  ds.store.db.run("UPDATE events SET payload = ? WHERE seq = 2", JSON.stringify({ id: "HACKED" }));
  const r = ds.verifyIntegrity();
  expect(r.ok).toBe(false);
  expect(r.firstBreakSeq).toBe(2);
  ds.close();
});
