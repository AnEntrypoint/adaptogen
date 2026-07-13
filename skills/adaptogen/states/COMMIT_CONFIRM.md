# STATE: COMMIT_CONFIRM

You are in `COMMIT_CONFIRM`, always entered from `LAND` with confirmed
edits sitting uncommitted in the target repo's working tree. This file
is self-contained.

## What must hold here, always

- **Never invent history.** The record of what changed and why is the
  git commit made here -- not a separate log kept in sync by hand. State
  what changed and the evidence for it (the finding, and how it was
  independently re-checked in `CRITIQUE`) in the commit message.
- **Stay ASCII.** Some host repos gate commits on an ASCII-only
  `SKILL.md`/state files (smart quotes, em-dashes, arrows are the usual
  violators) -- use plain `--`, `->`, and straight quotes regardless.
  Before committing, check whether this host repo actually has a
  validator or lint step for these files (look for `.github/workflows`,
  a documented lint script, or similar) and run it if one exists; if
  none exists, do not invent one to run -- the ASCII-safe habit is the
  fallback, not a license to assume a specific script is present.
- **Co-location was already confirmed in `ORIENT` (Hard Rule 8).** If
  that check found no git repo at the target, this state's commit step
  cannot run at all -- skip straight to the leaf-agent-style "no
  confirming re-run" path below instead of attempting a commit that has
  nowhere to land.

## Do this

1. `git add` exactly the changed files (never a blanket `git add
   -A`/`.` that could sweep in unrelated working-tree state).
2. Commit with a message stating what changed and the evidence for it.
3. Regress to `RUN` against the now-edited skill, to confirm the fix
   actually held -- unless the leaf-agent/bounded-pass/no-repo exception
   below applies, in which case skip the confirming re-run entirely.

## Transition

- Commit made, confirming re-run in `RUN` shows the finding that
  motivated the edit is gone and nothing new or worse appeared -> `STOP`
  (no file). The fix held; report the full pass (finding, fix, commit,
  confirmation).
- Commit made, confirming re-run in `RUN` shows the finding persists or
  something new and worse appeared -> this is the one explicit
  regression edge in the machine: `git revert` the commit just made
  (never hand-edit around a bad commit -- revert it cleanly), then go to
  `states/RUN.md` to attempt a different fix. "Confirm" only means
  something if failing to confirm actually undoes the change. Carry
  forward: the reverted commit's hash, what was tried and why it didn't
  hold, and the original finding.
- **Leaf-agent mode, or the caller scoped this pass to one bounded
  report, or editing was forbidden entirely, or `ORIENT` found no git
  repo at the target** -> the confirming re-run is waived: deliver the
  confirmed findings and their landed (or, if no repo/leaf-agent-report-
  only, proposed) fixes as the pass's product, and say plainly that no
  confirming re-run was possible. `STOP` (no file). A found-and-reported
  finding is a valid deliverable here; Hard Rule 7 ("found != fixed") is
  not violated because nothing was claimed fixed without a landed edit.
