# AGENTS.md

This repo hosts agent skills, currently `skills/adaptogen/` -- a
git-only self-improving skill improver (run it, adversarially critique
the result, land evidence-backed fixes as direct edits, commit).
`README.md` covers install/use; `skills/adaptogen/SKILL.md` is the
procedure itself, written as a state machine
(RUN/CRITIQUE/LAND/COMMIT_CONFIRM/BUILD_NEW/STOP).

## Working in this repo

- No build step, no package.json, no test suite: a skill's own
  SKILL.md (and any scripts beside it) is the whole deliverable.
- Git is the durability layer for every skill here -- no side state
  files, no separate changelog. `git log <path>` is the history,
  `git diff`/`git revert` is the checkpoint/rollback, and the commit
  message is the record of what changed and why.
- Commit only as `lanmower` (see `.gm/disciplines` / project git
  identity conventions already in effect for this repo) -- never
  attribute an AI tool as author or co-author.
- `.gm/` is this project's own gm-plugkit tooling working directory
  (spool, PRD store, disciplines, memory). `.wfgy/` is wfgy-method's
  session-lessons directory. Both are internal working state, not
  shipped project content -- see `.gitignore` for exactly what's
  excluded from each.

## Adding or editing a skill

Follow the target skill's own entry file (`SKILL.md`, which may route
into a `states/*.md` DAG for skills built that way -- `skills/adaptogen`
is one example). Never hand-edit a skill's behavior without running it
first and confirming the change with a real dispatch; see
`skills/adaptogen/SKILL.md` for the full discipline this repo expects
skill authors to follow.
