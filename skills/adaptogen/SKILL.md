---
name: adaptogen
description: >-
  Improve any agent skill -- itself included -- by running it as an
  isolated subagent, adversarially critiquing the result, and landing every
  evidence-backed fix immediately as a direct edit to that skill's own
  files (or, if the finding is in the host project rather than the skill,
  a direct edit there). Git is the entire durability layer: no side files,
  no state tracking -- a commit IS the checkpoint, the commit message IS
  the record. Use whenever asked to improve, harden, or debug a skill, or
  to build a new one from a real run instead of a guess.
allowed-tools: Read, Write, Edit, Glob, Agent, Skill, Bash(git:*)
---

# adaptogen

adaptogen is a DAG of states, and each state is its own real Agent
Skill, not a file inside this one. This `SKILL.md` is the router: it
names which sibling skills exist and which transitions between them are
legal, so an agent entering here knows where to go first and how to
read the map for every later hop. Every sibling skill's own instructions
repeat, inline, everything that must hold true in that state -- because
skills do not share context automatically, each one must be
self-contained on its own, not merely a chapter of this one.

That is the whole point of building skills this way: the states
**accomplish what we're trying to describe instead of describing what
we're trying to accomplish**. A reader entering any one sibling skill
acts correctly from that skill's own text alone, invoking the next skill
the DAG calls for, instead of reconstructing intent from a rule stated
once here and assumed to still apply three hops later.

This same DAG-of-skills convention is not just how adaptogen is built --
it is what adaptogen builds. Every skill this skill authors or edits
(see `adaptogen-land`) is itself restructured into a family of
self-contained sibling skills with explicit transitions, for the same
reason -- and always kept compliant with the agentskills.io
specification (one `SKILL.md` per skill folder, `name` matching the
folder, valid frontmatter): a DAG of skills is still, at every node, a
normal, independently valid, independently discoverable Agent Skill.

## State map

```
adaptogen-orient --existing skill----------> adaptogen-run (target as-is)
adaptogen-orient --new skill----------------> adaptogen-build-new

adaptogen-build-new --skill drafted---------> adaptogen-run

adaptogen-run --report captured-------------> adaptogen-critique
adaptogen-run --caller scoped one bounded pass--> report-and-STOP

adaptogen-critique --finding(s) confirmed---> adaptogen-land
adaptogen-critique --nothing survives the evidence gate--> STOP

adaptogen-land --every confirmed finding has a file edit + confirmed re-read--> adaptogen-commit-confirm

adaptogen-commit-confirm --commit made, regress to confirm--> adaptogen-run
adaptogen-commit-confirm --confirming re-run: finding gone, nothing new/worse--> STOP
adaptogen-commit-confirm --confirming re-run: finding persists or regressed----> adaptogen-run
                                                            [git revert first -- regression]
adaptogen-commit-confirm --caller scoped one bounded pass, or editing forbidden--> STOP
                                                            [no confirming re-run]
```

Six state-skills: `adaptogen-orient`, `adaptogen-build-new`,
`adaptogen-run`, `adaptogen-critique`, `adaptogen-land`,
`adaptogen-commit-confirm`. `STOP` is terminal, not a skill -- reaching
it means stop dispatching and report which edge reached it, since
"stopped" alone doesn't tell the caller whether the target is now clean
or a caller-stated bound simply cut the loop short.

Each state-skill is a real, independent sibling skill directory next to
this one (`skills/adaptogen-<name>/`). Entering a state means: dispatch
`Skill(skill="adaptogen-<name>")` (or, if that skill was itself written
earlier in the same turn and is not yet `Skill`-dispatchable per the
Gotcha below, use the Agent tool to follow its `SKILL.md` directly), and
follow it exactly -- its own text tells you what must hold, what to do,
which sibling skill(s) you may transition to, under what condition, and
exactly what state to carry forward into that next dispatch (skills
share no context automatically -- name every fact the next skill needs
explicitly when you invoke it). Never skip straight to a later state
from prose memory of what it probably says; a fresh invocation reads
the current, real text of that skill, not this map's one-line
transition labels, which are a map, not the authority.

## Entry

1. Dispatch `Skill(skill="adaptogen-orient")` and follow it now.

## Hard Rules (bind in every state -- restated locally in each
state-skill too, so no state depends on a reader having this list in
view)

1. **Never edit a skill without running it first, this pass.** An edit
   made from reading prose alone, unconfirmed by a real dispatch, is a
   guess. (`adaptogen-orient`/`adaptogen-build-new` ->
   `adaptogen-run` is not optional.)
2. **Never dispatch a run inline in your own context.** Subagents inherit
   nothing -- use the Agent tool with a fully self-contained prompt.
   Every fact a dispatched agent needs -- including full file contents,
   not just a path -- must be pasted into its prompt. The same rule
   applies to invoking sibling skills in this DAG: state carried across a
   `Skill()` transition must be stated explicitly in that turn, not
   assumed to persist.
3. **Never grade a run confirmatory, and never defer a real finding.** A
   second, fresh-context Agent actively hunts for fault in
   `adaptogen-critique`. The moment a finding is evidence-backed (cited,
   re-checked, not asserted), `adaptogen-land` it immediately, same pass.
4. **Never invent history.** The record of what changed and why is the
   git commit made in `adaptogen-commit-confirm` -- not a separate log
   kept in sync by hand.
5. **Never remove a skill's capability from one run's evidence.** One run
   adds a state/case a skill didn't handle; a failure recurring across
   2+ independent runs (checked via the target's own `git log`) justifies
   removing or replacing something.
6. **Never leave a deterministic step as re-derived prose.** A step
   qualifies for scripting only when it contains no judgment AND a prior
   run already recorded it producing identical output from identical
   input. A step seen working once, or with any judgment branch, stays
   prose.
7. **Never treat "found" as "fixed."** A finding noted only in
   `adaptogen-critique`'s response with no corresponding edit in
   `adaptogen-land` is observed, not improved.
8. **Never commit without confirming co-location first.** The durability
   model assumes the target's skill files live in the same git repo whose
   `git log` is the lessons file -- a target with no such repo (e.g. an
   installed-only copy with no `.git` ancestor, or a `.git` ancestor with
   no real commit history about this target) cannot be landed into; edit
   it in its own source repo instead, or produce findings only.
9. **Every state-skill in this DAG stays agentskills.io-compliant on its
   own.** Each is a normal skill: valid frontmatter (`name` matching its
   directory, non-empty `description`), Markdown body, no format that
   only makes sense chained to siblings. A DAG is a set of valid skills
   plus a map between them, never a single skill's content spread across
   files an agent must open just to have working instructions.

## Gotchas

- A skill written earlier in the same turn is not `Skill`-dispatchable
  mid-turn -- the skill list loads at session start. Use the Agent tool
  to follow its `SKILL.md` directly instead; this is the normal path for
  a state-skill just authored or edited this pass, not a fallback.
- Only adaptogen (walking `adaptogen-orient` through
  `adaptogen-commit-confirm`/`STOP`) edits a target's files. A target run
  standalone, outside this loop, just executes its current instructions
  -- there's no marker to check, because there's nothing conditional to
  write.
- A target skill still shaped as a single flat `SKILL.md` (no sibling
  state-skills) is not a defect to fix reflexively --
  `adaptogen-land` decides, per-pass, whether restructuring it into a
  DAG of skills is itself an evidence-backed finding for *this* pass,
  same as any other edit. A one- or two-step skill should usually stay a
  single skill; splitting it into a DAG the task doesn't need is not
  progress.
