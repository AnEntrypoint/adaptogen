# STATE: RUN

You are in `RUN`. Entered from `ORIENT` (existing skill, first pass),
from `BUILD_NEW` (freshly drafted skill's first real exercise), from
`CRITIQUE` (looping back for a fresh baseline after an edit), or from
`COMMIT_CONFIRM` (confirming re-run, or a regression after `git revert`).
This file is self-contained regardless of which of those brought you
here.

## What must hold here, always

- **Never dispatch this run inline in your own context.** Use the Agent
  tool with a fully self-contained prompt. The dispatched agent inherits
  nothing from you -- no conversation history, no files you've already
  read, nothing. Anything it needs must be pasted into the prompt
  directly: the absolute path to the target, the concrete task, and (if
  looping back with a specific prior finding in mind) a task built to
  actually exercise that finding's code path.
- **The one exception: leaf-agent mode.** If you are yourself a subagent
  and cannot spawn a nested Agent, this collapses onto you directly --
  run the target's procedure in your own context instead of dispatching.
  Check which mode you're in before doing anything else in this state;
  it changes every remaining instruction here from "dispatch" to "do
  directly."
- **Never simulate.** Whoever executes the target's procedure -- a
  dispatched agent, or you in leaf-agent mode -- must actually run it:
  actually call the tools the target's own text says to call, and report
  exactly what happened, including literal file paths, literal command
  output, literal edits made if the target itself edits things. A report
  that reads as plausible narrative without cited tool output is not a
  real run.
- The task must carry at least one concrete anchor: a real file path it
  will read, a real command it will run, a real prior state it will
  encounter. Scan the target for any `if <condition>` / file-existence
  branch and seed the task so the run actually hits one -- a task with no
  concrete anchor produces a happy-path run that surfaces nothing for
  `CRITIQUE` to work with.

## Do this

1. Build the task: absolute path to the target's entry file (`SKILL.md`,
   which itself may route into `states/*.md` -- tell whoever runs it to
   Read and follow the target's own routing), the concrete task with its
   anchor, and an explicit instruction to report literally what
   happened, not a summary of intent.
2. Dispatch via the Agent tool (or execute directly, in leaf-agent mode).
   Wait for the full report.
3. Capture the report verbatim -- you will paste it whole into
   `CRITIQUE`, not a paraphrase of it.

## Transition

- Report captured -> go to `states/CRITIQUE.md` now. Carry forward: the
  target's resolved absolute path, the concrete task given, the
  dispatched (or self-run) report verbatim, and whether you are in
  leaf-agent mode (CRITIQUE's own text branches on this).
- The caller who invoked this pass explicitly scoped it to one bounded,
  reportable pass, and this is that bound -> report this run's own
  findings plainly and stop (`STOP`, no file). This overrides the
  default RUN-to-CRITIQUE edge only when the caller's stated bound is
  reached here, not by default.
