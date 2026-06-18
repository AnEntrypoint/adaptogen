// Integration witness: a real agent session against a real on-disk store (real
// libsql, real file, real crash-recovery), exercising the whole stack end to
// end. Exits 0 only if every assertion holds. Run: `bun test.js`.

import { DState, importState } from "./src/index.js";
import { existsSync, rmSync } from "node:fs";

let n = 0;
function ok(cond, msg) {
  n++;
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

const FILE = "./tmp/integration.db";
// Best-effort temp cleanup: on Windows a just-closed sqlite WAL handle can linger
// briefly (EBUSY), which must not fail the witness -- the assertions are the test.
function cleanup() {
  for (const s of ["", "-wal", "-shm", ".lock"]) {
    try {
      if (existsSync(FILE + s)) rmSync(FILE + s, { force: true });
    } catch {
      /* handle not yet released; harmless for a temp file */
    }
  }
}
cleanup();

// 1. Open a real on-disk store; the agent grows its own self-model.
let ds = DState.open(FILE, { seed: false, lock: true });
for (const id of ["scout", "build", "review", "ship", "abort"]) ds.remember({ id, kind: "state", payload: {} });
ds.depend("build", "scout");
ds.depend("review", "build");
ds.depend("ship", "review");
ok(!ds.topo().cyclic, "dependency graph is acyclic");
ok(ds.ready([]).includes("scout"), "scout is the initial ready frontier");

ds.link("scout", "build");
ds.link("build", "review");
ds.link("review", "ship", { guard: "vars.approved == true", enforcement: "hard" });
ds.link("review", "build");
ds.link("ship", "abort", { enforcement: "soft" });
ds.defineZone("inner", ["scout", "build", "review"], { intra: "off", boundary: "soft" });

ds.setCursor(["scout"]);
ok(ds.transition("build").ok, "scout->build applies");
ok(ds.transition("review").ok, "build->review applies");

// 2. Hard enforcement blocks an unapproved ship; the cursor holds.
const blocked = ds.transition("ship");
ok(blocked.ok && blocked.value.applied === false, "unapproved ship is hard-blocked");
ok(ds.cursor()[0] === "review", "cursor stays on review after a block");
ok(ds.explainTransition("ship").value.decision === "deny", "explain reports deny");

// 3. Approved ship crosses the zone boundary (soft warn) but applies; reward it.
const ship = ds.transition("ship", { approved: true });
ok(ship.ok && ship.value.applied && ship.value.trace.decision === "warn", "approved ship warns + applies");
ds.reward(1, { trace: true, depth: 3 });
ok((ds.getStat("node", "ship")?.visits ?? 0) === 1, "ship visited once");
ok((ds.getStat("edge", ship.value.edgeId)?.emaReward ?? 0) > 0, "ship edge accrued reward");

// 4. Suggest is intuition: the rewarded next step is reachable and ranked.
ds.setCursor(["review"]);
const sug = ds.suggest({ approved: true });
ok(sug.length === 2 && sug.every((s) => s.confidence >= 0), "suggest ranks legal moves with confidence");

// 5. Self-evolution: one safe iteration must keep every invariant.
const iter = ds.selfIterate();
ok(iter.ok && iter.value.valid, "selfIterate converges without breaking invariants");
ok(ds.validate().ok, "post-iteration validate is clean");

// 6. Checkpoint, diverge, roll back to the exact prior projection.
ds.checkpoint("pre-abort");
ds.setCursor(["ship"]);
ds.transition("abort");
ok(ds.cursor()[0] === "abort", "cursor moved to abort");
ds.rollback("pre-abort");
ok(ds.cursor()[0] !== "abort", "rollback restored the pre-abort cursor");
ok(ds.verifyIntegrity().ok, "integrity intact after rollback");

// 7. Durable across a real close/reopen.
const cursorBeforeClose = ds.cursor().slice().sort();
ds.close();
ds = DState.open(FILE, { seed: false, lock: true });
ok(JSON.stringify(ds.cursor().slice().sort()) === JSON.stringify(cursorBeforeClose), "cursor survives close/reopen");
ok(ds.getNode("scout") !== null, "memory survives close/reopen");

// 8. Crash recovery: a torn trailing write is trimmed; good state survives.
const head = ds.store.lastSeq();
ds.store.db.run(
  "INSERT INTO events(seq,id,type,ts,payload,checksum,prev_hash,hash) VALUES(?,?,?,?,?,?,?,?)",
  head + 1, "ETORN", "TransitionTaken", 1, "{}", "torn", "torn", "torn",
);
const rec = ds.store.recover();
ok(rec.trimmed === 1, "recovery trims the torn trailing event");
ok(ds.verifyIntegrity().ok && ds.validate().ok, "state is consistent after recovery");

// 9. Portable: export and reconstruct an identical projection elsewhere.
const bundle = ds.export();
const clone = importState(":memory:", bundle);
ok(clone.getNode("scout") !== null && clone.verifyIntegrity().ok, "export/import reproduces a valid store");
ok(JSON.stringify(clone.cursor().sort()) === JSON.stringify(ds.cursor().sort()), "cloned cursor matches");
clone.close();

ds.close();
console.log(`integration witness OK: ${n} assertions across a full agent session (build/enforce/reward/evolve/checkpoint/recover/port)`);
cleanup();
