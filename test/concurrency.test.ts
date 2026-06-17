import { test, expect } from "bun:test";
import { tmpFile, cleanupFile, freshMem } from "./helpers.ts";
import { DState } from "../src/index.ts";

test("a second writer is refused the lock", () => {
  const f = tmpFile();
  const a = DState.open(f, { seed: false, lock: true });
  let threw = false;
  try {
    const b = DState.open(f, { seed: false, lock: true });
    b.close();
  } catch (e) {
    threw = true;
    expect((e as { code?: string }).code).toBe("LockHeld");
  }
  expect(threw).toBe(true);
  a.close();
  cleanupFile(f);
});

test("optimistic version conflict is rejected", () => {
  const ds = freshMem();
  ds.remember({ id: "a", payload: { v: 1 } });
  const r = ds.remember({ id: "a", payload: { v: 2 }, expectVersion: 5 });
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.error.code).toBe("Conflict");
  // matching expected version succeeds
  expect(ds.remember({ id: "a", payload: { v: 2 }, expectVersion: 1 }).ok).toBe(true);
  ds.close();
});
