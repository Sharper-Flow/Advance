# Archive Briefing Digest

**Change ID:** fixArchiveConvergence
**Title:** Fix archive convergence durability gap
**Status:** archived
**Generated:** 2026-07-24T22:48:19.479Z

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

Showing 17 of 17 durable facts.

- **[report_follow_up]** follow_ups: Task command referenced src/tools/change.archive-phase9.test.ts (no slash), which does not exist in this worktree. I ran the existing src/tools/change/archive-gate.test.ts and src/temporal/__tests__/replay-determinism.test.ts instead.
- **[archive_only_evidence]** decisions: Used runTemporalRead + createTemporalReadContext with a 3s budget instead of a raw Promise.race — Runs through Connection.withDeadline/AbortController on a real connection so the gRPC call is cancelled; in test mocks it falls back to the existing bounded retry wrapper Promise.race. Satisfies DONT2 and C5.
- **[archive_only_evidence]** decisions: Added an optional recoverOnUnresponsive flag to recoverReleaseGateIfWorkflowCompleted — The existing helper only recovered on completed-workflow errors. A bounded timeout from an orphaned workflow is not a completed-workflow error, so the recovery path needs explicit authority to treat an unresponsive query as a dead-workflow recovery in the shipped-finalization archive path. The flag defaults to false so other callers keep their existing contract.
- **[archive_only_evidence]** decisions: Treated all terminal describe statuses (COMPLETED, TERMINATED, FAILED, CANCELLED, TIMED_OUT) as recovery triggers — AC2 specifically calls out TERMINATED; treating the full terminal set is consistent with Temporal execution semantics and avoids queuing a query against any already-finished workflow.
- **[archive_only_evidence]** verification: npx vitest run src/tools/change/archive-gate.test.ts src/temporal/__tests__/replay-determinism.test.ts (0) — All 33 tests pass (20 archive-gate unit + 13 replay-determinism)
- **[archive_only_evidence]** verification: pnpm run check (0) — schemas:check, typecheck, manifest check, test isolation, lockfile policy, eslint, and prettier all green
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: manual-bash-2026-07-24
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: manual-bash-pnpm-check
- **[archive_only_evidence]** decisions: Implemented saveRecoveredArchiveConvergence in plugin/src/tools/change.ts as a sibling to convergeTerminalAuthority — Matches task guidance and keeps convergence helpers together; avoids circular imports by staying in the file the archive flow already imports
- **[archive_only_evidence]** decisions: Wired the writer into the archive flow's recover_via_disk save-error path only when finalization.status === 'shipped' — This is the dead-workflow detection point where a shipped change with a failed status save can be safely converged in one disk write; non-shipped cases keep the existing saveRecoveredChangeStatus fallback
- **[archive_only_evidence]** decisions: Reverted an accidental edit to the main checkout /home/jon/dev/advance/plugin/src/tools/change.ts — Morph_edit targeted the wrong path; trunk must stay unmodified per worktree-isolation policy
- **[archive_only_evidence]** verification: pnpm run check (0) — schemas:check, typecheck, manifest check, test isolation, lockfile policy, eslint, and prettier all green
- **[archive_only_evidence]** verification: npx vitest run src/tools/change.archive-convergence.test.ts src/tools/change/archive-gate.test.ts src/tools/change.workflow-terminate.test.ts src/temporal/__tests__/replay-determinism.test.ts (0) — 70 tests pass (5 new convergence + 20 archive-gate + 32 workflow-terminate + 13 replay-determinism)
- **[archive_only_evidence]** verification: npx tsc --noEmit (0) — TypeScript typecheck passes
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_2026-07-24-check
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_2026-07-24-targeted
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_2026-07-24-tsc

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| AC1 | acceptance_criterion | pass |
| AC2 | acceptance_criterion | pass |
| AC3 | acceptance_criterion | pass |
| AC4 | acceptance_criterion | pass |
| AC5 | acceptance_criterion | pass |
| AC6 | acceptance_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| C4 | constraint | respected |
| C5 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |
| DONT4 | avoidance | respected |

## Unresolved Actions

- verification_missing: No durable adv_run_test evidence found for run_id: manual-bash-2026-07-24
- verification_missing: No durable adv_run_test evidence found for run_id: manual-bash-pnpm-check
- verification_missing: No durable adv_run_test evidence found for run_id: tr_2026-07-24-check
- verification_missing: No durable adv_run_test evidence found for run_id: tr_2026-07-24-targeted
- verification_missing: No durable adv_run_test evidence found for run_id: tr_2026-07-24-tsc
