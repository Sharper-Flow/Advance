# Executive Summary

## Outcome

This change makes archived and closed ADV change listing safer and more predictable. Terminal aggregate reads now prefer durable terminal projections, expose structured degradation when a terminal source/candidate cannot be loaded, and keep default active listings on the existing fast path.

## Why It Matters

The change removes a timeout-prone archived-list path without raising tool timeouts or broadening recovery scope. It also reduces stale terminal-state shadow risk by making archive bundles dominate stale active/draft projections in terminal-aware reads.

## Verdict

APPROVED

## What Was Built

1. Added `advance-workflow` spec law for terminal aggregate degradation, durable terminal projection truth, and active-list fast-path preservation.
2. Added archive-first terminal projection resolution before live workflow query for terminal candidates.
3. Added optional `warnings` and `hydrationStats` metadata to terminal aggregate list responses and `adv_change_list` output.
4. Preserved default active/in-flight listing on `listSummary`/memo/cache fast path and verified shared terminal-list callers.
5. Fixed branch-blocking validation drift in `adv-visual-review` blocker summary handling and formatted `subagent-reports.test.ts` so smoke/full checks pass.

## What Was Verified

- Verdict: READY review with 0 blockers and 0 issues; 3 praise notes.
- Tests: final `bin/oc-test smoke` passed (`tr_mra8z3dr_853e9476`); full suite `bin/oc-test full` passed (`tr_mra91jl2_4312967b`). Targeted terminal-list, active-fastpath, status-hygiene, status-repair, schema, lint, and formatting checks passed.
- Preview URL: not_applicable — agreement declares `visual_surface: false`; implementation affects ADV MCP/tool read behavior and tests, not browser-visible UI.
- Contract matrix: 20/20 rows passed, respected, or not_applicable; 0 failing/unknown rows.

## Remaining Concerns

- Live deployed plugin behavior still requires normal rebuild/deploy/restart after merge before current OpenCode sessions can exercise new tool behavior.
- Large real-world archive corpus performance was not separately load-tested; deterministic regression tests cover the failure classes in scope.

## Supporting Evidence

- Task checkpoints: `612a1340`, `7670bc0c`, `6306c853`, `a5dbbb8f`, `7ffcee44`.
- Review report: `diagnoseArchivedListingTimeout2|change:review:acceptance|adv-reviewer|1` verdict READY.
- Key verification: `tr_mra82g1b_9b62a08c`, `tr_mra8twd2_be2813a2`, `tr_mra8u9eq_ce68b2c3`, `tr_mra8z3dr_853e9476`, `tr_mra91jl2_4312967b`.

## Consequence Context

1. delivered value — passed; archived/closed listing now returns complete terminal rows or explicit degraded metadata, with archive projection dominance and active fast-path preservation proven by tests.
2. enabling-only/follow-up dependency — n/a; no blocking follow-up or ops dependency recorded for acceptance.
3. ops readiness — pending for release; harden owns release/deploy/restart readiness, and current source checks passed.
4. migration/data impact — n/a; no data migration, schema migration, or external dependency added.
5. frontend/preview impact — n/a; `visual_surface: false`, no UI/browser-visible files changed.
6. collision/release risk — low; review found 0 blockers/issues; full suite passed. Runtime deployment still needs normal build/deploy/restart.
7. open follow-ups — none blocking; optional later Epic work on broader status TTL/performance remains deferred by agreement.
8. next action — if user accepts, proceed inline to harden/release-readiness review.