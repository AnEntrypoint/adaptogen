# adaptogen

An agent-owned, self-evolving state system. One LLM agent interacts with it
directly -- there is no second model in the loop. The agent builds a graph that
is, at the same time, its **memory**, its **policy**, and its **intuition**, and
keeps reshaping that graph while it works.

The graph is a hybrid:

- a **DAG** of dependency edges (what must happen before what), kept acyclic, and
- an **FSM** of transition edges (which state can follow which), with a cursor the
  agent moves along.

Every node is a memory cell (its `payload`). Every transition edge carries policy
(a guard plus soft/hard enforcement) and accrues intuition (visit/reward stats
that drive `suggest()`). Zones let the agent fence off "safe limited transition
zones" it may move within freely while crossing their boundary stays governed.

```
  memory            policy                 intuition
  (node.payload)    (guard + enforcement)  (edge stats -> suggest)
        \                |                      /
         \               |                     /
          +----------- one graph --------------+
                 DAG (deps) + FSM (transitions)
```

## Why event-sourced over SQLite

The spine is an append-only, hash-chained event log; the queryable graph is a
projection of it (SQLite via libsql, WAL). This gets durability, crash recovery,
time-travel, audit, and deterministic replay from one mechanism, which is exactly
what "construct your own persistence and continuously evolve it reliably" needs.

It is buildless JavaScript (ES modules, no compile step) on Bun, persisting
through a synchronous `libsql` client behind a thin db facade. Dependencies were
surveyed and the FSM/graph libraries rejected in favor of a smaller maintained
surface:

- **XState** models statically-declared machines with code guards; adaptogen's
  machine is constructed and mutated at runtime, carries intuition + persistence,
  and runs agent-authored guards through a sandboxed DSL (never `eval`). Poor fit.
- **graphology** is in-memory only; topo sort and cycle detection are ~20 lines
  here and must integrate with the persistent projection anyway.
- **libsql** is the one runtime dependency: a synchronous SQLite that runs under
  Bun and plain Node, keeping the store portable off Bun while staying buildless.

Net: libsql + hand-rolled small graph algorithms + no FSM library.

## Install / run

```
bun install
bun test          # unit tests
bun test.js       # end-to-end integration witness
bun run bench     # large-graph hot loop + recovery timing
```

Requires Bun and the `libsql` package. SQLite with FTS5 is used for recall, with
a LIKE fallback when FTS5 is absent.

## Quick start

```js
import { Adaptogen } from "adaptogen"; // `DState` is also exported as an alias

const ds = Adaptogen.open("./agent.db"); // recovers, locks, seeds a starter model

ds.remember({ id: "research", payload: { topic: "caches" } }); // memory
ds.remember({ id: "draft" });
ds.link("research", "draft");          // a transition edge
ds.depend("draft", "research");        // draft depends on research (DAG)

ds.setCursor(["research"]);
ds.transition("draft");                // move the cursor along the FSM
ds.reward(1);                          // reinforce the path just taken

console.log(ds.render());              // ASCII live view of the current state
ds.close();
```

## The verb surface

Memory

- `remember({id, kind?, label?, payload?, tags?, status?, expectVersion?})` -- create/update a node; `payload` is the memory. Optimistic concurrency via `expectVersion`.
- `recall({id?|kind?|tag?|status?|text?, limit?})` -- query nodes (FTS or LIKE).
- `getNode(id)`, `archive(id)`, `deprecate(id)`.

Structure

- `link(from, to, {kind?, label?, guard?, enforcement?, weight?})` -- transition or dependency edge.
- `depend(node, prereq)` -- dependency edge; rejected with the cycle path if it would close a loop.
- `unlink(edgeId)`, `setEnforcement(edgeId, mode)`.
- `ready(done?)`, `topo()`, `reachable(from, kind?)`, `ancestors(id)`, `descendants(id)`.

FSM

- `setCursor(nodes)`, `cursor()`.
- `transition(to, vars?)` -- legality + guard + zone + enforcement + record + stats, all at once. Returns a decision trace.
- `legalMoves(vars?)`, `explainTransition(to, vars?)`.

Zones (safe limited transition zones)

- `defineZone(name, members, {intra?, boundary?})`, `addToZone`, `removeFromZone`, `zonesOf(id)`, `zones()`.
- `deriveZone(seed, predicate?)` -- the agent maps out a safe zone automatically from the reachable subset satisfying a guard predicate, then ratifies it.

Intuition

- `suggest(vars?)` -- ranks legal moves by a learned value (UCB by default; epsilon/greedy configurable), each with a confidence.
- `reward(value, {edgeId?|trace?, depth?, lambda?})` -- single-step or decayed multi-step credit assignment.
- `getStat("node"|"edge", id)`.

Self-evolution

- `splitState`, `mergeStates`, `gc`, `migrate(kind, fn)`.
- `optimize()` -- mines graph + stats for dead nodes, duplicate/low-value edges, soft->hard promotion candidates, zone tightening.
- `reweight()`, `selfIterate()` -- one safe closed loop: reweight -> apply safe suggestions -> validate -> rollback on regression.

Durability & integrity

- `checkpoint(name)`, `rollback(name)`, `branch(file)`/`discard()`.
- `snapshot()`, `compact(retain?)`.
- `validate()`, `repair()`, `verifyIntegrity()`.

Observe & port

- `render()`, `metrics()`, `toMermaid()`, `toDot()`, `history(filter?)`.
- `describe()` -- machine-readable manifest of the whole verb surface, error
  codes, guard DSL grammar, and enforcement levels, so an agent can introspect
  the API without reading source.
- `export()` / `importState(file, bundle)`.
- `setTunable(key, value)` / `getTunables()`.

## Soft vs hard enforcement

A transition is allowed unless a policy reason applies: a failing guard, a zone
boundary crossing, or an above-`off` intra-zone policy. Each reason is governed
by an enforcement mode and the strictest decision wins:

- `off` -- allowed (a note in the trace).
- `soft` -- allowed, but flagged and counted; after `escalationThreshold` soft
  violations the edge auto-promotes to `hard`.
- `hard` -- blocked; a `BlockedAttempt` is recorded with the reason; the cursor
  does not move.

Edge enforcement overrides zone, which overrides the global default. An edge set
to `off` is the explicit **gate** that lets an otherwise-blocked crossing through.
`explainTransition` returns the full deciding trace.

## Self-iteration loop

```
  transition outcome -> stats -> optimize() suggestions
        ^                                   |
        |                                   v
     validate() <---- apply safe edits (gc, promote, reweight)
        |
        +-- on broken invariant: rollback to the pre-iteration checkpoint
```

`selfIterate()` runs exactly one safe pass and reports the deltas, so the agent
iterates on its own abilities without ever leaving the graph in an invalid state.

## Durability model

- WAL + hash-chained, checksummed events.
- Boot `recover()` verifies the chain, trims a torn/partial trailing write to the
  last good seq, loads the newest snapshot at/under head, and replays the tail.
- Snapshots + compaction bound replay cost; recovery time is a function of the
  snapshot tail, not the whole log.

## CLI

The CLI is a thin shell over the JS facade; an agent can drive a full session
(inspect and mutate) without writing JS. ASCII output, conventional exit codes,
`--json` for parseable status/history.

Inspect:

```
adaptogen status --db ./agent.db     # cursor, ranked moves, ready frontier, violations
adaptogen status --json              # same, as structured json for an agent to parse
adaptogen describe                   # machine-readable manifest (verbs, errors, guard DSL, tunables)
adaptogen graph / dot                # mermaid / graphviz export
adaptogen suggest                    # ranked next moves (json)
adaptogen explain <to>               # decision trace
adaptogen validate                   # invariants + integrity (exit 1 if invalid)
adaptogen history [n] [--json]
adaptogen get <id>                   # node by id
adaptogen recall --text <q> [--kind --tag --status --limit]
```

Mutate:

```
adaptogen remember <id> [--kind --label --payload '<json>' --tags a,b]
adaptogen link <from> <to> [--kind --label --guard '<expr>' --enforcement --weight]
adaptogen depend <node> <prereq>     # node depends on prereq (DAG edge)
adaptogen unlink <edgeId>
adaptogen enforce <edgeId> <off|soft|hard>
adaptogen cursor [ids...]            # print cursor, or set it
adaptogen transition <to> [--vars '<json>']
adaptogen reward <value> [--edgeId <id>]
```

Durability:

```
adaptogen compact [retain]
adaptogen export <file> / import <file>
```

License: MIT.
