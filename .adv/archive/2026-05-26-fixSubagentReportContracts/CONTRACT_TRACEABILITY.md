# Contract Traceability

**Change ID:** fixSubagentReportContracts
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-05-26T23:27:00.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | Legacy missing-field normalization covered by `src/types/subagent-reports.test.ts`, `src/storage/store-temporal/shared.test.ts`, `src/temporal/change-state.test.ts`; task tk-60a1383e8b32 GREEN: 4 files / 51 tests. |
| AC2 | acceptance_criterion | pass | test | Task tk-60a1383e8b32 readback tests passed; current preflight loaded `adv_change_show` and `adv_gate_status` successfully. |
| AC3 | acceptance_criterion | pass | test | Task tk-6d1355155f76 GREEN: `pnpm exec vitest run src/types/subagent-reports.test.ts src/tools/subagent-report.test.ts`; strict malformed submission rejection covered. |
| AC4 | acceptance_criterion | pass | test | Change-scoped reviewer schema and `review:acceptance` / `harden:release` scope keys implemented; `src/tools/subagent-report.test.ts` covers persistence without synthetic task IDs. |
| AC5 | acceptance_criterion | pass | test | `src/tools/subagent-report.test.ts` covers `INVALID_TASK_ANCHOR` diagnostics and valid anchor guidance. |
| AC6 | acceptance_criterion | pass | test | Task tk-ec41dd0a0d51 GREEN: `pnpm exec vitest run src/adv-engineer-assets.test.ts src/adv-designer-assets.test.ts src/adv-reviewer-asset.test.ts` passed 3 files / 144 tests. |
| AC7 | acceptance_criterion | pass | test | Spec law updated; `src/subagent-reports-spec-assets.test.ts` passed. Full execution verification passed `pnpm test`, `pnpm run check`, and `pnpm run build`. |
| C1 | constraint | respected | static_check | Temporal tests and `src/temporal/workflow-bundle-boundary.test.ts` passed in tk-60a1383e8b32 verification. |
| C2 | constraint | respected | static_check | Strict Zod submission tests pass in `src/types/subagent-reports.test.ts` and `src/tools/subagent-report.test.ts`. |
| C3 | constraint | respected | static_check | Normalizer uses explicit agent allowlist and deterministic default fills; scope keys are structurally validated and tested. |
| C4 | constraint | respected | static_check | Individual scanner prompts remain non-persisted; orchestrator submitted one `adv-scanner-bundle` report with change scope `scanner-bundle:review`. |
| C5 | constraint | respected | static_check | Cross-repo audit passed: no `target_repo`, `target_path`, cancellations, or `fixTaskCompletion` semantic changes; 5 tasks done / 0 cancelled. |
| DONT1 | avoidance | respected | review | Automatic normalization implemented; no manual ADV state-file mutation used or required. |
| DONT2 | avoidance | respected | review | Reviewer reports use change-scoped anchors; invalid task anchors fail with diagnostics. |
| DONT3 | avoidance | respected | review | Malformed new submissions remain rejected by strict schema tests. |
| DONT4 | avoidance | respected | review | Diff limited to report schemas, readback, diagnostics, prompts/contracts, specs, and tests. |
| DONT5 | avoidance | respected | review | Prompt asset tests enforce structural scope examples; string scope remains compatibility-only. |
| OOS1 | out_of_scope | not_applicable | not_applicable | No broad ADV delegation/sub-agent architecture rewrite in diff. |
| OOS2 | out_of_scope | not_applicable | not_applicable | No task-completion ownership/semantics changes; audit found no `fixTaskCompletion` expansion. |
| OOS3 | out_of_scope | not_applicable | not_applicable | No unrelated report variants added beyond agreed reviewer change-scope/scanner-bundle support. |
| OOS4 | out_of_scope | not_applicable | not_applicable | No manual external ADV state mutation path used as intended fix. |
| OOS5 | out_of_scope | not_applicable | not_applicable | No broad scanner/handoff persistence refactor; scanner lane clarified and bundle submitted structurally. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-849e0bdf3a90 | AC7 | AC7 | C1, C2, C3, C4, C5, DONT1, DONT2, DONT3, DONT4, DONT5, OOS1, OOS2, OOS3, OOS4, OOS5 |  |
| tk-60a1383e8b32 | AC1, AC2 | AC1, AC2, AC3 | C1, C2, C3, DONT1, DONT3, DONT4, OOS1, OOS4 |  |
| tk-6d1355155f76 | AC3, AC4, AC5 | AC3, AC4, AC5 | C2, C3, C4, DONT2, DONT3, DONT4, OOS1, OOS3, OOS5 |  |
| tk-ec41dd0a0d51 | AC4, AC6, AC7 | AC4, AC6, AC7 | C2, C3, DONT2, DONT4, DONT5, OOS1, OOS2 |  |
| tk-f9ed7b153d02 |  | AC1, AC2, AC3, AC4, AC5, AC6, AC7 | C1, C2, C3, C4, C5, DONT1, DONT2, DONT3, DONT4, DONT5, OOS1, OOS2, OOS3, OOS4, OOS5 |  |
