import { test, expect } from "bun:test";
import { freshMem } from "./helpers.js";

// The hardest reachable node, validated first in spirit: one session that drives
// storage, the FSM, soft AND hard enforcement, the DAG, and intuition, then
// survives a torn-write crash and recovers to a consistent state.
test("full agent session survives a torn-write crash and recovers consistently", () => {
  const ds = freshMem();

  // memory nodes
  for (const id of ["plan", "build", "verify", "ship", "rollback"]) {
    ds.remember({ id, kind: "state", payload: {} });
  }

  // dependency DAG: plan -> build -> verify -> ship
  ds.depend("build", "plan");
  ds.depend("verify", "build");
  ds.depend("ship", "verify");
  expect(ds.topo().cyclic).toBe(false);

  // FSM transitions
  ds.link("plan", "build");
  ds.link("build", "verify");
  ds.link("verify", "ship", { guard: "vars.green == true", enforcement: "hard" });
  ds.link("verify", "build"); // retry loop
  ds.link("ship", "rollback", { enforcement: "soft" });

  // a safe zone with a soft boundary the agent maps for itself
  ds.defineZone("dev", ["plan", "build", "verify"], { intra: "off", boundary: "soft" });
  ds.setCursor(["plan"]);

  // walk forward
  expect(ds.transition("build").ok && ds.cursor()).toEqual(["build"]);
  expect(ds.transition("verify").ok && ds.cursor()).toEqual(["verify"]);

  // hard-blocked ship while not green
  const blocked = ds.transition("ship");
  expect(blocked.ok && blocked.value.applied).toBe(false);
  expect(ds.cursor()).toEqual(["verify"]);

  // retry loop within the safe zone (intra free)
  expect(ds.transition("build").ok).toBe(true);
  expect(ds.transition("verify").ok).toBe(true);

  // green now: ship crosses the zone boundary (soft warn) but applies
  const ship = ds.transition("ship", { green: true });
  expect(ship.ok && ship.value.applied).toBe(true);
  expect(ship.ok && ship.value.trace.decision).toBe("warn");

  // reward the path, then checkpoint
  ds.reward(1, { trace: true, depth: 3 });
  ds.checkpoint("shipped");

  // a couple more committed ops
  ds.setCursor(["ship"]);
  ds.transition("rollback");

  // capture pre-crash truth
  const cursorBefore = ds.cursor();
  const shipVisits = ds.getStat("node", "ship")?.visits;
  expect(ds.verifyIntegrity().ok).toBe(true);
  expect(ds.validate().ok).toBe(true);

  // simulate a crash mid-write: a torn, uncommitted trailing event row
  const head = ds.store.lastSeq();
  ds.store.db.run(
    "INSERT INTO events(seq,id,type,ts,payload,checksum,prev_hash,hash) VALUES(?,?,?,?,?,?,?,?)",
    head + 1,
    "ETORN",
    "TransitionTaken",
    1,
    "{}",
    "torn",
    "torn",
    "torn",
  );

  // recover: the torn write is trimmed, the good state is reconstructed
  const rec = ds.store.recover();
  expect(rec.trimmed).toBe(1);
  expect(ds.verifyIntegrity().ok).toBe(true);
  expect(ds.validate().ok).toBe(true);
  expect(ds.cursor()).toEqual(cursorBefore);
  expect(ds.getStat("node", "ship")?.visits).toBe(shipVisits);

  ds.close();
});
