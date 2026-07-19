# adaptogen

An agent skill -- `adaptogen` -- that improves any skill
(itself included) by running it, adversarially critiquing the result, and
landing every evidence-backed fix immediately as a real edit, confirmed by
re-running and committed to git. No side files, no state tracking: git is the
entire durability layer.

## Install

Copy all of `skills/adaptogen*/` (the `adaptogen` router plus its six
sibling state-skills: `adaptogen-orient`, `adaptogen-run`,
`adaptogen-critique`, `adaptogen-land`, `adaptogen-commit-confirm`,
`adaptogen-build-new`) into your project's own `skills/` (or your
agent's skills directory, e.g. `.claude/skills/`) alongside whatever
skills you already have. The router dispatches the siblings by name, so
all seven must be installed together -- copying only `skills/adaptogen/`
leaves every transition dead-ending on a missing skill.

## Use

Point it at any `skills/<name>/SKILL.md`, including its own. The
`adaptogen` router walks a DAG of sibling state-skills: `adaptogen-orient`
classifies the target (existing vs new, git co-location), `adaptogen-run`
dispatches an isolated subagent to actually run it (or `adaptogen-build-new`
drafts one first), `adaptogen-critique` sends a second isolated subagent to
hunt for fault, `adaptogen-land` edits the file each confirmed fault is in,
and `adaptogen-commit-confirm` commits and re-runs to make sure the fix held
(reverting on regression). See `skills/adaptogen/SKILL.md` for the state map
and the exact procedure.

## Why no state files

Checkpointing, rollback, and a record of what changed and why are all things a
git repo already does for any tracked file -- a commit is the checkpoint,
`git revert` is the rollback, the commit message is the record. Building a
second, parallel state-tracking layer on top of that would just be a worse git.
