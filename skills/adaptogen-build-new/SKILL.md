---
name: adaptogen-build-new
description: >-
  Draft a brand-new agent skill from scratch when adaptogen's orient
  state finds no existing SKILL.md at the target. Writes a spec-compliant
  skill (or DAG of sibling skills, if the task warrants one) that is not
  yet run or committed -- adaptogen-run always follows to actually
  exercise the draft. Use when adaptogen's router sends you here after
  classifying a target as new.
allowed-tools: Read, Write, Glob, Skill
---

# adaptogen-build-new

You are in the `adaptogen-build-new` state of the adaptogen DAG, always
entered from `adaptogen-orient` when no `SKILL.md` exists yet at the
target location. This skill is self-contained.

## What must hold here, always

- A skill drafted from a guess and never run is unverified by
  construction -- `adaptogen-build-new` is never a terminal state on its
  own. It always continues to `adaptogen-run`.
- Every skill you write here -- whether a single skill or a DAG of
  several -- must be independently agentskills.io-compliant: a real
  directory containing `SKILL.md` with valid frontmatter (`name` field
  matching the directory name exactly, lowercase-hyphen-only, no
  consecutive hyphens; non-empty `description`), Markdown body, optional
  `scripts/`/`references/`/`assets/` subdirectories only for genuinely
  optional supplementary material -- never for control flow an agent
  must hop through to have working instructions.
- The drafted skill follows this same DAG-of-skills convention when (and
  only when) the task genuinely calls for multiple states: a router
  `SKILL.md` naming sibling skills and the legal transitions between
  them, each sibling itself a real, independent, self-contained skill
  directory (`<parent-name>-<state>` naming), the same shape as this DAG
  itself. Do not invent states the task doesn't need -- a task with one
  real step is one skill, not a router plus one satellite.

## Do this

1. Decide scope: does this task need more than one state? If the
   procedure has no real branch, loop, or regression -- just a straight
   sequence a single skill's body can hold under ~500 lines -- write one
   skill and stop here (skip the DAG entirely). If it has genuine states
   with different concerns and transitions between them, proceed as a
   DAG.
2. For a single skill: write `<dir>/SKILL.md` directly -- frontmatter,
   then instructions, examples, edge cases, per agentskills.io's
   recommended body sections.
3. For a DAG: write the router `<dir>/SKILL.md` (state map, Entry
   pointing at the first sibling skill, Hard Rules that bind across every
   state), then write each `<dir>-<state>/SKILL.md` as its own real,
   independently-discoverable skill: what must hold in that state, what
   to do, and explicit transitions naming which sibling skill(s) to
   `Skill()`-dispatch next and under what condition -- same shape as this
   DAG's own state-skills.
4. This draft is not run yet and not committed yet; it is the "target"
   that `adaptogen-run` will exercise for real next.

## Transition

- Skill (or DAG of skills) drafted -> dispatch `Skill(skill="adaptogen-run")`
  now, treating the new skill exactly like any other target entering the
  machine for the first time. State explicitly: the resolved absolute
  path to the new skill's (or DAG's router's) `SKILL.md`, and
  confirmation this is a build pass (so `adaptogen-run`'s dispatch task
  is built from the drafted skill's own stated purpose, since it has no
  prior usage history to draw a task from).
- No other transition exists from this state.
