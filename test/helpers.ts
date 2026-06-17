import { mkdirSync, rmSync, existsSync } from "node:fs";
import { DState } from "../src/index.ts";
import type { DStateOptions } from "../src/index.ts";

let counter = 0;

export function tmpFile(): string {
  mkdirSync("./tmp", { recursive: true });
  counter += 1;
  return `./tmp/test-${process.pid}-${counter}.db`;
}

export function cleanupFile(path: string): void {
  for (const suffix of ["", "-wal", "-shm", ".lock"]) {
    const p = path + suffix;
    if (existsSync(p)) {
      try {
        rmSync(p, { force: true });
      } catch {
        /* ignore */
      }
    }
  }
}

/** Deterministic in-memory DState: monotonic clock, fixed entropy, no seed. */
export function freshMem(opts: Partial<DStateOptions> = {}): DState {
  let t = 1_000_000;
  let r = 0;
  return DState.open(":memory:", {
    seed: false,
    now: () => (t += 1),
    rand: () => {
      r = (r + 0.6180339887) % 1;
      return r;
    },
    ...opts,
  });
}
