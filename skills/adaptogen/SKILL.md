---
name: adaptogen
description: >-
  Improve any agent skill -- itself included -- by running it as an
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

This procedure is written as a small state machine, not a flat numbered
list. Each state below names what it does, repeats -- inline, in its own
box -- every invariant that binds while you're in it, and lists its
outbound transitions with the exact condition that fires each one. Read
that as a deliberate redundancy, not clutter: a flat list only reads
correctly for the one path someone happened to trace top-to-bottom: a
route that enters LAND straight from BUILD_NEW, or regresses from
COMMIT_CONFIRM back to RUN, needs the same invariants holding as the
straight-through path, and the only way to guarantee that without
re-deriving it from prose scattered elsewhere is to say it again, on the
spot, in the state you're actually in. The point is to accomplish what
we're trying to describe instead of describing what we're trying to
accomplish: a reader tracing an edge should be able to act correctly from
that edge's two endpoints alone, never by reconstructing intent from a
rule stated once at the top and assumed to still apply five states later.

## States

```
                 +-------------------+
                 |      RUN           |<---------------------+
                 +-------------------+                        |
                          |                                    |
                          v                                    |
                 +-------------------+                         |
                 |    CRITIQUE        |                         |
                 +-------------------+                         |
                    |            |                              |
       finding      |            | nothing found                |
       confirmed    |            v                              |
                     |     +-----------+                        |
                     |     |   STOP    |                        |
                     |     +-----------+                        |
                     v                                          |
              +-------------+                                   |
              |    LAND     |                                   |
              +-------------+                                   |
                     |                                          |
                     v                                          |
           +-------------------+     regressed      |
           |   COMMIT_CONFIRM   |---------------------+
           +-------------------+
                     |
                     | confirmed, nothing new/worse
                     v
                 +-----------+
                 |   STOP    |
                 +-----------+

  BUILD_NEW ---(skill drafted)---> RUN
  (any state) ---(caller scoped one bounded pass)---> report-and-STOP
```

### State: RUN -- run and critique, isolated subagent, every time

**Does:** Dispatch via the **Agent tool**, self-contained prompt: absolute
path to the target's SKILL.md, a real concrete task it should plausibly
handle (built from its own `description` if none is given), and an
explicit instruction to actually run the procedure and report exactly
what happened -- no simulation. The task must carry at least one concrete
anchor (a real file path the skill will read, a real command it will run,
a real prior state) that forces the run down a real branch. Scan the
target's SKILL.md for any `if <condition>` / file-existence branch and
seed the task so the run actually hits one -- a task with no concrete
anchor produces a happy-path run that surfaces nothing.

**Invariants that hold in this state, repeated here because they bind
every time RUN is entered, whether that's the first pass or a regression
from COMMIT_CONFIRM:**
- Never edit a skill without running it first, this pass. An edit made
  from reading prose alone, unconfirmed by a real dispatch, is a guess.
- Never dispatch a run inline in your own context. Subagents inherit
  nothing -- use the Agent tool with a fully self-contained prompt. The
  one exception: if you are yourself a subagent and cannot spawn a nested
  Agent, the leaf-agent Gotcha below scopes an in-context run instead --
  check which mode you are in before entering RUN, since it decides
  whether RUN and CRITIQUE dispatch out or collapse onto you.

**Transitions out of RUN:**
- RUN --(dispatch completes, report in hand)--> CRITIQUE. Always. RUN
  never resolves anything itself; it only produces the report CRITIQUE
  needs.
- RUN --(caller scoped this to one bounded, reportable pass)--> report
  the run's own findings and STOP. This overrides the default
  RUN-to-CRITIQUE edge: an explicit caller-stated bound wins over looping
  further, so state that plainly instead of silently continuing.

### State: CRITIQUE -- adversarial, fresh-context, every time

**Does:** Dispatch a **second, fresh-context Agent**, first run's full
report embedded verbatim in its prompt (not a file pointer -- inheritance
is zero, so anything the critic checks against must be pasted in). Paste
this brief, replacing every `<...>` slot and nothing else -- a fresh
critic inherits no context, so an unfilled slot leaves it unable to
re-check anything:

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

**Invariants that hold in this state:**
- Never grade a run confirmatory, and never defer a real finding. The
  critic Agent actively hunts for fault; it does not rubber-stamp.
- What "evidence-backed" / "re-checked" concretely means, and this is the
  gate CRITIQUE applies before anything is allowed through to LAND: a
  finding is eligible only when both hold -- (a) it cites a specific
  file+line or a specific command, and (b) the critic Agent independently
  re-opened that exact file (or re-ran that exact command) and its own
  reading matches the finding, not the first run's paraphrase. When the
  critic's re-read and the run's claim disagree (category 2 above),
  re-read the file yourself; the file wins over both reports. A finding
  neither the critic nor a direct re-read can reproduce does not proceed
  to LAND this pass.
- If you are in the leaf-agent path (see Gotchas), CRITIQUE is a
  deliberately fresh-eyed self-review that RE-READS every cited
  file/command from disk -- never from your own RUN's paraphrase --
  before accepting any finding.

**Transitions out of CRITIQUE:**
- CRITIQUE --(one or more findings confirmed per the gate above)--> LAND.
- CRITIQUE --(full run finds nothing further, no findings survive the
  gate)--> STOP. This is the actual stopping point of the whole machine,
  not a fixed pass count -- reaching it means the fix already landed and
  held, or the target had nothing wrong to find this pass.

### State: LAND -- every evidence-backed finding, same pass

**Does:** The moment a finding is confirmed (per CRITIQUE's gate, not
merely asserted): Edit the file it's actually in -- the target's
SKILL.md, a script beside it, or a project file -- and Read it back to
confirm the write landed. Do this for every confirmed finding before
moving on; nothing waits for a "next iteration."

**Invariants that hold in this state:**
- Never treat "found" as "fixed." A finding noted only in a critique
  response with no corresponding file edit is observed, not improved --
  edit the file, read it back to confirm, then and only then consider it
  landed.
- Never remove a skill's capability from one run's evidence. One run adds
  a step/case a skill didn't handle; a failure recurring across 2+
  independent runs justifies removing or replacing something. To check
  the "2+ independent runs" bar at decision time, grep the target's
  `git log`/commit messages (the durability layer) for a prior commit
  citing the same failure; none found = this is run #1, add a case, do
  not remove. Record the failure in this pass's commit message so the
  next run can find it.
- Never leave a deterministic step as re-derived prose. If a run shows a
  step always produces the same output from the same input, write it as
  a script beside the skill's SKILL.md and have that step call it
  instead. "Always deterministic" is a high bar on purpose: a step
  qualifies only when it contains no judgment (no "decide"/"assess"/
  "pick") AND a prior run already recorded it producing identical output
  from identical input (grep `git log` as above). A step seen working
  once, or with any judgment branch, stays prose -- a wrongly-scripted
  judgment step is worse than verbose prose.

**Transitions out of LAND:**
- LAND --(every confirmed finding for this pass has a file edit and a
  confirmed re-read)--> COMMIT_CONFIRM. Always -- LAND never stops the
  machine itself; committing is a separate state because the commit is
  the durability boundary, not the edit.

### State: COMMIT_CONFIRM -- commit, then run once more to confirm

**Does:** `git add` the changed files and commit with a message stating
what changed and the evidence for it -- this commit is the only record
that needs to exist. Then regress to RUN against the now-edited skill.

**Invariants that hold in this state:**
- Never invent history. The record of what changed and why is the git
  commit for that change, written when it's made -- not a separate log
  kept in sync by hand.
- Stay ASCII. Some host repos gate commits on an ASCII-only SKILL.md
  (smart quotes, em-dashes, and arrows are the usual violators) -- use
  plain `--`, `->`, and straight quotes regardless, since it costs
  nothing here and avoids depending on whether such a gate exists. Before
  committing, check whether this host repo actually has a validator or
  lint step for SKILL.md (look for `.github/workflows`, a documented lint
  script, or similar) and run it if one exists; if none exists, do not
  invent one to run -- the ASCII-safe habit above is the fallback, not a
  license to assume a specific script is present. (A prior version of
  this Gotcha named a specific example path that was never actually
  present in this repo's own history -- don't repeat that mistake by
  hard-coding a path for a mechanism you haven't confirmed exists.)

**Transitions out of COMMIT_CONFIRM:**
- COMMIT_CONFIRM --(regress to RUN, re-run against the edited skill;
  finding that motivated the edit is gone, nothing new and worse
  appeared)--> STOP. The fix held.
- COMMIT_CONFIRM --(regress to RUN, re-run against the edited skill;
  finding persists or something new and worse appeared)--> RUN, but this
  time as a regression: `git revert` the commit first, then try a
  different fix from RUN. This is the one explicit regression edge in the
  machine -- it exists because "confirm" only means something if failing
  to confirm actually undoes the change.
- COMMIT_CONFIRM --(caller scoped this to one bounded, reportable pass, or
  editing was forbidden entirely)--> STOP without the confirming re-run;
  deliver the confirmed findings and their landed (or, in the leaf-agent
  path, proposed) fixes as the pass's product, and say plainly that no
  confirming re-run was possible.

### State: BUILD_NEW -- building a new skill

**Does:** A skill is one file: `skills/<name>/SKILL.md` with
`name`/`description` frontmatter and numbered steps or states. Write it
directly for the real task at hand.

**Invariants that hold in this state:**
- A skill drafted from a guess and never run is unverified by
  construction -- BUILD_NEW is never a terminal state on its own.

**Transitions out of BUILD_NEW:**
- BUILD_NEW --(skill drafted)--> RUN, unconditionally, treating the new
  skill exactly like any other target entering the machine for the first
  time.

### State: STOP -- terminal

**Does:** Nothing further this pass. STOP is reached from three different
edges (CRITIQUE with nothing left to find, COMMIT_CONFIRM confirmed
clean, or any state when the caller's stated bound is hit) and the
correct report differs by which edge reached it -- say which one, since
"stopped" alone doesn't tell the caller whether the target is now clean
or whether a bound simply cut the loop short.

## Building a new skill

See state BUILD_NEW above, which re-enters RUN once the skill is drafted
-- there is no separate procedure outside the machine for this.

## Gotchas

- A skill written earlier in the same turn is not `Skill`-dispatchable
  mid-turn -- the skill list loads at session start. Use the Agent tool
  to follow its SKILL.md directly; this is the normal path here, not a
  fallback.
- **Leaf-agent / report-only path.** If you are yourself a subagent and
  cannot spawn a nested Agent, the "isolated subagent" of RUN and
  CRITIQUE collapses onto you: run the target's procedure directly
  against the concrete task in your own context, then do the critique as
  a deliberately fresh-eyed self-review that RE-READS every cited
  file/command from disk (never from your own run's paraphrase) before
  accepting any finding. This is the degraded-but-valid path, not license
  to skip the run and edit from prose (the RUN state's invariants still
  bind). In this mode -- or whenever the caller scoped one bounded pass,
  or editing is forbidden -- COMMIT_CONFIRM's "run once more to confirm"
  is waived: deliver the confirmed findings and their proposed fixes as
  the pass's product and say plainly that no confirming re-run was
  possible. A found-and-reported finding is the valid deliverable here;
  "found != fixed" is not violated because nothing was claimed fixed.
- **Target and its git history must be co-located.** The durability model
  assumes the target SKILL.md lives in the same git repo whose `git log`
  is the lessons file. Before entering RUN, confirm the target is tracked
  in a repo you can commit to; a target under an agent's installed skills
  directory (e.g. `~/.claude/skills/`) or another machine-resident
  location has no git history to check or land into -- edit it in its own
  source repo, not the installed copy.
- Only adaptogen (via the state machine above) edits a target's
  SKILL.md. A target run standalone, outside this loop, just executes its
  current instructions -- there's no marker to check, because there's
  nothing conditional to write.
