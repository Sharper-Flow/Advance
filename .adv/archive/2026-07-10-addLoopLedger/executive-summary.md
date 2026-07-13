# Executive Summary

## Outcome
Adds an opt-in loop-ledger readback for Advance changes. Routine change reads stay compact; explicit callers can inspect bounded loop details drawn from existing task, report, test, and CI evidence.

## Why It Matters
Makes retry and remediation history inspectable without treating diagnostic output as workflow authority. This improves reviewability while preserving existing task, gate, test, and contract controls.

## Verdict
APPROVED

## What Was Built
1. Typed loop-ledger schemas and a pure projector for apply retries, review/harden remediation, verification triage, and CI repair evidence.
2. `adv_change_show` flags: `include.loopLedger`, `include.loopLedgerDetails`, and bounded `include.loopLedgerLimit`.
3. Bounded `test_runs` evidence projection; it is hidden from normal change output and never counts as authoritative retry state.
4. Updated delivery, sub-agent-report, and TDD specs plus generated change schema.

## What Was Verified
- Verdict: READY; acceptance reviewer found 0 blockers and 0 issues.
- Tests: targeted change, loop-ledger, purity, storage-mapping suites passed (114 verifier tests; 122 task verification tests).
- Checks: `pnpm run schemas:check` and `pnpm run typecheck` passed.
- Preview URL: not_applicable — agreement declares `visual_surface: false`; scope changes backend/tool readback only.
- Contract matrix: 27 required/recorded rows passed, respected, or explicitly not applicable; 0 failing rows.

## Remaining Concerns
- Non-blocking repository baseline: `adv-skill-backed-commands-assets.test.ts` pins an already-stale `advance-workflow` version (expects 1.26.0; untouched spec is 1.27.0). It is outside this change and was not treated as a loop-ledger regression.

## Supporting Evidence
- Tasks: `tk-52cde4253623`, `tk-e45e7e3b8209`, `tk-42fcb03c8554`, `tk-3667e10e06c3`.
- Review: `adv-reviewer` report `addLoopLedger|change:review:acceptance|adv-reviewer|1` — READY.
- Verification: persisted `adv-verification-triage-bundle` `verifier:loop-ledger` attempt 2.
- Checkpoints: `803a31a2`, `05fb6c1d`, `d4ad3484`.

## Consequence Context
1. **Delivered value — pass.** Opt-in typed loop visibility replaces scattered diagnostic lookup; evidence: projector and change-readback tests.
2. **Enabling-only/follow-up dependency — n/a.** No required child change or runtime dependency; evidence: approved agreement and no required follow-ups.
3. **Ops readiness — pending.** Harden owns final release/deploy/docs/cleanup readiness; evidence: acceptance-stage workflow boundary.
4. **Migration/data impact — n/a.** Additive optional `test_runs` read model only; no migration or external data operation; evidence: ChangeSchema and workflow mapping.
5. **Frontend/preview impact — n/a.** No browser-visible scope; `visual_surface: false` in agreement.
6. **Collision/release risk — low.** Pure read model and generated schema update; reviewer found no issues; evidence: acceptance review and clean diff check.
7. **Open follow-ups — warning.** Unrelated asset-version pin remains outside scope; no loop-ledger required follow-up.
8. **Next action — pending approval.** User acceptance advances inline to hardening; evidence: completed contract review matrix and READY review.