#!/usr/bin/env bun
// Thin CLI over the facade for humans and for the agent to shell out to. ASCII
// output, conventional exit codes. Subcommands map to verbs.

import { DState } from "./index.ts";
import { importState } from "./portability.ts";
import { readFileSync, writeFileSync } from "node:fs";

function usage(): void {
  process.stdout.write(
    [
      "dstate <command> [--db <file>] [args]",
      "",
      "commands:",
      "  status              cursor, ranked moves, ready frontier, violations",
      "  metrics             counts, hot paths, enforcement + intuition aggregates",
      "  graph               mermaid export of the active graph",
      "  dot                 graphviz dot export",
      "  suggest             ranked next moves as json",
      "  explain <to>        decision trace for transitioning to <to>",
      "  validate            invariant + integrity report (exit 1 if invalid)",
      "  compact [retain]    snapshot and prune old events",
      "  history [n]         last n log entries",
      "  export <file>       write a portable json bundle",
      "  import <file>       load a portable json bundle into --db",
      "",
      "default --db is ./dstate.db (use :memory: for ephemeral)",
    ].join("\n") + "\n",
  );
}

function getFlag(args: string[], name: string, def: string): string {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1]! : def;
}

function main(): number {
  const argv = (typeof process !== "undefined" ? process.argv.slice(2) : []);
  const cmd = argv[0];
  if (!cmd || cmd === "help" || cmd === "--help") {
    usage();
    return 0;
  }
  const dbFile = getFlag(argv, "--db", "./dstate.db");
  const rest = argv.slice(1).filter((a, i, arr) => a !== "--db" && arr[i - 1] !== "--db");

  if (cmd === "import") {
    const file = rest[0];
    if (!file) {
      process.stderr.write("import needs a file\n");
      return 2;
    }
    const bundle = JSON.parse(readFileSync(file, "utf8"));
    const ds = importState(dbFile, bundle, { lock: false });
    process.stdout.write(`imported ${bundle.events.length} events into ${dbFile}\n`);
    ds.close();
    return 0;
  }

  const ds = DState.open(dbFile, { lock: false, seed: false });
  try {
    switch (cmd) {
      case "status":
        process.stdout.write(ds.render() + "\n");
        return 0;
      case "metrics":
        process.stdout.write(JSON.stringify(ds.metrics(), null, 2) + "\n");
        return 0;
      case "graph":
        process.stdout.write(ds.toMermaid() + "\n");
        return 0;
      case "dot":
        process.stdout.write(ds.toDot() + "\n");
        return 0;
      case "suggest":
        process.stdout.write(JSON.stringify(ds.suggest(), null, 2) + "\n");
        return 0;
      case "explain": {
        const to = rest[0];
        if (!to) {
          process.stderr.write("explain needs a target node\n");
          return 2;
        }
        const r = ds.explainTransition(to);
        process.stdout.write(JSON.stringify(r.ok ? r.value : r.error.toJSON(), null, 2) + "\n");
        return r.ok ? 0 : 1;
      }
      case "validate": {
        const report = ds.validate();
        process.stdout.write(JSON.stringify(report, null, 2) + "\n");
        return report.ok ? 0 : 1;
      }
      case "compact": {
        const retain = rest[0] ? Number(rest[0]) : 0;
        process.stdout.write(JSON.stringify(ds.compact(retain)) + "\n");
        return 0;
      }
      case "history": {
        const n = rest[0] ? Number(rest[0]) : 20;
        for (const h of ds.history({ limit: n })) {
          process.stdout.write(`${h.seq}\t${h.type}\t${h.summary}\n`);
        }
        return 0;
      }
      case "export": {
        const file = rest[0];
        const bundle = ds.export();
        if (file) {
          writeFileSync(file, JSON.stringify(bundle));
          process.stdout.write(`exported ${bundle.events.length} events to ${file}\n`);
        } else {
          process.stdout.write(JSON.stringify(bundle) + "\n");
        }
        return 0;
      }
      default:
        usage();
        return 2;
    }
  } finally {
    ds.close();
  }
}

const code = main();
if (typeof process !== "undefined") process.exit(code);
