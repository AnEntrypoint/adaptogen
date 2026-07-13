# STATE: BUILD_NEW

You are in `BUILD_NEW`, always entered from `ORIENT` when no `SKILL.md`
exists yet at the target location. This file is self-contained.

## What must hold here, always

- A skill drafted from a guess and never run is unverified by
  construction -- `BUILD_NEW` is never a terminal state on its own. It
  always continues to `RUN`.
- The drafted skill follows this same DAG-of-states convention:
  self-contained state files under `states/`, plus a router `SKILL.md`
  with a state map and legal transitions -- unless the task is small
  enough that a single state (one `states/RUN.md` plus a router that
  just enters it and stops) is the whole procedure. Do not invent states
  the task doesn't need; a one- or two-step skill stays small.

## Do this

1. Write the router `SKILL.md`: `name`/`description` frontmatter, a
   state map (even a one-node map for a tiny skill), an Entry pointing
   at the first state file, and the Hard Rules that bind across every
   state of the new skill.
2. Write each `states/<NAME>.md`: what must hold in that state, what to
   do, and explicit transitions with their firing conditions -- same
   shape as this DAG's own state files.
3. This draft is not run yet and not committed yet; it is the "target"
   that `RUN` will exercise for real next.

## Transition

- Skill drafted (router + state file(s) written) -> go to `states/RUN.md`
  now, treating the new skill exactly like any other target entering the
  machine for the first time. Carry forward: the resolved absolute path
  to the new skill's `SKILL.md`, and confirmation this is a build pass
  (so `RUN`'s dispatch prompt is built from the drafted skill's own
  stated purpose, since it has no prior usage history to draw a task
  from).
- No other transition exists from this state.
