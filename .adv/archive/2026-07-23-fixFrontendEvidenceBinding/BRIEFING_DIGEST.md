# Archive Briefing Digest

**Change ID:** fixFrontendEvidenceBinding
**Title:** Fix frontend evidence binding
**Status:** archived
**Generated:** 2026-07-23T17:23:28.602Z

## Identity Anchors

- CHANGE
- STATUS
- TERMINAL_GATE_SUMMARY

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

Showing 37 of 37 durable facts.

- **[archive_only_evidence]** decisions: Detected top-level implementation_cycle_id via recursive scan of Zod union issues — ScopedSubagentReportSchema is a union; the unrecognized_keys issue for the top-level key is nested inside an invalid_union issue. A flat scan would miss it.
- **[archive_only_evidence]** decisions: Did not implement blanket missing-apply_context hint injection — Task-scoped adv-engineer/adv-designer reports without apply_context are valid legacy payloads (confirmed by existing tests). Appending the hint on unrelated rejections would violate DDC1 and break existing tests. The hint is only injected when the parse failure is structurally caused by implementation_cycle_id being at the top level.
- **[archive_only_evidence]** decisions: Used a local UnrecognizedKeysIssue interface instead of z.ZodUnrecognizedKeysIssue — Zod v4 does not export ZodUnrecognizedKeysIssue in this project's version; the local interface avoids a typecheck error.
- **[archive_only_evidence]** verification: ../bin/oc-test targeted -- src/tools/subagent-report.test.ts src/types/subagent-reports.test.ts (1) — RED: 3 tests failed as expected before implementation (buildApplyContextBindingHint missing, parseReport hint not yet injected)
- **[archive_only_evidence]** verification: ../bin/oc-test targeted -- src/tools/subagent-report.test.ts src/types/subagent-reports.test.ts (0) — GREEN: 121 tests passed after implementation
- **[archive_only_evidence]** verification: pnpm run typecheck (0) — TypeScript typecheck clean
- **[archive_only_evidence]** verification: ../bin/oc-test smoke (0) — Smoke suite passes (schemas:check, typecheck, manifests:check, test-isolation, lockfile-policy, lint, format:check, targeted tests)
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: bash-red-2026-07-23
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: bash-green-2026-07-23
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: bash-typecheck-2026-07-23
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: bash-smoke-2026-07-23
- **[archive_only_evidence]** decisions: Inserted the same canonical apply_context snippet into all three docs to ensure a single source of truth for the strict schema. — The task requires consistent engineer + designer guidance and a bridge note in the command packet; a single snippet shape is the only required deliverable.
- **[archive_only_evidence]** verification: grep for canonical snippet across docs (0) — 3 matches: canonical snippet appears in adv-designer.md, adv-engineer.md, and adv-apply.md
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: doc-check-apply-context-nesting
- **[archive_only_evidence]** decisions: Imported and appended formatApplyContextBindingHint() only to the designer-evidence TASK_COMPLETION_BLOCKED throw — AC3 specifically requires the apply_context binding hint on the designer-evidence rejection; other throws (no-cycle, engineer-receipt) are out of scope and left unchanged to avoid scope drift.
- **[archive_only_evidence]** decisions: Used makeLegacyDesignerReport to create an accepted designer report without apply_context for the red/green test — The submit-reject path only rejects adv-designer reports that carry a non-matching apply_context; reports without apply_context are accepted as legacy, so this reproduces the exact AC3 scenario where accepted designer evidence lacks the cycle binding.
- **[archive_only_evidence]** verification: ../bin/oc-test targeted -- src/temporal/change-state.test.ts (0) — All 82 tests pass, including new AC3 binding-hint test
- **[archive_only_evidence]** verification: pnpm run typecheck (0) — TypeScript typecheck passes with no errors
- **[archive_only_evidence]** verification: pnpm exec prettier --check src/temporal/change-state.ts src/temporal/change-state.test.ts (0) — Changed files conform to Prettier formatting
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: ../bin/oc-test targeted -- src/temporal/change-state.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: pnpm run typecheck
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: pnpm exec prettier --check src/temporal/change-state.ts src/temporal/change-state.test.ts
- **[archive_only_evidence]** decisions: Placed AC1 positive gate test in change-state.test and AC5 engineer symmetry test in subagent-report.test — change-state.test owns the designer-completion fixtures and gate logic; subagent-report.test owns adv_subagent_report_submit acceptance, giving direct coverage of both warrants
- **[archive_only_evidence]** decisions: Used the documented adv-designer.md snippet as the DDC2 drift-guard input — Reading the canonical doc block at test time makes the test a true drift guard: if the snippet drifts from SubagentApplyContextSchema, CI fails
- **[archive_only_evidence]** decisions: All three tests passed immediately without production changes — The sibling tasks already implemented the matching/gate/schema behavior; these tests pin the contract
- **[archive_only_evidence]** verification: ../bin/oc-test targeted -- src/tools/subagent-report.test.ts src/types/subagent-reports.test.ts src/temporal/change-state.test.ts (0) — 206 tests pass across the three targeted test files
- **[archive_only_evidence]** verification: pnpm run typecheck (0) — tsc --noEmit clean
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: ../bin/oc-test targeted -- src/tools/subagent-report.test.ts src/types/subagent-reports.test.ts src/temporal/change-state.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: pnpm run typecheck
- **[report_follow_up]** follow_ups: Root orchestrator: inspect rq-delDefaults10 and relevant subagent-report spec with adv_spec; this session received a role-firewall denial.
- **[report_follow_up]** follow_ups: Test structural message injection for top-level implementation_cycle_id and for frontend completion with an accepted legacy designer report lacking apply_context.
- **[report_follow_up]** follow_ups: Test the exact documented JSON example by parsing a complete valid engineer/designer fixture, including required implementation_provenance.
- **[research_citation]** sources: Local report schema: Apply context is a strict nested object requiring both implementation_cycle_id and implementation_provenance. (file:///home/jon/dev/advance/plugin/src/types/subagent-reports.ts#L148-L175)
- **[research_citation]** sources: Local completion authority: Frontend completion requires a task apply cycle, matching complete designer evidence, and matching implementation receipt. (file:///home/jon/dev/advance/plugin/src/temporal/change-state.ts#L1088-L1125)
- **[research_citation]** sources: Local matching helpers: Same-cycle matching uses the nested apply_context implementation_cycle_id and validates designer provenance against an eligible engineer report or inline receipt. (file:///home/jon/dev/advance/plugin/src/temporal/change-state.ts#L1295-L1363)
- **[research_citation]** sources.omitted: 2 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: The proposed no-logic-change approach aligns with the current structural boundary: engineer and designer schemas accept only nested apply_context, the completion authority derives cycle identity solely from that object, and matching requires that cycle plus valid provenance. Preserving strictness and avoiding auto-binding protect this authority. Caution: the design must define a concrete canonical-snippet mechanism and show the complete required nested shape, including implementation_provenance; otherwise the promised copyable example cannot be structurally valid. Spec-law compliance could not be independently checked because adv_spec is role-firewalled in this sub-agent session.

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| SC1 | success_criterion | pass |
| SC2 | success_criterion | pass |
| SC3 | success_criterion | pass |
| AC1 | acceptance_criterion | pass |
| AC2 | acceptance_criterion | pass |
| AC3 | acceptance_criterion | pass |
| AC4 | acceptance_criterion | pass |
| AC5 | acceptance_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| C4 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |
| OOS1 | out_of_scope | missing |
| OOS2 | out_of_scope | missing |
| OOS3 | out_of_scope | missing |

## Unresolved Actions

- verification_missing: No durable adv_run_test evidence found for run_id: bash-red-2026-07-23
- verification_missing: No durable adv_run_test evidence found for run_id: bash-green-2026-07-23
- verification_missing: No durable adv_run_test evidence found for run_id: bash-typecheck-2026-07-23
- verification_missing: No durable adv_run_test evidence found for run_id: bash-smoke-2026-07-23
- verification_missing: No durable adv_run_test evidence found for run_id: doc-check-apply-context-nesting
- verification_missing: No durable adv_run_test evidence found for run_id: ../bin/oc-test targeted -- src/temporal/change-state.test.ts
- verification_missing: No durable adv_run_test evidence found for run_id: pnpm run typecheck
- verification_missing: No durable adv_run_test evidence found for run_id: pnpm exec prettier --check src/temporal/change-state.ts src/temporal/change-state.test.ts
- verification_missing: No durable adv_run_test evidence found for run_id: ../bin/oc-test targeted -- src/tools/subagent-report.test.ts src/types/subagent-reports.test.ts src/temporal/change-state.test.ts
- verification_missing: No durable adv_run_test evidence found for run_id: pnpm run typecheck
