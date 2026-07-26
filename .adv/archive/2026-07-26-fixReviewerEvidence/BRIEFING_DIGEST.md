# Archive Briefing Digest

**Change ID:** fixReviewerEvidence
**Title:** Fix reviewer evidence verification
**Status:** archived
**Generated:** 2026-07-26T17:57:15.018Z

## Identity Anchors

- CHANGE
- STATUS
- TERMINAL_GATE_SUMMARY
- Origin: discovery

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
| release | pending |

## Epic Context

No Epic membership

## Durable Facts

Showing 21 of 21 durable facts.

- **[archive_only_evidence]** decisions: Chose tags workflow, verification, evidence, structural, review for rq-reviewerEvidenceAuthority01 — Mirrors neighboring rq-verificationEvidence01 tags and adds review to capture the requirement's subject.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/adv-autonomy-quality-assets.test.ts (1) — RED: 7 new rq-reviewerEvidenceAuthority01 assertions fail (requirement absent); 35 existing tests pass.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/adv-autonomy-quality-assets.test.ts (0) — GREEN: all 42 tests pass after adding requirement to spec.json.
- **[archive_only_evidence]** verification: pnpm run check (0) — Full plugin check passes: schemas:check, typecheck, generate:manifests:check, test-isolation, lockfile-policy, lint, format:check.
- **[archive_only_evidence]** verification: tests_run=jq shape validation on .adv/specs/advance-workflow/spec.json, bin/oc-test targeted -- src/adv-autonomy-quality-assets.test.ts results=pass — JSON/shape validation passed. Targeted suite: 1 file, 42 tests passed, exit 0. Requirement is additive and compatible with rq-verificationEvidence01 and rq-TDD013evp.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: jq shape validation on .adv/specs/advance-workflow/spec.json
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/adv-autonomy-quality-assets.test.ts
- **[archive_only_evidence]** decisions: Imported resolveTaskEvidence from plugin/src/validator/task-classifier.ts and gated the adv-reviewer verification_missing emitter on task policy. — The spec requirement rq-reviewerEvidenceAuthority01 requires review-policy tasks to treat the same-task adv-reviewer report as authoritative, so its aggregate tests_run must not emit verification_missing; test/static_check policies still require durable adv_run_test evidence.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/subagent-report.test.ts (1) — RED: new review-policy suppression test fails as expected; 65 other tests pass.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/subagent-report.test.ts (0) — GREEN: both new policy-gate tests pass; all 66 tests pass.
- **[archive_only_evidence]** verification: pnpm run check (0) — Full plugin check passes: schemas:check, typecheck, generate:manifests:check, test-isolation, lockfile-policy, lint, format:check.
- **[archive_only_evidence]** decisions: Added persisted consumer_warnings to reviewer report mocks to reflect runtime emitter behavior — checkUnresolvedVerificationEvidence reads already-computed consumer_warnings; it does not re-run verificationWarnings
- **[archive_only_evidence]** decisions: Used stage-v2 in AC4 evidence plan — Same-task ownership for review_evidence_ref is only enforced in stage-v2 branch
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/temporal/gate-readiness.test.ts (0) — GREEN: 103 tests passed in gate-readiness.test.ts (AC1 review no-block, AC2 test block, AC3 warn-first, AC4 change-scoped rejected)
- **[archive_only_evidence]** verification: pnpm run check (0) — Full plugin check passes: schemas:check, typecheck, generate:manifests:check, test-isolation, lockfile-policy, lint, format:check
- **[report_follow_up]** follow_ups: Packet scope key researcher:fixReviewerEvidence-design-validation was schema-invalid due to uppercase characters; persisted report uses normalized schema-valid key researcher:fix-reviewer-evidence-design-validation.
- **[research_citation]** sources: Verification warning emitter and submission call site: Reviewer reports unconditionally emit verification_missing today; task is loaded from a valid task anchor before the warning function is called. (plugin/src/tools/subagent-report.ts:470-480,845-882)
- **[research_citation]** sources: Normalized evidence resolver and completion ownership: resolveTaskEvidence is exported, pure, takes Task, resolves a policy through declared/default policy, and stage-v2 reviewer evidence must be same-task and adv-reviewer-owned. (plugin/src/validator/task-classifier.ts:255-327,350-407)
- **[research_citation]** sources: Readiness evaluator: Acceptance/release blocking consumes persisted latest task-scoped verification warnings only for proof-bearing policies; it need not change if review-policy reviewer warnings are not emitted. (plugin/src/temporal/gate-readiness.ts:642-733)
- **[research_citation]** sources.omitted: 2 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: APPROVE. The consumer-side policy gate is the narrowest correct boundary: report submission has the resolved task object, while readiness remains a generic latest-warning evaluator. Direct import from validator/task-classifier introduces no observed cycle because the resolver depends only on types and no validator source imports tools/subagent-report.

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
| C5 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |
| OOS1 | out_of_scope | missing |
| OOS2 | out_of_scope | missing |
| OOS3 | out_of_scope | missing |

## Unresolved Actions

- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: jq shape validation on .adv/specs/advance-workflow/spec.json
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/adv-autonomy-quality-assets.test.ts
