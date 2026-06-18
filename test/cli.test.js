// CLI surface: the thin shell must expose both inspect and mutate verbs so an
// agent shelling out can drive a full session. Spawns the real cli.js against a
// temp on-disk db so the persistence + exit-code contract is exercised end to end.
import { test, expect, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import { tmpFile, cleanupFile } from "./helpers.js";

const files = [];
function db() {
  const f = tmpFile();
  files.push(f);
  return f;
}
afterEach(() => {
  for (const f of files.splice(0)) cleanupFile(f);
});

function cli(file, ...args) {
  const r = spawnSync("bun", ["run", "src/cli.js", "--db", file, ...args], { encoding: "utf8" });
  return { code: r.status, out: r.stdout ?? "", err: r.stderr ?? "" };
}

test("remember/link/cursor/transition/reward drive a session", () => {
  const f = db();
  expect(cli(f, "remember", "research", "--payload", '{"topic":"caches"}').code).toBe(0);
  expect(cli(f, "remember", "draft").code).toBe(0);
  expect(cli(f, "link", "research", "draft").code).toBe(0);
  expect(cli(f, "cursor", "research").code).toBe(0);
  const t = cli(f, "transition", "draft");
  expect(t.code).toBe(0);
  expect(t.out).toContain('"decision": "allow"');
  expect(cli(f, "reward", "1").code).toBe(0);
  expect(cli(f, "validate").code).toBe(0);
});

test("recall finds a remembered node by text", () => {
  const f = db();
  cli(f, "remember", "research", "--payload", '{"topic":"caches"}');
  const r = cli(f, "recall", "--text", "caches");
  expect(r.out).toContain('"id": "research"');
});

test("link rejects a non-finite weight with a typed error and exit 1", () => {
  const f = db();
  cli(f, "remember", "a");
  cli(f, "remember", "b");
  const r = cli(f, "link", "a", "b", "--weight", "notanum");
  expect(r.code).toBe(1);
  expect(r.out).toContain("InvalidInput");
});

test("get returns a node, and exit 1 for a missing one", () => {
  const f = db();
  cli(f, "remember", "x");
  expect(cli(f, "get", "x").code).toBe(0);
  expect(cli(f, "get", "nope").code).toBe(1);
});

test("describe exposes tunables defaults and getStat for introspection", () => {
  const f = db();
  const r = cli(f, "describe");
  expect(r.out).toContain('"tunables"');
  expect(r.out).toContain("maxPayloadBytes");
  expect(r.out).toContain("getStat");
});
