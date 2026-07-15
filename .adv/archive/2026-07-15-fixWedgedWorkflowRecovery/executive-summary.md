# Executive Summary

## Outcome
This change adds a controlled recovery path for terminally shipped ADV changes whose workflow is reachable but wedged. Release approval covers a safer operator-only repair path; it does not repair any existing incident.

## Why It Matters
The recovery path prevents stale live workflow state from overwriting corrected durable state and makes failed workflow queries diagnosable without granting mutation authority.

## Verdict
APPROVED

## What Was Built
1. Typed `query_failed` recovery diagnostics and mutation refusal.
2. Approval-gated pinned workflow termination for eligible shipped changes.
3. Acceptance/release recovery from one durable disk snapshot after workflow termination.
4. Regression coverage for recovery guards, merge enforcement, registration, ownership, and documentation surfaces.

## What Was Verified
- Verdict: APPROVED with 0 blockers and 0 issues.
- Tests: focused review suite 78/78; integration full suite 361 files / 5445 tests.
- Checks: `pnpm run check` passed.
- Preview URL: not_applicable — no frontend, browser-visible, or visual-output work.
- Contract matrix: 19 required rows passed, respected, or not applicable; no failing rows.

## Remaining Concerns
None. Focused tests mock Temporal handles; full-suite verification remains supporting integration evidence.

## Supporting Evidence
- Task checkpoints: `tk-9a830ac3c12a`, `tk-c27ca0a33a1e`, `tk-e12e4c2d146a`, `tk-fab9911c3969`.
- Review report: `fixWedgedWorkflowRecovery|tk-fab9911c3969|adv-reviewer|1`.
- Contract matrix: 19 rows, zero failures.

## Consequence Context
1. **Delivered value — ready:** audited termination-first recovery prevents stale workflow projection overwrite.
2. **Enabling-only/follow-up dependency — n/a:** no required follow-up links or dependencies.
3. **Ops readiness — pending:** harden owns release/deploy/production/docs/cleanup readiness.
4. **Migration/data impact — n/a:** no migration or user data change; tool-layer recovery metadata only.
5. **Frontend/preview impact — n/a:** no visual surface; preview proof not applicable.
6. **Collision/release risk — ready:** release recovery retains merge/reachability enforcement; review found no open issues.
7. **Open follow-ups — n/a:** no required follow-ups reported.
8. **Next action — pending approval:** acceptance confirmation proceeds to hardening.