# Archive Briefing Digest

**Change ID:** optimizeCiWaiter
**Title:** Optimize CI waiter
**Status:** archived
**Generated:** 2026-07-25T19:25:52.008Z

## Identity Anchors

- CHANGE
- STATUS
- TERMINAL_GATE_SUMMARY
- Origin: adhoc

## Archive Digest

**Status:** archived

| Gate | Status |
| --- | --- |
| proposal | done |
| discovery | done |
| design | done |
| planning | done |
| execution | done |
| acceptance | done |
| release | done |

## Epic Context

No Epic membership

## Durable Facts

Showing 7 of 7 durable facts.

- **[report_follow_up]** follow_ups: Capability gap: oc-ci-wait has no PR-merge detection; adv-archive Phase 9.5 MERGED branch relies on parent pr_merged reachability proof, not a waiter MERGED signal. Consider a separate change to add PR merge-state to oc-ci-wait if a first-class MERGED terminal is desired.
- **[report_follow_up]** follow_ups: Instruction anchors TASK_SCOPE/IN_SCOPE/OUT_OF_SCOPE/DONE_WHEN/STOP_WHEN/VERIFICATION were not provided in the packet; proceeded with prompt scope.
- **[research_citation]** sources: oc-ci-wait source (Go) — poll loop + defaults: start spawns a detached __watch subprocess that owns the ENTIRE poll loop. Defaults: --interval 15s, --discovery-timeout 2m, --timeout 30m. Discovering polls capped at 30s. result is a non-blocking JSON state read. (/home/jon/toolbox/dev/ci-wait/main.go:145-282)
- **[research_citation]** sources: oc-ci-wait status/terminal constants + exit codes: Statuses: discovering, watching, completed, timeout, cancelled, error. Terminal = completed|timeout|cancelled|error. Exit: 0 success, 1 failure, 2 usage, 8 still-running, 124 timeout, 130 cancelled. No 'merged' status exists. (/home/jon/toolbox/dev/ci-wait/main.go:24-38,845-860,969)
- **[research_citation]** sources: oc-ci-wait conclusion mapping (checks only, no PR merge): PR/SHA target conclusion is derived ONLY from check-runs + combined-status: success if 0 failing, failure if any failing. There is NO pull-request merge-state fetch anywhere; the tool cannot report MERGED. (/home/jon/toolbox/dev/ci-wait/main.go:586-614,628-670)
- **[research_citation]** sources.omitted: 8 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: oc-ci-wait already implements a correct, by-the-book background poller: start() detaches a __watch subprocess that owns the real poll loop (15s interval, 2m discovery timeout, 30m overall, rate-limit-aware backoff honoring Retry-After then X-RateLimit-Reset). result is a cheap non-blocking JSON state read. Therefore the agent's own 'sleep 15' loop is an OUTER SAMPLING loop over already-computed state, not a second API poller. It is architecturally sound (P37-compliant: bounded, dedicated waiter) but the sample cadence can be relaxed because the background process — not the agent — does the GitHub API work. Two real gaps: (1) TERMINAL-STATE MISMATCH: adv-archive Phase 9.5 and the workflow spec expect the waiter to report MERGED, but oc-ci-wait has no PR-merge detection — it only maps check-run/combined-status conclusions to success|failure. 'CI green' != 'PR merged' (auto-merge/merge-queue land the merge after checks pass). The waiter can prove green CI but cannot prove MERGED; the archive re-call currently relies on the parent's pr_merged reachability proof rather than a waiter MERGED signal. (2) The agent def's terminal set (completed|timeout|cancelled|error) is correct and complete for oc-ci-wait, but the human-facing 'Next action: merge' wording implies a merge decision the tool does not observe. Instruction optimization should: relax outer sample interval, keep rate-limit backoff deferred to the tool, tighten terminal/blocked classification, and explicitly state the green-CI-vs-merged distinction so archive orchestration does not treat 'success' as 'MERGED'.

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| AC1 | acceptance_criterion | pass |
| AC2 | acceptance_criterion | pass |
| AC3 | acceptance_criterion | pass |
| AC4 | acceptance_criterion | pass |
| AC5 | acceptance_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| C4 | constraint | respected |

## Unresolved Actions

None
