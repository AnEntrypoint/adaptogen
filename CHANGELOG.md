# Changelog

## 0.2.0

- refactor!: migrate the whole library from TypeScript to buildless JavaScript
  (ES modules, no compile step, no `tsc` gate). Why: run directly with zero build
  tooling; the commit gate is now `bun test` + the `bun test.js` witness + bench.
- feat!: swap the persistence layer from `bun:sqlite` to a synchronous `libsql`
  client behind a new `db.js` facade. Why: portable off Bun (libsql runs under
  plain Node too) while keeping the synchronous, Result-returning API unchanged.
  The facade re-exposes the bun:sqlite-shaped `query/run` surface, strips libsql's
  injected `_metadata` row key, and normalizes bind values.
- fix(perf): index edges on composite `(src, kind)` / `(dst, kind)`. Why: under
  libsql's planner the separate single-column indexes let a `src=? AND kind=?`
  lookup pick the low-cardinality `kind` index and scan the whole edge table,
  turning `suggest()`/`transition()` into O(n); the composite keys restore flat
  per-step cost (the bench now stays well under budget across graph sizes).
- perf(graph): `dependencyCycle` walks indexed out-edges instead of materializing
  the full adjacency every call, so adding a dependency link stays cheap on long
  chains.
- feat(agent): machine-readable self-description -- `DState.describe()` and
  `dstate describe`, plus a `--json` flag on `status`/`history`. Why: let an agent
  introspect the full verb surface, error codes, guard grammar, and enforcement
  levels, and parse CLI output instead of scraping it.
- decision: keep xstate out and skip floosie. Why: xstate models code-defined
  in-memory statecharts and would reintroduce JS-function guards the sandboxed DSL
  exists to forbid, net-growing the surface; floosie is a stream/ACP transport
  platform with no mapping onto an event-sourced state store.

## Unreleased

- feat: dstate -- agent-owned self-evolving DAG+FSM state store. Why: give one LLM
  agent a single durable structure that is its memory, policy, and intuition at
  once, and that it can keep reshaping while it works.
- chore: untrack churny plugkit runtime (.gm/prd.yml, .gm/mutables.yml). Why: the
  plan watcher rewrites them every dispatch; tracking them would keep the tree
  perpetually dirty.
- test: root integration witness (bun test.js). Why: prove the whole stack on a
  real on-disk store -- build, enforce, reward, evolve, checkpoint, crash-recover,
  port -- not just isolated units.
- feat(enforce): auto-demote a hard edge back to soft after clean runs. Why: an
  edge that hardened on a rough patch should relax once the agent uses it cleanly
  again, so policy tracks current behavior instead of ratcheting one way.
