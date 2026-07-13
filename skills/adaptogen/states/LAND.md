# STATE: LAND

You are in `LAND`, always entered from `CRITIQUE` with at least one
landable finding in hand. This file is self-contained.

## What must hold here, always

- **Never treat "found" as "fixed."** A finding noted only in the
  `CRITIQUE` report with no corresponding file edit here is observed,
  not improved. Every landable finding gets an actual edit before this
  state transitions onward.
- **Edit the file the finding is actually in** -- the target's router
  `SKILL.md`, a specific `states/<STATE>.md` file, a script beside
  either, or a project file elsewhere in the target's host repo. A
  finding about one state's wording gets edited in that state's own
  file, not bundled into a change to the router or a different state.
- **Never remove a skill's capability from one run's evidence.** Confirm
  the 2+ independent runs bar (checked in `CRITIQUE`) before removing or
  replacing anything; a first occurrence adds a case, it does not delete
  one.
- **A step proven deterministic becomes a script, not more prose.** A
  step qualifies only when it has no judgment call in it ("decide" /
  "assess" / "pick") AND a prior run (checked via the target's own `git
  log`) already recorded it producing identical output from identical
  input. Write that step as a script beside the relevant state file and
  have that state's text call the script instead of re-describing the
  steps in prose. A step with any judgment in it stays prose -- a
  wrongly-scripted judgment step is worse than verbose prose.
- **Read every edit back to confirm it landed** before moving to the
  next finding or transitioning onward. An edit that was written but not
  confirmed on disk does not count as landed.
- If this pass is restructuring a target from flat `SKILL.md` prose into
  a DAG of states (a `BUILD_NEW` pass, or an improve pass where a
  landable finding is specifically "this target should be states"),
  apply this same convention: a router `SKILL.md` with a state map plus
  legal transitions, one `states/<NAME>.md` per state, each restating
  its own binding invariants inline so it works correctly regardless of
  which transition entered it -- because a skill made of prose only
  describes what should happen, while a skill made of states that force
  each other in sequence actually makes it happen. That is the same
  principle this DAG itself is built on: accomplish what we're trying to
  describe instead of describing what we're trying to accomplish.

## Do this

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

- All landable findings from this pass have a confirmed edit -> go to
  `states/COMMIT_CONFIRM.md` now. Carry forward: the list of edits made
  (file + what changed + which finding it addresses), the target's
  resolved absolute path and repo root.
- No other transition exists from this state.
