# Archive Briefing Digest

**Change ID:** fixPoisonedClosePathPrecheck
**Title:** Fix poisoned close path precheck
**Status:** archived
**Generated:** 2026-07-25T00:04:47.001Z

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

Epic: hardenTemporalReliability · Fix poisoned close path precheck (order 17)

## Durable Facts

Showing 9 of 9 durable facts.

- **[archive_only_evidence]** decisions: Extended shouldTakeRecoveryBranch signature to accept approvedByUser/approvalEvidence for call-site symmetry — Task instructions specify calling with those args; accepting them as optional no-ops preserves the existing contract while allowing the exact call shape.
- **[archive_only_evidence]** decisions: Used unpinned handle terminate in adv_change_workflow_terminate recovery branch — The recovery branch skips describe() so no runId is available; the unpinned handle terminates the current workflow run, consistent with the operator-authorised recovery escape hatch.
- **[archive_only_evidence]** verification: npx vitest run src/tools/change.test.ts src/tools/change.workflow-terminate.test.ts src/tools/recovery-probe.test.ts src/tools/change/ (0) — 256 tests pass across close-path and recovery-probe suites
- **[archive_only_evidence]** verification: npx tsc --noEmit (0) — TypeScript typecheck passes
- **[archive_only_evidence]** verification: pnpm run check (0) — schemas, manifests, test isolation, lockfile policy, lint, and format checks pass
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: vitest-close-path-2026-07-24
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tsc-noemit-2026-07-24
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: pnpm-run-check-2026-07-24
- **[epic_terminal_note]** epic.membership: hardenTemporalReliability · Fix poisoned close path precheck (order 17)

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| AC1 | acceptance_criterion | pass |
| AC2 | acceptance_criterion | pass |
| AC3 | acceptance_criterion | pass |
| AC4 | acceptance_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |

## Unresolved Actions

- verification_missing: No durable adv_run_test evidence found for run_id: vitest-close-path-2026-07-24
- verification_missing: No durable adv_run_test evidence found for run_id: tsc-noemit-2026-07-24
- verification_missing: No durable adv_run_test evidence found for run_id: pnpm-run-check-2026-07-24
