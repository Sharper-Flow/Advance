# Executive Summary

## Outcome
Fixes an archive blocker: an ADV change whose Temporal workflow was genuinely missing (completed/evicted) could not be archived — the tool threw instead of retiring it. After this change, such changes archive cleanly from the durable disk projection. The approver is deciding whether to accept this fix and proceed to release hardening.

## Why It Matters
The missing-workflow state occurs whenever a workflow is lost to poison-termination, server data loss, or completion-and-eviction. Without this fix, those changes are permanently unarchivable through the normal flow — the end of the ADV 7-gate lifecycle is blocked. This restores it. The fix also auto-applies to the 26 mutation sites that route through the same classifier (gate completion, task updates, contract proof), though only the archive path is verified here per scope.

## Verdict
APPROVED

## What Was Built
1. Added `isWorkflowAbsentByExactName` — a strict recognizer of a genuinely-absent Temporal workflow by exact typed error name only (not message text), so autonomous disk recovery is authorized only on unambiguous evidence.
2. Reworked the recovery classifier's "probe-first" path (used before any signal is attempted) to catch a `describe()` failure and route a missing-workflow change to the existing disk-projection archive branch — instead of throwing "Failed to query Workflow."
3. Flipped the test that previously pinned the broken behavior (asserted archive throws) to assert archive now recovers via disk and writes the bundle; added a guard that an incomplete disk projection is still refused.
4. Added parameterized guard tests proving generic "not found" text and completed-workflow message phrases do NOT authorize recovery — only the exact typed error name does.

## What Was Verified
- Verdict: APPROVED with 0 blockers, 0 issues (1 praise).
- Tests: 67 combined (monotonic-recovery + archive-phase9) green; `pnpm run check` green (typecheck/lint/format/schemas). TDD RED→GREEN→VERIFY recorded.
- Preview URL: not_applicable — backend Temporal/disk recovery code; no visual surface (visual_surface: false).
- Contract matrix: 12/12 required rows pass/respected/not_applicable; 0 fail/violated/unknown.

## Remaining Concerns
- Non-blocking fast-follow: `adv_archive_purge`'s separate missing-workflow read path (OOS1) — different lifecycle stage, tracked separately.
- Pre-existing broader message-text authority in the signal-error path is unchanged and out of scope; this change is strictly narrower (exact-name).
- Broad benefit to the other 25 mutation callers is unverified in-scope by agreement (single-point fix propagates correctness automatically).

## Supporting Evidence
- Tasks: tk-3d92d226da62 (checkpoint 67bf4304), tk-8687db5a966c (checkpoint 8323e8fc).
- Test runs: RED tr_mrydy942 → GREEN tr_mrydyq1p → VERIFY tr_mrydz2dx + check tr_mrye1md6 (task 1); VERIFY tr_mryec6u4 + check tr_mryedgn9 (task 2); integration tr_mryef197 (67 pass).
- Independent design validation: 3 adv-researcher rounds, CONFLICTs resolved via exact-name narrowing.
- Spec-law: implements rq-directMonotonicRecovery01.1 (missing explicitly listed).

## Consequence Context
1. Delivered value: archive succeeds for missing-workflow changes (#253 closed); restores end-of-lifecycle for workflows lost to poison-termination/eviction. Evidence: AC1 + flipped archive test.
2. Enabling-only/follow-up dependency: adv_archive_purge missing-workflow path remains (OOS1 fast-follow); non-blocking.
3. Ops readiness: pending — harden owns release/deploy/production/docs/cleanup readiness.
4. Migration/data impact: n/a — disk-read/cache-drop only; no schema/data/config migration. Evidence: C3 + AC5 test (no fabrication).
5. Frontend/preview impact: not_applicable — backend recovery code (visual_surface:false).
6. Collision/release risk: low — focused, additive (one new predicate + probe-first branch swap); single-surface, 26 callers benefit, none conflict.
7. Open follow-ups: OOS1 (adv_archive_purge fast-follow); pre-existing signal-error message-text authority unchanged (out of scope).
8. Next action: acceptance approval proceeds inline to `/adv-harden fixArchiveMissingWorkflow`.