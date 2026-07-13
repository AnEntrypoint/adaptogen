---
name: adaptogen-commit-confirm
description: >-
  Commit edits landed by adaptogen-land to git with an evidence-citing
  message, then regress to adaptogen-run to confirm the fix actually
  held -- reverting and retrying if it didn't. Terminal commit-and-verify
  state of the adaptogen DAG. Use when adaptogen's router sends you here
  with confirmed, file-landed edits ready to commit.
allowed-tools: Read, Bash(git:*), Skill
---

# adaptogen-commit-confirm

You are in the `adaptogen-commit-confirm` state of the adaptogen DAG,
always entered from `adaptogen-land` with confirmed edits sitting
uncommitted in the target repo's working tree. This skill is
self-contained.

## What must hold here, always

- **Never invent history.** The record of what changed and why is the
  git commit made here -- not a separate log kept in sync by hand. State
  what changed and the evidence for it (the finding, and how it was
  independently re-checked in `adaptogen-critique`) in the commit
  message.
- **Stay ASCII.** Some host repos gate commits on ASCII-only skill files
  (smart quotes, em-dashes, arrows are the usual violators) -- use plain
  `--`, `->`, and straight quotes regardless. Before committing, check
  whether this host repo actually has a validator or lint step for these
  files (look for `.github/workflows`, a documented lint script, or
  similar) and run it if one exists; if none exists, do not invent one
  to run -- the ASCII-safe habit is the fallback, not a license to
  assume a specific script is present.
- **Co-location was already confirmed in `adaptogen-orient`.** If that
  check found no committable git repo at the target, this state's commit
  step cannot run at all -- skip straight to the leaf-agent-style "no
  confirming re-run" path below instead of attempting a commit that has
  nowhere to land.
- **If this pass created new sibling skill directories** (a DAG
  restructure landed in `adaptogen-land`), stage every new directory
  explicitly -- `git add` each `<target>-<state>/` path by name, never a
  blanket `git add -A`/`.` that could sweep in unrelated working-tree
  state from elsewhere in the repo.

## Do this

1. `git add` exactly the changed and newly-created files (never a
   blanket `git add -A`/`.`).
2. Commit with a message stating what changed and the evidence for it.
   If this pass restructured a target into a DAG of skills, name every
   new sibling skill directory in the message body.
3. Regress to `adaptogen-run` against the now-edited (or now-restructured)
   skill, to confirm the fix actually held -- unless the leaf-agent /
   bounded-pass / no-repo exception below applies, in which case skip the
   confirming re-run entirely.

## Transition

- Commit made, confirming re-run in `adaptogen-run` shows the finding
  that motivated the edit is gone and nothing new or worse appeared ->
  `STOP` (no further dispatch). The fix held; report the full pass
  (finding, fix, commit, confirmation).
- Commit made, confirming re-run in `adaptogen-run` shows the finding
  persists or something new and worse appeared -> this is the one
  explicit regression edge in the machine: `git revert` the commit just
  made (never hand-edit around a bad commit -- revert it cleanly), then
  dispatch `Skill(skill="adaptogen-run")` to attempt a different fix.
  "Confirm" only means something if failing to confirm actually undoes
  the change. State explicitly in that dispatch: the reverted commit's
  hash, what was tried and why it didn't hold, and the original finding.
- **Leaf-agent mode, or the caller scoped this pass to one bounded
  report, or editing was forbidden entirely, or `adaptogen-orient` found
  no committable git repo at the target** -> the confirming re-run is
  waived: deliver the confirmed findings and their landed (or, if
  no-repo/leaf-agent-report-only, proposed) fixes as the pass's product,
  and say plainly that no confirming re-run was possible. `STOP` (no
  further dispatch). A found-and-reported finding is a valid deliverable
  here; the router's Hard Rule 7 ("found != fixed") is not violated
  because nothing was claimed fixed without a landed edit.
