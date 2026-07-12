---
name: adaptogen
description: >-
  Improve any Claude Code skill -- itself included -- by running it as an
  isolated subagent, adversarially critiquing the result, and landing every
  evidence-backed fix immediately as a direct edit to that skill's own
  SKILL.md/scripts (or, if the finding is in the host project rather than
  the skill, a direct edit there). Git is the entire durability layer: no
  side files, no state tracking -- a commit IS the checkpoint, the commit
  message IS the record. Use whenever asked to improve, harden, or debug a
  skill, or to build a new one from a real run instead of a guess.
allowed-tools: Read, Write, Edit, Glob, Agent, Bash(git:*)
---

# adaptogen

A skill's own numbered steps ARE its procedure -- there is no separate
state file to keep in sync. Improving a skill means editing that skill's
SKILL.md/scripts directly, confirmed by a real run, committed to git. Git
history is the whole memory: `git log <path>` is the lessons file,
`git diff`/`git revert` is the checkpoint/rollback.

## Hard Rules

1. **Never edit a skill without running it first, this pass.** An edit made
   from reading prose alone, unconfirmed by a real dispatch, is a guess.
2. **Never dispatch a run inline in your own context.** Subagents inherit
   nothing -- use the Agent tool with a fully self-contained prompt (see
   Run and critique). The one exception: if you are yourself a subagent and
   cannot spawn a nested Agent, the leaf-agent Gotcha below scopes an
   in-context run -- check which mode you are in before step 1, since it
   decides whether the run and critique dispatch out or collapse onto you.
3. **Never grade a run confirmatory, and never defer a real finding.** A
   second, fresh-context Agent actively hunts for fault. The moment a
   finding is evidence-backed (cited, re-checked, not asserted), edit the
   file it's in -- immediately, same pass, whether that's the target
   skill's own SKILL.md or a sibling file in its host project.
4. **Never invent history.** The record of what changed and why is the git
   commit for that change, written when it's made -- not a separate log
   kept in sync by hand.
5. **Never remove a skill's capability from one run's evidence.** One run
   adds a step/case a skill didn't handle; a failure recurring across 2+
   independent runs justifies removing or replacing something. To check
   the "2+ independent runs" bar at decision time, grep the target's
   `git log`/commit messages (the durability layer) for a prior commit
   citing the same failure; none found = this is run #1, add a case, do
   not remove. Record the failure in this pass's commit message so the
   next run can find it.
6. **Never leave a deterministic step as re-derived prose.** If a run shows
   a step always produces the same output from the same input, write it as
   a script beside the skill's SKILL.md and have that step call it. "Always
   deterministic" is a high bar on purpose: a step qualifies only when it
   contains no judgment (no "decide"/"assess"/"pick") AND a prior run
   already recorded it producing identical output from identical input
   (grep `git log` as in Rule 5). A step seen working once, or with any
   judgment branch, stays prose -- a wrongly-scripted judgment step is
   worse than verbose prose.
7. **Never treat "found" as "fixed."** A finding noted only in a critique
   response with no corresponding file edit is observed, not improved --
   edit the file, read it back to confirm, commit.

## Improving an existing skill (including yourself)

Point this at any `skills/<name>/SKILL.md`. Read it. Its numbered steps
(or lack of them) are the current procedure -- there is nothing else to
load.

### 1. Run and critique -- isolated subagent, every time

1. Dispatch via the **Agent tool**, self-contained prompt: absolute path
   to the target's SKILL.md, a real concrete task it should plausibly
   handle (built from its own `description` if none is given), and an
   explicit instruction to actually run the procedure and report exactly
   what happened -- no simulation. The task must carry at least one
   concrete anchor (a real file path the skill will read, a real command
   it will run, a real prior state) that forces the run down a real
   branch. Scan the target's SKILL.md for any `if <condition>` /
   file-existence branch and seed the task so the run actually hits one --
   a task with no concrete anchor produces a happy-path run that surfaces
   nothing.
2. Dispatch a **second, fresh-context Agent**, first run's full report
   embedded verbatim in its prompt (not a file pointer -- inheritance is
   zero per Hard Rule 2, so anything the critic checks against must be
   pasted in). Paste this brief, replacing every `<...>` slot and nothing
   else -- a fresh critic inherits no context, so an unfilled slot leaves
   it unable to re-check anything:

   > Only job: find fault with this run's result and process. The target
   > under test is `<ABSOLUTE PATH TO TARGET SKILL.md>`; the concrete task
   > it was run against was: `<THE TASK>`. Re-check that file and any
   > command the run reports touching (for example `<KEY COMMAND(S) THE
   > RUN RAN>`) yourself -- do not trust the first run's paraphrase or its
   > line numbers. Report one finding per category below, even if a
   > category is empty -- do not skip a category just because nothing
   > jumps out.
   > 1. By-design flagged as broken -- correct behavior misread as a bug.
   > 2. Mis-attributed evidence -- a claim that doesn't match what your
   >    own independent re-check of the same file/command shows.
   > 3. Unverified claim -- "it worked" with nothing cited to back it.
   > 4. A real bug in the host project, not just the skill's own prose --
   >    a sibling script it called, a config file, anything the run touched.
   > [FIRST RUN'S FULL REPORT, VERBATIM]: `<PASTE HERE>`

**What "evidence-backed" / "re-checked" concretely means.** A finding is
eligible to land only when both hold: (a) it cites a specific file+line or
a specific command, and (b) the critic Agent independently re-opened that
exact file (or re-ran that exact command) and its own reading matches the
finding -- not the first run's paraphrase. When the critic's re-read and
the run's claim disagree (category 2), re-read the file yourself; the file
wins over both reports. A finding neither the critic nor a direct re-read
can reproduce does not land this pass.

### 2. Land every evidence-backed finding, same pass

The moment a finding is confirmed (re-checked, not asserted): Edit the
file it's actually in -- the target's SKILL.md, a script beside it, or a
project file -- and Read it back to confirm the write landed. Do this for
every confirmed finding before moving on; nothing waits for a "next
iteration."

A step proven deterministic (same input, same output, across the runs
so far) becomes a script next to the skill's SKILL.md, invoked from that
step instead of re-described in prose (Hard Rule 6).

### 3. Commit, then run once more to confirm

`git add` the changed files and commit with a message stating what
changed and the evidence for it -- this commit is the only record that
needs to exist. Then repeat step 1 against the now-edited skill. If the
finding that motivated the edit is gone and nothing new and worse
appeared, stop -- the fix held. If it regressed, `git revert` the commit
and try a different fix.

Repeat 1-3 until a full run finds nothing further to land -- that's the
stopping point, not a fixed number of passes. If whoever invoked this
skill scoped it to one bounded, reportable pass, that explicit scope
wins over this default -- report the single pass's result and stop; do
not silently loop past a caller-stated bound.

## Building a new skill

A skill is one file: `skills/<name>/SKILL.md` with `name`/`description`
frontmatter and numbered steps. Write it directly for the real task at
hand, then run it through steps 1-3 above like any other target -- a
skill drafted from a guess and never run is unverified by construction.

## Gotchas

- A skill written earlier in the same turn is not `Skill`-dispatchable
  mid-turn -- the skill list loads at session start. Use the Agent tool
  to follow its SKILL.md directly; this is the normal path here, not a
  fallback.
- **Leaf-agent / report-only path.** If you are yourself a subagent and
  cannot spawn a nested Agent, the "isolated subagent" of steps 1.1-1.2
  collapses onto you: run the target's procedure directly against the
  concrete task in your own context, then do the critique as a
  deliberately fresh-eyed self-review that RE-READS every cited
  file/command from disk (never from your own run's paraphrase) before
  accepting any finding. This is the degraded-but-valid path, not license
  to skip the run and edit from prose (Hard Rule 1 still binds). In this
  mode -- or whenever the caller scoped one bounded pass, or editing is
  forbidden -- step 3's "run once more to confirm" is waived: deliver the
  confirmed findings and their proposed fixes as the pass's product and
  say plainly that no confirming re-run was possible. A found-and-reported
  finding is the valid deliverable here; Hard Rule 7's "found != fixed" is
  not violated because nothing was claimed fixed.
- **Target and its git history must be co-located.** The durability model
  assumes the target SKILL.md lives in the same git repo whose `git log`
  is the lessons file (Rules 4-6). Before running, confirm the target is
  tracked in a repo you can commit to; a target under `~/.claude/skills/`
  or another machine-resident location has no git history to check or land
  into -- edit it in its own source repo, not the installed copy.
- **Stay ASCII; validate before you commit.** A CI validator may reject
  any non-ASCII byte in a SKILL.md (smart quotes, em-dashes, arrows). Use
  plain `--`, `->`, and straight quotes, and run the repo's SKILL.md
  validator (for example `node .github/scripts/validate.mjs`) before every
  commit -- a commit that reddens CI breaks the very durability layer this
  skill runs on.
- Only adaptogen (via steps 1-3) edits a target's SKILL.md. A target
  run standalone, outside this loop, just executes its current
  instructions -- there's no marker to check, because there's nothing
  conditional to write.
