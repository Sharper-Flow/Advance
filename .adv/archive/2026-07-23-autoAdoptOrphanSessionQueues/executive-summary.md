# Executive Summary

## Outcome
Stranded ADV work (left on a crashed session's private task queue) now gets re-adopted automatically by the next live OpenCode process, so it becomes reachable again without manual recovery tooling. This acceptance review approves the delivered work (with one round of remediation) and asks you to accept it for release hardening.

## Why It Matters
When an OpenCode process exits unexpectedly, any workflow it left `RUNNING` on its per-session task queue becomes unreachable — signals/queries against it fail. Auto-adoption lets the next live worker notice those orphan queues on its 10s heartbeat and register a poller, restoring reachability within bounded time. Evidence: the feature is already deployed and running always-on; this change adds an emergency kill-switch, operator diagnostics, and an end-to-end test, plus records the behavior as spec law.

## Verdict
APPROVED

## What Was Built
1. Kill-switch `ADV_ORPHAN_QUEUE_ADOPTION` (default ON; `0` disables) — an emergency escape hatch. Reconciled the design's planned default-off→flip rollout against the already-deployed always-on behavior so no live recovery was regressed.
2. Adoption diagnostics surfaced in two operator surfaces: `adv_doctor` (per-queue detail, 50-entry cap) and `adv_status view:health` (summary counts), via a shared typed diagnostic interface.
3. `lastError` capture so operators can see *why* a queue hit its retry cap (acceptance-review remediation).
4. End-to-end integration test proving the real adopter registers a real poller and a previously-stranded workflow becomes queryable.
5. Spec-law delta `rq-isolSessionTaskQueue05` (4 scenarios) recording the behavioral commitment, applied to `.adv/specs` at archive.

## What Was Verified
- Verdict: APPROVED with findings (0 blockers; issues remediated; suggestions/nits deferred to /adv-harden)
- Tests: 17/17 coordinator+kill-switch, 13 helper, 22 renderer, 1 e2e — all green; tsc/lint/format clean
- Preview URL: not_applicable — worker-internal lifecycle + text-only diagnostic surfaces; no front-end/browser/visual output (agreement `visual_surface: false`)
- Contract matrix: 26 rows, 0 failing (SC1-2, AC1-9 pass; C1-9, DONT1-6 respected)

## Remaining Concerns
- Known limitation (documented, self-healing): during a slow planned shutdown, a timed-out register may advance a queue's failure counter; bounded because the heartbeat is torn down concurrently and `worker.queues` excludes an actually-adopted queue on the next tick.
- Test-server constraint: the full Visibility-enumerate→adopt round-trip can't be integration-tested (Temporal test server doesn't implement `ListWorkflowExecutions`); enumeration logic relies on 13 unit tests, the e2e proves the real adoption action.
- Deferred to /adv-harden (suggestions/nits): `escapeVisibilityValue` tightening, `INSPECTION_LIMIT` FIFO doc, `delay().unref()`, `isShutdownError` instanceof, kill-switch `"false"/"off"` friendliness, opaque-id marker, `onBeat` rejection logging.

## Supporting Evidence
- Tasks tk-178c24e3f9a3, tk-511d8456372f, tk-e23e7b9bf45b, tk-041b86c1f738, tk-3b55e010e5aa, tk-30a75bade274 (all done)
- Review remediation commit 51de7619 (lastError + late-settlement guard + e2e readiness)
- Test runs tr_mry486g8 (17/17), tr_mry493yh (e2e), tr_mry2dyub (renderers)
- Contract review matrix (26 rows, 0 failing)

## Consequence Context
1. Delivered value: stranded session work auto-recovers reachability; operators gain diagnostics + kill-switch. (acceptance summary + task summaries)
2. Enabling-only/follow-up dependency: this unblocks the original `adoptOrphanedSessionQueues` proposal (SC1) once deployed+restarted; no mandatory cross-project dependency. (agreement objectives)
3. Ops readiness: pending — harden owns release/deploy/production/docs readiness. (review ownership boundary)
4. Migration/data impact: n/a — no schema/data migration; adoption is additive runtime behavior. (implementation evidence, C1 additive)
5. Frontend/preview impact: not_applicable — `visual_surface: false`; no UI/browser/visual output. (agreement preview applicability)
6. Collision/release risk: core adoption already on trunk (PRs #286/#287); this change adds gate+diagnostics+test+spec on top — low collision risk; harden/archive refines. (acceptance review)
7. Open follow-ups: deferred suggestions/nits routed to /adv-harden; documented self-healing limitations noted. (review findings)
8. Next action: acceptance approval proceeds inline to /adv-harden autoAdoptOrphanSessionQueues.