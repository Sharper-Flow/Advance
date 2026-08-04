# Executive Summary

## Outcome

When the worktree cleanup command runs out of time, it now tells the operator the truth about what happened and offers a next step that actually works. You are approving a self-contained correctness fix to an internal maintenance tool — no user-facing product surface changes.

## Why It Matters

The tool previously gave contradictory guidance: it would tell an operator their requested time limit had been reduced, then in the very next line advise them to request a longer one — advice that could never succeed. It also blamed a specific internal fault ("poisoned workflow") that it had never actually checked for, sending operators to a repair tool for a problem that did not exist. In the incident that prompted this change, nothing was stuck at all; the operator fell back to deleting the worktree by hand.

Beyond fixing the reported complaint, the work closed a genuine rule violation found during investigation: the project's own cleanup standard requires each internal step to finish inside the overall time budget, but two internal steps were allowed to run three to four times longer than the whole operation. That was the real reason the operation ran out of time.

## Verdict

APPROVED

## What Was Built

1. **Truthful guidance when time runs out** — advice is now tailored to what actually happened, and differs correctly between the tool's two modes, so it never recommends an option that mode does not support.
2. **Honest reporting instead of guessing** — the unfounded fault diagnosis was removed. The tool now reports which phase it was in and how many deletions are still queued (technical detail: `stage` and `pendingDeleteCount`).
3. **A real recovery path** — operators can now ask the tool to skip the slow scan and just finish the already-approved queued work, instead of resorting to manual deletion (technical detail: the `skipDiscovery` option).
4. **Root cause closed** — every internal step now finishes well inside the overall budget, so one slow step can no longer consume the entire allowance.
5. **Protection against silent regression** — the guard proving the original time limits still apply to unrelated callers, which review found missing.

## What Was Verified

- Verdict: APPROVED with 11 findings (0 blockers, 4 issues, 5 suggestions, 2 nits). All 4 issues fixed during review; 2 suggestions deferred to hardening with evidence; 1 finding rejected as factually incorrect after direct verification.
- Tests: 157 passed across the six affected areas. Full project checks pass clean.
- Preview URL: not_applicable — this change has no browser-visible or visual output. It alters text returned by a command-line maintenance tool and internal timeout values.
- Contract matrix: 18 of 18 required items passed or respected. Zero failed, violated, or unknown.

## Remaining Concerns

Non-blocking:

1. **No spec delta recorded.** The change adds a new option and two new reported fields, which arguably extend the documented response contract. Deliberately not invented mid-change; flagged for a decision at hardening.
2. **Two deferred suggestions.** One asks for faster tests using simulated clocks instead of real waits; the other notes that a branch-name lookup on the same path runs at a 5-second limit rather than the tighter 2-second one. The latter still satisfies the rule (5 seconds is within the 8-second budget) and was an explicit, reviewed design decision.
3. **Four unrelated project tests are failing.** Independently confirmed pre-existing — they fail identically on the untouched mainline at this change's starting point. Logged for separate triage; not caused by this work.

## Supporting Evidence

- Tasks: tk-7b2d308848b0, tk-2a69e7c2a549, tk-b4217ae3eb05, tk-6d217e1bba98, tk-57abcd25de71
- Commits: 424061b, 9f91325, 5ce906d, d632056, af4d216
- Key verification runs: tr_mseugh3r_78e9dc70 (157 passed), tr_mseuiqsn_d36c101a (project checks clean)
- Failing-test evidence reproduced the reported defects word-for-word before the fix: tr_msesfk2w_b0e471dd, tr_mseryxua_5b81832b
- Design independently validated by a separate reviewer, which caught a flaw that would have reproduced the original defect in the tool's second mode
- Review scanners: contract traceability, correctness, tests. One scanner claim was disproved by direct execution and rejected.

## Consequence Context

| Category | Status | Evidence |
|---|---|---|
| Delivered value | delivered | Reported defect fixed and verified; contract matrix 18/18 |
| Enabling-only / follow-up dependency | none | Self-contained; no dependent work required |
| Ops readiness | pending | Hardening owns release/deploy/docs readiness. Note: this is a plugin change and will not affect the live tool until built, deployed, and the host restarted |
| Migration / data impact | n/a | No schema, storage, or persisted-state change; the new option is optional and the new fields are additive |
| Frontend / preview impact | not_applicable | No browser-visible or visual output; command-line tool text and internal timeouts only |
| Collision / release risk | low | Six files in one subsystem; no active competing changes in this repo |
| Open follow-ups | 3 non-blocking | Spec-delta decision; two deferred suggestions; separate triage for four pre-existing mainline test failures |
| Next action | acceptance approval | On approval, proceeds inline to hardening |
