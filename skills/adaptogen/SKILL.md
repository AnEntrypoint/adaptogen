---
name: adaptogen
description: >-
  Improve any agent skill -- itself included -- by running it as an
  isolated subagent, adversarially critiquing the result, and landing every
  evidence-backed fix immediately as a direct edit to that skill's own
  SKILL.md/state files (or, if the finding is in the host project rather
  than the skill, a direct edit there). Git is the entire durability layer:
  no side files, no state tracking -- a commit IS the checkpoint, the
  commit message IS the record. Use whenever asked to improve, harden, or
  debug a skill, or to build a new one from a real run instead of a guess.
allowed-tools: Read, Write, Edit, Glob, Agent, Bash(git:*)
---

# adaptogen

This skill is a DAG of states, each its own file under `states/`. This
file is the router: it maps which states exist and which transitions
between them are legal, so an agent dispatched into any state knows both
where it is and where it can go next. Each state file is self-contained
-- it repeats, inline, everything that must hold true in that state, so
it works correctly no matter which transition brought you there. A flat
list only reads correctly for the one path someone happened to trace
top-to-bottom; an edge that enters LAND straight from BUILD_NEW, or
regresses from COMMIT_CONFIRM back to RUN, needs the same invariants
holding as the straight-through path, and the only way to guarantee that
without a reader re-deriving it from prose stated once elsewhere is to
say it again, on the spot, in the state they're actually in.

That is the whole point of building skills this way: the states
**accomplish what we're trying to describe instead of describing what
we're trying to accomplish**. A reader tracing an edge acts correctly
from that edge's two endpoints alone, walking the DAG instead of
reconstructing intent from a rule stated once at the top and assumed to
still apply five states later.

This same DAG-of-states convention is not just how adaptogen is built --
it is what adaptogen builds. Every skill this skill authors or edits
(see `states/LAND.md`) is itself restructured into self-contained state
files with explicit transitions, for the same reason.

## State map

```
ORIENT --existing skill----------> RUN (target as-is)
ORIENT --new skill---------------> BUILD_NEW

BUILD_NEW --skill drafted--------> RUN

RUN --report captured------------> CRITIQUE
RUN --caller scoped one bounded pass--> report-and-STOP

CRITIQUE --finding(s) confirmed--> LAND
CRITIQUE --nothing survives the evidence gate--> STOP

LAND --every confirmed finding has a file edit + confirmed re-read--> COMMIT_CONFIRM

COMMIT_CONFIRM --commit made, regress to RUN to confirm--------------> RUN
COMMIT_CONFIRM --confirming re-run: finding gone, nothing new/worse--> STOP
COMMIT_CONFIRM --confirming re-run: finding persists or regressed----> RUN
                                                            [git revert first -- regression]
COMMIT_CONFIRM --caller scoped one bounded pass, or editing forbidden--> STOP
                                                            [no confirming re-run]
```

Seven states: `ORIENT`, `BUILD_NEW`, `RUN`, `CRITIQUE`, `LAND`,
`COMMIT_CONFIRM`. `STOP` is terminal, not a file -- reaching it means
stop dispatching and report which edge reached it, since "stopped"
alone doesn't tell the caller whether the target is now clean or a
caller-stated bound simply cut the loop short.

Every state file is at `states/<STATE>.md` relative to this file's
directory. Dispatch into a state means: Read that file, then follow it
exactly -- its own text tells you what must hold, what to do, and which
state(s) you may transition to and under what condition. Never skip
straight to a later state from prose memory of what it probably says;
Read it each time you enter it, because its exact wording is the
authority, not this map's one-line transition labels.

## Entry

1. Read `states/ORIENT.md` and follow it now.

## Hard Rules (bind in every state -- restated locally in each state
file too, so no state depends on a reader having this list in view)

1. **Never edit a skill without running it first, this pass.** An edit
   made from reading prose alone, unconfirmed by a real dispatch, is a
   guess. (`ORIENT`/`BUILD_NEW` -> `RUN` is not optional.)
2. **Never dispatch a run inline in your own context.** Subagents inherit
   nothing -- use the Agent tool with a fully self-contained prompt.
   Every fact a dispatched agent needs -- including full file contents,
   not just a path -- must be pasted into its prompt. The one exception:
   if you are yourself a subagent and cannot spawn a nested Agent, the
   leaf-agent Gotcha collapses RUN and CRITIQUE onto you directly --
   check which mode you are in before entering RUN.
3. **Never grade a run confirmatory, and never defer a real finding.** A
   second, fresh-context Agent actively hunts for fault in `CRITIQUE`.
   The moment a finding is evidence-backed (cited, re-checked, not
   asserted), `LAND` it immediately, same pass.
4. **Never invent history.** The record of what changed and why is the
   git commit made in `COMMIT_CONFIRM` -- not a separate log kept in
   sync by hand.
5. **Never remove a skill's capability from one run's evidence.** One run
   adds a state/case a skill didn't handle; a failure recurring across
   2+ independent runs (checked via the target's own `git log`) justifies
   removing or replacing something.
6. **Never leave a deterministic step as re-derived prose.** A step
   qualifies for scripting only when it contains no judgment AND a prior
   run already recorded it producing identical output from identical
   input. A step seen working once, or with any judgment branch, stays
   prose.
7. **Never treat "found" as "fixed."** A finding noted only in a
   `CRITIQUE` response with no corresponding edit in `LAND` is observed,
   not improved.
8. **Never commit without confirming co-location first.** The durability
   model assumes the target's `SKILL.md`/state files live in the same
   git repo whose `git log` is the lessons file -- a target with no such
   repo (e.g. an installed-only copy under `~/.claude/skills/` with no
   `.git` ancestor, or another machine-resident location) cannot be
   landed into; edit it in its own source repo instead, or produce
   findings only, per the leaf-agent Gotcha's "no confirming re-run"
   path.

## Gotchas

- A skill written earlier in the same turn is not `Skill`-dispatchable
  mid-turn -- the skill list loads at session start. Use the Agent tool
  to follow its `SKILL.md`/state files directly; this is the normal path
  here, not a fallback.
- **Leaf-agent / report-only path.** If you are yourself a subagent and
  cannot spawn a nested Agent, `RUN` and `CRITIQUE` collapse onto you:
  run the target's procedure directly in your own context, then do the
  critique as a deliberately fresh-eyed self-review that re-reads every
  cited file/command from disk -- never from your own run's paraphrase
  -- before accepting any finding. This is degraded-but-valid, not
  license to skip the run. In this mode -- or whenever the caller scoped
  one bounded pass, or editing is forbidden -- `COMMIT_CONFIRM`'s
  confirming re-run is waived: deliver the confirmed findings and their
  proposed fixes as the pass's product and say plainly that no
  confirming re-run was possible. A found-and-reported finding is a
  valid deliverable here; Hard Rule 7 is not violated because nothing
  was claimed fixed.
- **Stay ASCII.** Some host repos gate commits on an ASCII-only
  `SKILL.md`/state files (smart quotes, em-dashes, and arrows are the
  usual violators) -- use plain `--`, `->`, and straight quotes
  regardless. Before committing in `COMMIT_CONFIRM`, check whether the
  host repo actually has a validator or lint step (look for
  `.github/workflows`, a documented lint script) and run it if one
  exists; if none exists, do not invent one to run -- the ASCII-safe
  habit is the fallback, not license to assume a specific script is
  present.
- Only adaptogen (walking `ORIENT` through `COMMIT_CONFIRM`/`STOP`)
  edits a target's files. A target run standalone, outside this loop,
  just executes its current instructions -- there's no marker to check,
  because there's nothing conditional to write.
- A target skill still shaped as a single flat `SKILL.md` (no `states/`
  directory) is not a defect to fix reflexively -- `LAND` decides,
  per-pass, whether restructuring it into states is itself an
  evidence-backed finding for *this* pass, same as any other edit.
