# STATE: ORIENT

You are in `ORIENT`, the entry state of adaptogen's DAG. This file is
self-contained: everything you need to act correctly here is on this
page, regardless of what brought you here (a fresh dispatch is the only
way in -- `ORIENT` has no inbound loop or regression edge).

## What must hold here, always

- The goal of this whole DAG, restated: make the target skill
  **accomplish what we're trying to describe instead of describing what
  we're trying to accomplish** -- a skill of self-contained states with
  explicit transitions actually forces the procedure to happen; a skill
  of prose alone only describes it and hopes it's followed.
- Nothing gets edited from this state. `ORIENT` only locates and
  classifies the target; the first edit cannot happen before `RUN` has
  produced a real report and `CRITIQUE` has found something landable.

## Do this

1. Identify the target: an absolute path to a skill directory (containing
   either a flat `SKILL.md` or a `SKILL.md` + `states/` directory), or a
   description of a new skill to build.
2. If a given path does not exist as given, do not guess or invent a
   fallback silently -- search for the real target (e.g. `Glob` for
   `**/SKILL.md` under the stated parent, or check whether the skill name
   differs from the directory name) and use the real path found. State
   plainly in your own working notes that the given path was wrong and
   what you found instead, so this correction is visible in any later
   report.
3. Classify:
   - **Existing skill** (a `SKILL.md` already exists at the resolved
     path, flat or DAG-shaped): this is an improve pass. Go straight to
     `RUN` with the target as-is.
   - **New skill** (no `SKILL.md` exists yet): go to `BUILD_NEW` first --
     a new skill is drafted before it can be run against anything.
4. Confirm the target's git co-location (Hard Rule 8): the target must be
   tracked in a repo you can commit to -- and a `.git` ancestor existing
   is not by itself proof of that. Three distinct cases, not two:
   - **No `.git` ancestor at all** above the target's directory -> no
     repo exists anywhere for this target; if the goal is to make it
     committable, say so plainly rather than silently proceeding as if a
     commit will be possible.
   - **A `.git` ancestor exists but is empty or unrelated to the
     target's actual content history** (e.g. `git log` on it shows zero
     commits, or its history has nothing to do with this target -- check
     both, don't stop at "a repo is present") -- this is the case named
     in Hard Rule 8's own example (an installed-only copy under
     `~/.claude/skills/` commonly has exactly this: a real `.git`
     directory with no bearing on the target's real source history).
     Treat this the same as "no repo": findings only, never a commit.
   - **A `.git` ancestor exists, has real commit history, and that
     history is actually about this target** -> committable; proceed
     normally.
   A target under an agent's installed skills directory with no
   committable repo (either of the first two cases), or on a read-only
   mount, cannot be landed into -- this pass can still produce findings
   but never a commit; note that constraint now so `COMMIT_CONFIRM` isn't
   a surprise later.

## Transition

- Existing skill, git co-location confirmed (or its absence noted) -> go
  to `states/RUN.md` now. Carry forward: the resolved absolute path to
  the target's `SKILL.md`, and whether a commit will be possible later.
- New skill -> go to `states/BUILD_NEW.md` now. Carry forward: the
  description of what the new skill should do, and the resolved
  directory it should live in.
- No other transition exists from this state.
