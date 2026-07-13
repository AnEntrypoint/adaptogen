---
name: adaptogen-orient
description: >-
  First state of the adaptogen DAG: locate and classify a target agent
  skill (existing vs. new) and confirm its git co-location, before any
  run or edit happens. Use when adaptogen's router sends you here, or
  whenever you need to determine whether a skill target is improvable
  in-place or needs to be drafted from scratch first.
allowed-tools: Read, Glob, Bash(git:*), Skill
---

# adaptogen-orient

You are in the `adaptogen-orient` state of the adaptogen DAG. This skill
is self-contained: everything you need to act correctly here is on this
page, regardless of what brought you here (a fresh dispatch of this
skill is the only way in -- `adaptogen-orient` has no inbound loop or
regression edge from any sibling skill).

## What must hold here, always

- The goal of this whole DAG, restated: make the target skill
  **accomplish what we're trying to describe instead of describing what
  we're trying to accomplish** -- a DAG of self-contained skills with
  explicit transitions actually forces the procedure to happen; a skill
  of prose alone only describes it and hopes it's followed.
- Nothing gets edited from this state. `adaptogen-orient` only locates
  and classifies the target; the first edit cannot happen before
  `adaptogen-run` has produced a real report and `adaptogen-critique`
  has found something landable.

## Do this

1. Identify the target: an absolute path to a skill directory (containing
   a `SKILL.md`, alone or with sibling state-skills of its own), or a
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
     path): this is an improve pass. Go straight to `adaptogen-run` with
     the target as-is.
   - **New skill** (no `SKILL.md` exists yet): go to `adaptogen-build-new`
     first -- a new skill is drafted before it can be run against
     anything.
4. Confirm the target's git co-location: the target must be tracked in a
   repo you can commit to -- and a `.git` ancestor existing is not by
   itself proof of that. Three distinct cases, not two:
   - **No `.git` ancestor at all** above the target's directory -> no
     repo exists anywhere for this target; if the goal is to make it
     committable, say so plainly rather than silently proceeding as if a
     commit will be possible.
   - **A `.git` ancestor exists but is empty or unrelated to the
     target's actual content history** (e.g. `git log` on it shows zero
     commits, or its history has nothing to do with this target -- check
     both, don't stop at "a repo is present"). An installed-only copy
     under an agent's local skills directory commonly has exactly this:
     a real `.git` directory with no bearing on the target's real source
     history. Treat this the same as "no repo": findings only, never a
     commit.
   - **A `.git` ancestor exists, has real commit history, and that
     history is actually about this target** -> committable; proceed
     normally.
   A target with no committable repo (either of the first two cases), or
   on a read-only mount, cannot be landed into -- this pass can still
   produce findings but never a commit; note that constraint now so
   `adaptogen-commit-confirm` isn't a surprise later.

## Transition

- Existing skill, git co-location confirmed (or its absence noted) ->
  dispatch `Skill(skill="adaptogen-run")` now. State explicitly in that
  dispatch: the resolved absolute path to the target's `SKILL.md`, and
  whether a commit will be possible later. `adaptogen-run` needs both
  facts named directly -- it does not infer them from you having been
  through `adaptogen-orient`, since skills share no context
  automatically.
- New skill -> dispatch `Skill(skill="adaptogen-build-new")` now. State
  explicitly: the description of what the new skill should do, and the
  resolved directory it should live in.
- No other transition exists from this state.
