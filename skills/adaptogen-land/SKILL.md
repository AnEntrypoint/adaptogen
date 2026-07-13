---
name: adaptogen-land
description: >-
  Edit the target skill's actual files for every finding confirmed by
  adaptogen-critique's evidence gate, reading each edit back to confirm
  it landed. Also the state that restructures a target skill into a DAG
  of self-contained sibling skills, agentskills.io-compliant, when a
  pass's evidence calls for it. Use when adaptogen's router sends you
  here with confirmed findings in hand.
allowed-tools: Read, Write, Edit, Glob, Bash(git:*), Skill
---

# adaptogen-land

You are in the `adaptogen-land` state of the adaptogen DAG, always
entered from `adaptogen-critique` with at least one landable finding in
hand. This skill is self-contained.

## What must hold here, always

- **Never treat "found" as "fixed."** A finding noted only in the
  `adaptogen-critique` report with no corresponding file edit here is
  observed, not improved. Every landable finding gets an actual edit
  before this state transitions onward.
- **Edit the file the finding is actually in** -- the target's router
  `SKILL.md`, a specific sibling state-skill's `SKILL.md`, a script or
  reference file beside either, or a project file elsewhere in the
  target's host repo. A finding about one state's wording gets edited in
  that state's own skill file, not bundled into a change to the router
  or a different state.
- **Never remove a skill's capability from one run's evidence.** Confirm
  the 2+ independent runs bar (checked in `adaptogen-critique`) before
  removing or replacing anything; a first occurrence adds a case, it
  does not delete one.
- **A step proven deterministic becomes a script, not more prose.** A
  step qualifies only when it has no judgment call in it ("decide" /
  "assess" / "pick") AND a prior run (checked via the target's own `git
  log`) already recorded it producing identical output from identical
  input. Write that step as a script in the relevant skill's own
  `scripts/` directory and have that skill's text call the script
  instead of re-describing the steps in prose -- `scripts/` is the
  agentskills.io-defined home for this, not a bespoke convention.
- **Read every edit back to confirm it landed** before moving to the
  next finding or transitioning onward. An edit that was written but not
  confirmed on disk does not count as landed.

## This state also restructures target skills into DAGs -- concretely

**A target skill that is a single flat `SKILL.md` is restructured into a
DAG of sibling skills whenever this pass's evidence calls for it** --
not reflexively on every pass (see the router's Gotchas: a target
already working correctly as flat prose isn't split just for its own
sake), but whenever a landable finding is specifically that the target
has genuine states, branches, loops, or regressions that a single flat
file is failing to hold onto correctly (a step being followed
out-of-order, an invariant silently dropped on a non-linear path, a
step's context assumed from a different section that a real run showed
wasn't actually available at that point). When that finding lands, do
this, not a lighter-weight alternative (a "states" section inside one
file, states as `references/` entries an agent optionally consults):

1. Identify the genuine states in the target's current procedure --
   distinct concerns with their own invariants and their own outbound
   transitions (progression, loop, or regression) to other states. Do
   not invent states finer-grained than the target's real branches; a
   linear procedure with no branch stays one skill.
2. Rewrite the target's `SKILL.md` as a **router**: state map (an ASCII
   diagram naming every state-skill and the condition on every legal
   transition between them), an Entry section dispatching
   `Skill(skill="<target>-<first-state>")`, and the Hard Rules that bind
   across every state of the target.
3. Write each state as its own **independent, agentskills.io-compliant
   skill directory**, sibling to the router: `<target-dir>-<state>/`
   containing its own `SKILL.md` with valid frontmatter (`name` matching
   the directory exactly), a `description` written for real standalone
   discovery (not just "state N of the DAG" -- another agent should be
   able to tell what this skill does from its description alone), and a
   body that: states what must hold in that state (repeated inline, not
   cross-referenced back to the router, since skills share no context);
   states what to do; states explicit transitions naming which sibling
   skill(s) to `Skill()`-dispatch next, the firing condition for each,
   and exactly what state to carry forward into that dispatch.
4. This is the same shape as adaptogen's own DAG (this very skill family)
   -- when in doubt about the right granularity or wording for a
   target's state-skill, look at how `adaptogen-orient` /
   `adaptogen-run` / `adaptogen-critique` / this skill are themselves
   written, since they are a worked example of the convention being
   applied.
5. Verify agentskills.io compliance on every new/changed skill directory
   before moving on: `name` frontmatter matches its directory exactly,
   lowercase-hyphen-only, no leading/trailing/consecutive hyphens;
   non-empty `description`; `SKILL.md` under ~500 lines (move detail to
   that skill's own `references/`, never back into the router or a
   sibling state's file).

This is the concrete instruction referenced by the router's Hard Rule 9
and the design principle stated there: **accomplish what we're trying to
describe instead of describing what we're trying to accomplish** --
restructuring a target this way is not decoration on top of the fix, it
is often the fix, when the evidence shows a flat file's prose failed to
force the actual sequence a real run needed.

## Do this (every pass, DAG-restructuring or not)

1. For each landable finding, in any order: open the specific file it
   lives in, make the edit, read the file back, confirm the edit matches
   what the finding required.
2. If a finding is out-of-scope (belongs to a different project/repo
   than the target being improved this pass), do not edit it here --
   record it plainly in the pass's report as a finding for a separate,
   future pass on that other target. Landing an edit outside the current
   target's own repo in the same commit as the target's fix mixes two
   unrelated changes into one commit.

## Transition

- All landable findings from this pass have a confirmed edit ->
  dispatch `Skill(skill="adaptogen-commit-confirm")` now. State
  explicitly: the list of edits made (file + what changed + which
  finding it addresses), the target's resolved absolute path and repo
  root, and (if this pass restructured the target into a DAG) the full
  list of new sibling skill directories created.
- No other transition exists from this state.
