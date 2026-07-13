# Executive Summary

## Outcome

ADV now provides every agent turn with a typed workflow directive — phase, permitted next action, approval/recovery state, blockers, and evidence — derived deterministically from durable Temporal state. Agents no longer infer lifecycle position from chat history.

## Why It Matters

Agents can resume work after failures, timeouts, or recovery without reconstructing workflow position. User-facing handoffs and agent orientation render from the same authoritative source, preventing phase drift.

## Verdict

APPROVED

## What Was Built

1. Pure `WorkflowDirective` projection (`workflow-directive.ts`) — derive-on-read from `ChangeWorkflowState`, mirroring existing `deriveBucket` pattern.
2. Workflow query (`getDirectiveQuery`) exposing directive to all consumers.
3. Gate status, status enrichment, context snapshots, briefing packets, compaction, recovery handoff, and change show/create — all derive next action from the single directive projection.
4. Dual next-action derivation consolidated; `getRecommendationForGate` removed.
5. 18 table-driven tests covering all gates, approval, recovery reasons, blockers, canArchive, referential transparency, and unknown/legacy safety.

## What Was Verified

- Verdict: APPROVED with 0 blockers, 0 issues after remediation.
- Tests: 4868/4868 full suite pass; 18 directive tests; 90+ consumer tests; 8 compaction tests.
- Preview URL: not_applicable — no browser-visible surface.
- Contract matrix: 18/18 rows passed or respected.

## Remaining Concerns

None blocking. Schema validation is TypeScript-shape-bounded at the workflow boundary (no runtime Zod in the workflow sandbox); acceptable per AC1 interpretation.

## Supporting Evidence

- Tasks tk-83fcef53f7c2, tk-5c08afc4431a, tk-89ef733809f8 completed with checkpoints.
- Reviewer: NEEDS_WORK → remediated → APPROVED.
- Scanner: 92% coverage pre-remediation → AC5 gap closed.
- Checkpoints: 93b19fd0, 1f710778, 4895d2e8.

## Consequence Context

1. **Delivered value — pass:** Agents receive durable workflow orientation and allowed-next-action contract. Source: directive module, consumer wiring, tests.
2. **Enabling-only/follow-up dependency — n/a:** No linked follow-up. Source: change state.
3. **Ops readiness — pending:** Harden owns release readiness. Source: workflow.
4. **Migration/data impact — n/a:** No runtime data model change; directive is pure projection. Source: derive-on-read design.
5. **Frontend/preview impact — not_applicable:** No visual surface. Source: agreement preview applicability.
6. **Collision/release risk — pass:** Reviewer APPROVED; full suite green. Source: reviewer report and verification.
7. **Open follow-ups — n/a:** None. Source: reports.
8. **Next action — pending approval:** Acceptance proceeds to release hardening. Source: workflow.