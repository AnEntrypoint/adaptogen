# adaptogen

A Claude Code Agent Skill -- `adaptogen` -- that improves any skill
(itself included) by running it, adversarially critiquing the result, and
landing every evidence-backed fix immediately as a real edit, confirmed by
re-running and committed to git. No side files, no state tracking: git is the
entire durability layer.

## Install

Copy `skills/adaptogen/` into your project's own `skills/` (or
`.claude/skills/`) directory alongside whatever skills you already have.
That's the whole install -- one self-contained `SKILL.md`, no dependencies.

## Use

Point it at any `skills/<name>/SKILL.md`, including its own. It dispatches an
isolated subagent to actually run the skill, a second isolated subagent to
hunt for fault in the result, edits the file the fault is actually in the
moment it's confirmed, then re-runs to make sure the fix held. See
`skills/adaptogen/SKILL.md` for the exact procedure.

## Why no state files

Checkpointing, rollback, and a record of what changed and why are all things a
git repo already does for any tracked file -- a commit is the checkpoint,
`git revert` is the rollback, the commit message is the record. Building a
second, parallel state-tracking layer on top of that would just be a worse git.
