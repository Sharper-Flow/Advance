# Archive Briefing Digest

**Change ID:** fixFindingRouting
**Title:** Fix finding routing
**Status:** archived
**Generated:** 2026-08-05T04:56:31.835Z

## Identity Anchors

- CHANGE
- STATUS
- TERMINAL_GATE_SUMMARY
- Origin: triage

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

Showing 28 of 28 durable facts.

- **[archive_only_evidence]** verification: tests_run= results=n/a — Task-scoped respects evidence based on the completed change review; DONT1 and DONT2 claims confirmed honored.
- **[archive_only_evidence]** verification: tests_run= results=n/a — Task-scoped respects evidence based on the completed change review; DONT4 (no error_recovery inflation for progress), DONT5, and OOS7 claims confirmed honored.
- **[archive_only_evidence]** verification: tests_run= results=n/a — Task-scoped respects evidence based on the completed change review; DONT1 and DONT2 claims confirmed honored.
- **[archive_only_evidence]** verification: tests_run= results=n/a — Task-scoped respects evidence based on the completed change review; DONT2 and OOS1 (read-only, no portfolio mutation) claims confirmed honored.
- **[archive_only_evidence]** verification: tests_run= results=n/a — Task-scoped respects evidence based on the completed change review; DONT4 and DONT5 claims confirmed honored.
- **[archive_only_evidence]** verification: tests_run= results=n/a — Task-scoped respects evidence based on the completed change review; DONT1, OOS2 (no relitigation of completed tasks), and OOS3 claims confirmed honored.
- **[report_follow_up]** follow_ups: Verify whether any current report-submit path hard-blocks at retry budget (AC7/C4 prep-confirm).
- **[report_follow_up]** follow_ups: Specify KD1 respects-authority behavior for test-policy tasks (AC3/objective-2 edge case).
- **[report_follow_up]** follow_ups: Confirm progress_rounds Zod additive/optional + replay-determinism.test.ts stays green (C7).
- **[report_follow_up]** follow_ups: Reconcile rq-loopLedger01 retryFailureCount derivation with KD4 progress/retry distinction.
- **[report_follow_up]** follow_ups: Correct lever-citation directory paths (5 files) before DDC5/AC5 anchors.
- **[research_citation]** sources: gate-readiness.ts checkUnresolvedVerificationEvidence: Acceptance/release-only (line 710). Iterates done tasks, skips non-proof-bearing, emits VERIFICATION_EVIDENCE_MISSING. Confirms KD2 gate-binding matches existing pattern. (plugin/src/temporal/gate-readiness.ts:706-788)
- **[research_citation]** sources: gate-readiness.ts checkCompletedTaskEvidencePlan: Also acceptance/release-only (800). 'completion' stage validation runs AT the gate not task-done — AC3 'completion/gate' both resolve at acceptance/release. (plugin/src/temporal/gate-readiness.ts:796-810)
- **[research_citation]** sources: evidence-policy.ts: PROOF_BEARING includes 'review' (38). ReviewEvidenceRef (77-83) written only by adv-reviewer consumer — completion authority. (plugin/src/types/evidence-policy.ts:35-83)
- **[research_citation]** sources.omitted: 15 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Design is architecturally sound and consistent with the codebase's established evidence-enforcement model (structure at prep via rq-PR010, resolution at completion/acceptance via checkCompletedTaskEvidencePlan + checkUnresolvedVerificationEvidence). KD2's gate-binding for respects evidence matches the existing implements/verifies pattern, so 'block everywhere / no grandfathering' is satisfied architecturally (every task's respects evidence is evaluated at the next acceptance/release gate; AC3 'completion/gate' both resolve there in the current model). The KD4 reducer substrate is correctly identified and command-level replay-safe because no workflow handler branches on retry state to emit commands (workflows.ts:615-678 are read-projections; readyForAcceptance uses incompleteTaskCount). Authority machinery (task-classifier.ts:387-394) genuinely requires adv-reviewer, so self-assertion is blocked. Spec-law: no spec contradicted; KD4 must keep rq-loopLedger01 retryFailureCount consistent (it derives from the same error_recovery substrate). Three substance-level concerns: (1) KD1 underspecified for test-route tasks claiming respects on review-policy avoidances (review_evidence_ref machinery is non-test-gated); (2) KD4 retry_count semantics change does not address rq-loopLedger01 consistency; (3) the design's own P38 lever-citations carry wrong directory prefixes (substance/line-numbers correct, paths wrong), undermining DDC5/AC5 anchor exactness. required_validation_consistency.status = caution = validation.status (both caution).
- **[unresolved_action]** required_main_agent_actions: Create or dispatch six remediation review Context Packets with TASK anchors, then persist task-scoped adv-reviewer reports for tk-5a18730016a5, tk-9d5613c99473, tk-db22a5e28980, tk-e5b7b138c45b, tk-fb7e557948b3, and tk-0f9abb0a1843.
- **[unresolved_action]** required_main_agent_actions: Checkpoint the five Prettier-only edits before continuing acceptance.
- **[unresolved_action]** required_main_agent_actions: Re-run acceptance gate readiness after the six task reports are recorded.
- **[archive_only_evidence]** changes_made: plugin/src/finding-routing-assets.test.ts: Applied Prettier formatting required by the repository check; no behavior change.
- **[archive_only_evidence]** changes_made: plugin/src/temporal/change-state.test.ts: Applied Prettier formatting required by the repository check; no behavior change.
- **[archive_only_evidence]** changes_made: plugin/src/temporal/change-state.ts: Applied Prettier formatting required by the repository check; no behavior change.
- **[archive_only_evidence]** changes_made: plugin/src/temporal/gate-readiness.ts: Applied Prettier formatting required by the repository check; no behavior change.
- **[archive_only_evidence]** changes_made: plugin/src/tools/portfolio-state.test.ts: Applied Prettier formatting required by the repository check; no behavior change.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/temporal/change-state.test.ts src/temporal/gate-readiness.test.ts src/tools/portfolio-state.test.ts src/utils/tool-formatters.test.ts src/finding-routing-assets.test.ts, bin/oc-test targeted -- src/temporal/__tests__/replay-determinism.test.ts, pnpm run check results=pass — 305/305 targeted tests passed; replay-determinism 20/20 passed; pnpm run check passed schemas, typecheck, manifest/frontmatter/isolation/lockfile checks, lint (4 warnings), and Prettier after formatting.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/temporal/change-state.test.ts src/temporal/gate-readiness.test.ts src/tools/portfolio-state.test.ts src/utils/tool-formatters.test.ts src/finding-routing-assets.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/temporal/__tests__/replay-determinism.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm run check

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| SC1 | success_criterion | pass |
| SC2 | success_criterion | pass |
| SC3 | success_criterion | pass |
| SC4 | success_criterion | pass |
| SC5 | success_criterion | pass |
| AC1 | acceptance_criterion | pass |
| AC2 | acceptance_criterion | pass |
| AC3 | acceptance_criterion | pass |
| AC4 | acceptance_criterion | pass |
| AC5 | acceptance_criterion | pass |
| AC6 | acceptance_criterion | pass |
| AC7 | acceptance_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| C4 | constraint | respected |
| C5 | constraint | respected |
| C6 | constraint | respected |
| C7 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |
| DONT4 | avoidance | respected |
| DONT5 | avoidance | respected |
| OOS1 | out_of_scope | not_applicable |
| OOS2 | out_of_scope | not_applicable |
| OOS3 | out_of_scope | not_applicable |
| OOS4 | out_of_scope | not_applicable |
| OOS5 | out_of_scope | not_applicable |
| OOS6 | out_of_scope | not_applicable |
| OOS7 | out_of_scope | not_applicable |

## Unresolved Actions

- Create or dispatch six remediation review Context Packets with TASK anchors, then persist task-scoped adv-reviewer reports for tk-5a18730016a5, tk-9d5613c99473, tk-db22a5e28980, tk-e5b7b138c45b, tk-fb7e557948b3, and tk-0f9abb0a1843.
- Checkpoint the five Prettier-only edits before continuing acceptance.
- Re-run acceptance gate readiness after the six task reports are recorded.
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/temporal/change-state.test.ts src/temporal/gate-readiness.test.ts src/tools/portfolio-state.test.ts src/utils/tool-formatters.test.ts src/finding-routing-assets.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/temporal/__tests__/replay-determinism.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm run check
