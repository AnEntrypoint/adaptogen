// The patterns an agent actually runs: the observe->decide->act loop, the
// documented describe() snippets being real, manifest accuracy (no stale verb),
// and the single-writer lock contract.
import { test, expect, afterEach } from "bun:test";
import { freshMem, tmpFile, cleanupFile } from "./helpers.js";
import { DState, MANIFEST } from "../src/index.js";

const files = [];
afterEach(() => {
  for (const f of files.splice(0)) cleanupFile(f);
});

test("full observe -> decide -> act cycle advances the cursor and learns", () => {
  const ds = freshMem();
  for (const id of ["plan", "build", "ship"]) ds.remember({ id });
  ds.link("plan", "build");
  ds.link("build", "ship");
  ds.setCursor(["plan"]);

  let steps = 0;
  let s = ds.step({ reward: 1 });
  while (s.ok && !s.value.done) {
    steps++;
    s = ds.step({ reward: 1 });
  }
  expect(s.ok).toBe(true);
  expect(ds.cursor()).toEqual(["ship"]);
  expect(ds.getStat("node", "ship").visits).toBeGreaterThan(0);
  expect(steps).toBeGreaterThan(0);
  ds.close();
});

test("step is reentrant from a fresh cursor and rejects an unknown explicit target", () => {
  const ds = freshMem();
  ds.remember({ id: "a" });
  ds.remember({ id: "b" });
  ds.link("a", "b");
  ds.setCursor(["a"]);
  expect(ds.step({ to: "ghost" }).ok).toBe(false); // no edge to ghost
  ds.step({});
  // back to start and go again
  ds.setCursor(["a"]);
  expect(ds.step({}).value.to).toBe("b");
  ds.close();
});

test("describe() patterns are present and shaped like runnable snippets", () => {
  const p = MANIFEST.patterns;
  for (const key of ["minimal_session", "step_loop", "checkpoint_rollback", "reward_decay", "zones", "self_evolution"]) {
    expect(Array.isArray(p[key])).toBe(true);
    expect(p[key].length).toBeGreaterThan(0);
  }
});

test("every verb the manifest advertises exists on a DState instance (no stale verb)", () => {
  const ds = freshMem();
  const missing = [];
  for (const group of Object.values(MANIFEST.verbs)) {
    for (const [name] of group) {
      if (typeof ds[name] !== "function") missing.push(name);
    }
  }
  expect(missing).toEqual([]);
  ds.close();
});

test("every error code carries an actionable hint in the manifest", () => {
  for (const code of MANIFEST.errorCodes) {
    expect(typeof MANIFEST.errorHints[code]).toBe("string");
    expect(MANIFEST.errorHints[code].length).toBeGreaterThan(0);
  }
});

test("a second writer is refused the lock, and close releases it", () => {
  const f = tmpFile();
  files.push(f);
  const a = DState.open(f, { lock: true });
  expect(() => DState.open(f, { lock: true })).toThrow(); // LockHeld
  a.close();
  const b = DState.open(f, { lock: true }); // freed
  expect(b).toBeTruthy();
  b.close();
});
