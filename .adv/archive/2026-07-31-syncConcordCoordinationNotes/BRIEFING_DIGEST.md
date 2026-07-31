# Archive Briefing Digest

**Change ID:** syncConcordCoordinationNotes
**Title:** Sync Concord coordination notes
**Status:** archived
**Generated:** 2026-07-31T01:45:11.926Z

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

Showing 35 of 35 durable facts.

- **[report_follow_up]** follow_ups: Investigate unrelated full-temporal-suite failures in activities.disk-projection, archive-phase9-splitbrain, and legacy-copoll integration tests.
- **[unresolved_action]** required_main_agent_actions: Reconcile task checkpoint and TDD evidence in ADV state.
- **[archive_only_evidence]** decisions: Use coordination-claim signal payload exported by the shared types surface — The signal type is defined in the shared type module rather than Temporal contracts, preserving one authoritative type source.
- **[archive_only_evidence]** verification: pnpm run typecheck (0) — TypeScript passes with no errors after fixing signal payload import path
- **[archive_only_evidence]** verification: pnpm vitest run src/temporal/change-state.coordination-claim.test.ts src/temporal/messages.test.ts src/temporal/search-attributes.test.ts src/temporal/observability.test.ts (0) — 35 focused tests pass
- **[archive_only_evidence]** verification: pnpm vitest run src/temporal/service.test.ts src/temporal/service-reconnect.test.ts (0) — 39 service tests pass
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: typecheck-20260730
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: vitest-focused-20260730
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: vitest-service-20260730
- **[archive_only_evidence]** decisions: Added .transform((arr) => [...new Set(arr)]) to exact_identifiers and generated_terms in ChangeCoordinationClaimSchema — Identifiers are normalized to lowercase/trimmed, so case/whitespace variants collapse to the same value. Keeping duplicates bloats the stored claim and the projected AdvCoordinationClaim Text search attribute, and provides no semantic value. Deduplicating at the schema layer is the minimum structural fix and propagates to both the persisted workflow state and the Visibility projection.
- **[archive_only_evidence]** verification: pnpm vitest run src/temporal/change-state.coordination-claim.test.ts (1) — Red phase: new deduplication test failed as expected because duplicate identifiers/terms were not normalized away.
- **[archive_only_evidence]** verification: pnpm vitest run src/temporal/change-state.coordination-claim.test.ts (0) — Green phase: deduplication test passes after schema transform fix; all 10 coordination-claim tests pass.
- **[archive_only_evidence]** verification: pnpm run typecheck (0) — TypeScript typecheck passes after schema change.
- **[archive_only_evidence]** decisions: Extend adv_wip_state with typed claim_inventory — It is the existing active inventory/WIP read surface; an additive response avoids a new coordination tool.
- **[archive_only_evidence]** decisions: Use exact identifiers for conflict authority — Generated terms stay visible for later search but cannot determine ownership or a no-conflict result.
- **[archive_only_evidence]** verification: pnpm vitest run src/tools/backlog.test.ts (0) — 23/23 tests pass, including 7 new claim-inventory tests.
- **[archive_only_evidence]** verification: pnpm run typecheck (0) — Typecheck passed.
- **[archive_only_evidence]** verification: pnpm vitest run src/temporal/change-state.coordination-claim.test.ts src/__tests__/backlog-coordination-regression.test.ts (0) — 18/18 related tests passed.
- **[archive_only_evidence]** verification: pnpm run lint -- src/tools/backlog.ts src/tools/backlog.test.ts (0) — Touched files have no lint errors.
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: bash-001
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: bash-002
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: bash-003
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: bash-004
- **[archive_only_evidence]** decisions: Use exact identifiers for conflict authority — Search ranking remains advisory.
- **[archive_only_evidence]** verification: pnpm vitest run src/tools/backlog.test.ts (0) — Durable verify evidence: 29 claim-inventory and advisory-search tests passed.
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_ms896t88_b7498d86
- **[archive_only_evidence]** decisions: Implement advisory search inside claim_inventory — It reuses the complete active inventory without creating a new authority surface.
- **[archive_only_evidence]** verification: pnpm vitest run src/tools/backlog.test.ts (1) — Red advisory-search test failed as expected.
- **[archive_only_evidence]** verification: pnpm vitest run src/tools/backlog.test.ts (0) — Green: 29/29 passed.
- **[archive_only_evidence]** verification: pnpm run typecheck (0) — Typecheck passed.
- **[unresolved_action]** required_main_agent_actions: Review and checkpoint the scoped remediation in plugin/src/temporal/workflows.ts before task completion.
- **[unresolved_action]** required_main_agent_actions: Do not revisit unrelated coordination or workflow behavior; the scoped claim inventory, exact overlap, degraded behavior, and advisory search paths were reviewed.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] A field added to ChangeWorkflowState must be included in both buildChangeWorkflowContinueAsNewSeed and seed restoration; workflow signal-handler structural tests detect incomplete rotation persistence.
- **[archive_only_evidence]** changes_made: plugin/src/temporal/workflows.ts: Fixed claim durability: coordinationClaimSet now schedules change-projection persistence, and coordination_claim survives and restores across continue-as-new.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/temporal/change-state.coordination-claim.test.ts src/tools/backlog.test.ts src/temporal/contracts.test.ts src/temporal/workflows.signal-handlers.itest.ts, git diff --check results=pass — Focused Temporal, state, inventory, advisory-search, and contract tests: 4 files / 79 tests passed. git diff --check passed. Review traced typed schema validation, exact-only conflict authority, blocked/degraded clean-conclusion guard, and explicitly advisory fuzzy ranking.

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| SC1 | success_criterion | pass |
| SC2 | success_criterion | pass |
| SC3 | success_criterion | pass |
| SC4 | success_criterion | pass |
| SC5 | success_criterion | pass |
| SC6 | success_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| C4 | constraint | respected |

## Unresolved Actions

- Reconcile task checkpoint and TDD evidence in ADV state.
- verification_missing: No durable adv_run_test evidence found for run_id: typecheck-20260730
- verification_missing: No durable adv_run_test evidence found for run_id: vitest-focused-20260730
- verification_missing: No durable adv_run_test evidence found for run_id: vitest-service-20260730
- verification_missing: No durable adv_run_test evidence found for run_id: bash-001
- verification_missing: No durable adv_run_test evidence found for run_id: bash-002
- verification_missing: No durable adv_run_test evidence found for run_id: bash-003
- verification_missing: No durable adv_run_test evidence found for run_id: bash-004
- verification_missing: No durable adv_run_test evidence found for run_id: tr_ms896t88_b7498d86
- Review and checkpoint the scoped remediation in plugin/src/temporal/workflows.ts before task completion.
- Do not revisit unrelated coordination or workflow behavior; the scoped claim inventory, exact overlap, degraded behavior, and advisory search paths were reviewed.
