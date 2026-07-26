# Executive Summary: Fix reviewer evidence verification_missing block

## Outcome

Task-scoped `adv-reviewer` reports now correctly serve as authoritative completion evidence for `review`-policy tasks. The consumer_warning emitter no longer produces false `verification_missing` warnings that blocked gate readiness for these tasks, eliminating the cancel+re-add-as-`type:ops` workaround that was losing task typing fidelity.

## Why it matters

Operators were forced to cancel `type:code`/`type:verification` tasks with `evidence_policy: review` and re-add them as `type:ops` to bypass a `verification_missing` blocker that fired unconditionally on every `adv-reviewer` report — regardless of whether the reviewer was the intended authority for that evidence policy. This workaround discarded code/verification semantics, evidence plans, and contract references, degrading traceability and audit quality.

## What changed

**Single-point policy gate** at `plugin/src/tools/subagent-report.ts:475-479`: the `verificationWarnings()` function now resolves the task's evidence policy via `resolveTaskEvidence(task)` and suppresses `verification_missing` when the policy is `review` and the report is from `adv-reviewer`. For `test`/`static_check` policies, the current behavior is preserved — reviewer aggregate evidence does not satisfy those policies (durable `adv_run_test` execution evidence is still required).

**New spec-law requirement** `rq-reviewerEvidenceAuthority01` in `advance-workflow` codifies the authority partition: `review` policy = reviewer is authority; `test`/`static_check` = durable execution evidence required. Four scenarios warrant AC1, AC2, AC5, and same-task ownership preservation.

## Verification

- **42 asset tests** pass (spec requirement presence + structure assertions)
- **66 subagent-report tests** pass (TDD red→green: review-policy suppresses, test-policy preserves)
- **103 gate-readiness tests** pass (AC1 no-block, AC2 block-remains, AC3 warn-first, AC4 change-scoped rejected)
- **Full `pnpm run check`** clean (schemas, typecheck, manifests, test-isolation, lockfile, lint, format)

## Risks and follow-ups

- **Forward-looking only**: existing reports already carrying `verification_missing` remain blocked until a new warning-free report is submitted (latest-wins by attempt). New report submissions for `review`-policy tasks after deploy will not carry the warning.
- **`fixOpsResolutionProjection`** (currently stuck) has `evidence_policy: test` — this fix does not auto-unblock it (test policy still needs durable evidence).
- **Static_check friction**: the fix only suppresses `verification_missing` for `review` policy. Spec-law tasks with `static_check` policy may still face the same friction (dispositioned during this change's acceptance as a pre-fix artifact). If this recurs broadly, a follow-up may extend the authority partition.
- **Schema gap** in `ChangeScopedReviewerSubagentReportSchema` (doesn't enforce reviewer-key pairing) tracked separately — different defect, not addressed here.