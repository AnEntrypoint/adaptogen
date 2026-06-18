#!/usr/bin/env bun
// Thin CLI over the facade for humans and for the agent to shell out to. ASCII
// output, conventional exit codes. Subcommands map to verbs. Pass --json to make
// the human-readable commands (status, history) emit structured JSON instead, so
// an agent parses rather than scrapes.

import { DState } from "./index.js";
import { importState } from "./portability.js";
import { readFileSync, writeFileSync } from "node:fs";

function usage() {
  process.stdout.write(
    [
      "adaptogen <command> [--db <file>] [--json] [args]",
      "",
      "inspect:",
      "  status              cursor, ranked moves, ready frontier, violations",
      "  metrics             counts, hot paths, enforcement + intuition aggregates",
      "  describe            machine-readable manifest of the full agent surface",
      "  graph               mermaid export of the active graph",
      "  dot                 graphviz dot export",
      "  suggest             ranked next moves as json",
      "  explain <to>        decision trace for transitioning to <to>",
      "  validate            invariant + integrity report (exit 1 if invalid)",
      "  history [n]         last n log entries",
      "  get <id>            node by id as json",
      "  recall              query nodes (--text --kind --tag --status --limit)",
      "",
      "mutate:",
      "  remember <id>       create/update a node (--kind --label --payload json --tags a,b)",
      "  link <from> <to>    transition/dependency edge (--kind --label --guard --enforcement --weight)",
      "  depend <node> <pre> dependency edge (node depends on pre)",
      "  unlink <edgeId>     remove an edge",
      "  enforce <e> <mode>  set edge enforcement (off|soft|hard)",
      "  cursor [ids...]     print cursor, or set it to ids",
      "  transition <to>     move the cursor (--vars json)",
      "  reward <value>      reinforce the last/chosen edge (--edgeId)",
      "",
      "durability:",
      "  compact [retain]    snapshot and prune old events",
      "  export <file>       write a portable json bundle",
      "  import <file>       load a portable json bundle into --db",
      "",
      "flags:",
      "  --db <file>         store path (default ./adaptogen.db, :memory: for ephemeral)",
      "  --json              emit structured json for status/history",
    ].join("\n") + "\n",
  );
}

// Split argv into positionals and `--flag value` pairs (`--json` is boolean).
// This lets mutation subcommands mix positionals with typed flags cleanly.
function parseArgs(args) {
  const flags = {};
  const positionals = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--json") {
      flags.json = true;
    } else if (a.startsWith("--")) {
      flags[a.slice(2)] = args[++i];
    } else {
      positionals.push(a);
    }
  }
  return { flags, positionals };
}

// Print a Result<T>: value as json on success (exit 0), error json on failure
// (exit 1). ASCII only.
function emitResult(r) {
  if (r && typeof r === "object" && "ok" in r && !r.ok) {
    process.stdout.write(JSON.stringify(r.error.toJSON(), null, 2) + "\n");
    return 1;
  }
  const value = r && typeof r === "object" && "ok" in r ? r.value : r;
  process.stdout.write(JSON.stringify(value, null, 2) + "\n");
  return 0;
}

function parseJsonFlag(s, what) {
  if (s === undefined) return undefined;
  try {
    return JSON.parse(s);
  } catch {
    process.stderr.write(`invalid json for ${what}: ${s}\n`);
    return null;
  }
}

function main() {
  const argv = typeof process !== "undefined" ? process.argv.slice(2) : [];
  const { flags, positionals } = parseArgs(argv);
  const cmd = positionals[0];
  if (!cmd || cmd === "help" || cmd === "--help") {
    usage();
    return 0;
  }
  const dbFile = flags.db ?? "./adaptogen.db";
  const json = !!flags.json;
  const rest = positionals.slice(1);

  if (cmd === "describe") {
    process.stdout.write(JSON.stringify(DState.prototype.describe.call({}), null, 2) + "\n");
    return 0;
  }

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
        if (json) {
          process.stdout.write(
            JSON.stringify(
              {
                cursor: ds.cursor(),
                moves: ds.suggest(),
                ready: ds.ready(),
                violations: ds.validate().violations.length,
                seq: ds.store.lastSeq(),
              },
              null,
              2,
            ) + "\n",
          );
        } else {
          process.stdout.write(ds.render() + "\n");
        }
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
        const entries = ds.history({ limit: n });
        if (json) {
          process.stdout.write(JSON.stringify(entries, null, 2) + "\n");
        } else {
          for (const h of entries) {
            process.stdout.write(`${h.seq}\t${h.type}\t${h.summary}\n`);
          }
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
      case "remember": {
        const id = rest[0];
        if (!id) {
          process.stderr.write("remember needs a node id\n");
          return 2;
        }
        const payload = parseJsonFlag(flags.payload, "--payload");
        if (payload === null) return 2;
        return emitResult(
          ds.remember({ id, kind: flags.kind, label: flags.label, payload, tags: flags.tags ? flags.tags.split(",") : undefined }),
        );
      }
      case "get": {
        const id = rest[0];
        if (!id) {
          process.stderr.write("get needs a node id\n");
          return 2;
        }
        const node = ds.getNode(id);
        process.stdout.write(JSON.stringify(node, null, 2) + "\n");
        return node ? 0 : 1;
      }
      case "recall": {
        const q = { text: flags.text, kind: flags.kind, tag: flags.tag, status: flags.status };
        if (flags.limit) q.limit = Number(flags.limit);
        process.stdout.write(JSON.stringify(ds.recall(q), null, 2) + "\n");
        return 0;
      }
      case "link": {
        const [from, to] = rest;
        if (!from || !to) {
          process.stderr.write("link needs <from> <to>\n");
          return 2;
        }
        const weight = flags.weight !== undefined ? Number(flags.weight) : undefined;
        return emitResult(
          ds.link(from, to, { kind: flags.kind, label: flags.label, guard: flags.guard, enforcement: flags.enforcement, weight }),
        );
      }
      case "depend": {
        const [node, prereq] = rest;
        if (!node || !prereq) {
          process.stderr.write("depend needs <node> <prereq>\n");
          return 2;
        }
        return emitResult(ds.depend(node, prereq));
      }
      case "unlink": {
        const edgeId = rest[0];
        if (!edgeId) {
          process.stderr.write("unlink needs an edge id\n");
          return 2;
        }
        return emitResult(ds.unlink(edgeId));
      }
      case "cursor": {
        if (rest.length === 0) {
          process.stdout.write(JSON.stringify(ds.cursor(), null, 2) + "\n");
          return 0;
        }
        return emitResult(ds.setCursor(rest));
      }
      case "transition": {
        const to = rest[0];
        if (!to) {
          process.stderr.write("transition needs a target node\n");
          return 2;
        }
        const vars = parseJsonFlag(flags.vars, "--vars");
        if (vars === null) return 2;
        return emitResult(ds.transition(to, vars ?? {}));
      }
      case "reward": {
        const value = Number(rest[0]);
        if (!Number.isFinite(value)) {
          process.stderr.write("reward needs a numeric value\n");
          return 2;
        }
        return emitResult(ds.reward(value, { edgeId: flags.edgeId }));
      }
      case "enforce": {
        const [edgeId, mode] = rest;
        if (!edgeId || !mode) {
          process.stderr.write("enforce needs <edgeId> <off|soft|hard>\n");
          return 2;
        }
        return emitResult(ds.setEnforcement(edgeId, mode));
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
