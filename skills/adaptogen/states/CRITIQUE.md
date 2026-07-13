# STATE: CRITIQUE

You are in `CRITIQUE`, always entered from `RUN` with a fresh report in
hand. This file is self-contained: everything needed to run a real
adversarial critique is on this page.

## What must hold here, always

- **Never dispatch this critique inline in your own context, and never
  reuse the `RUN` agent.** A fresh-context Agent tool dispatch only --
  it must not have seen the first run's process, only its report, so it
  has no reason to go easy on it.
- **The one exception: leaf-agent mode** (carried forward from `RUN`).
  If you are yourself a subagent and cannot spawn a nested Agent, do the
  critique as a deliberately fresh-eyed self-review instead: re-read
  every cited file/command from disk yourself -- never trust your own
  `RUN` report's paraphrase -- before accepting any finding.
- **What "evidence-backed" concretely means, and this is the gate that
  decides what reaches `LAND`:** a finding is eligible only when both
  hold: (a) it cites a specific file+line or a specific command, and (b)
  the critic independently re-opened that exact file (or re-ran that
  exact command) itself and its own reading matches the finding -- not
  the first run's paraphrase of it. A finding neither cited nor
  independently re-checked does not qualify, no matter how plausible it
  sounds.
- **Findings about the run's diligence are not the same as findings
  about the target's text.** A finding that the `RUN` execution should
  have double-checked something is a note about that one run, not
  evidence the target's file is wrong -- it is not landable in `LAND`
  unless it also identifies a specific place the target's own wording
  caused or permitted the gap.

## Do this

1. Dispatch a fresh-context Agent (or, in leaf-agent mode, do this
   yourself as a fresh-eyed self-review) with this brief, every `<...>`
   slot filled and nothing else changed:

   > Only job: find fault with this run's result and process. The target
   > under test is `<ABSOLUTE PATH TO TARGET>`; the concrete task it was
   > run against was: `<THE TASK>`. Re-check that file/those state files
   > and any command the run reports touching yourself -- do not trust
   > the first run's paraphrase or its line numbers. Report one finding
   > per category below, even if a category is empty -- do not skip a
   > category just because nothing jumps out.
   > 1. By-design flagged as broken -- correct behavior misread as a bug.
   > 2. Mis-attributed evidence -- a claim that doesn't match what your
   >    own independent re-check of the same file/command shows.
   > 3. Unverified claim -- "it worked" with nothing cited to back it.
   > 4. A real bug in the host project, not just the target's own prose
   >    -- a sibling script it called, a config file, anything the run
   >    touched.
   > [FIRST RUN'S FULL REPORT, VERBATIM]: `<PASTE HERE>`

2. When the critic's re-read and the run's claim disagree (category 2),
   re-read the file yourself as a tiebreaker -- the file on disk wins
   over both reports, always.
3. Check the "2+ independent runs" bar (Hard Rule 5) before treating any
   finding as grounds to *remove* an existing case or capability: grep
   the target's `git log`/commit messages for a prior commit citing the
   same failure. None found means this is occurrence #1 -- add a
   case/fix, do not remove anything.
4. Separate the returned findings into: landable (defect in the target's
   own file(s), evidence-backed per the definition above) vs. not
   landable (by-design, run-diligence-only, or unverifiable). A finding
   about a genuinely unrelated file or project outside the target's own
   scope is neither landed nor discarded -- record it plainly as an
   out-of-scope finding for a future pass.

## Transition

- At least one landable finding -> go to `states/LAND.md` now. Carry
  forward: every landable finding with its citation, and the target's
  resolved absolute path.
- Zero landable findings (by-design misreads and unverifiable claims
  only) -> this is the actual stopping point of the whole machine, not a
  fixed pass count -- reaching it means the fix already landed and held,
  or the target had nothing wrong to find this pass. Report the
  critique's findings and why none landed, and stop (`STOP`, no file).
