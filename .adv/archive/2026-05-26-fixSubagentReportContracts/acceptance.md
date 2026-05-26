# Acceptance

Reviewed at: 2026-05-26T23:27:00.000Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| AC1 | acceptance_criterion | Legacy task and sidecar sub-agent reports missing `scope_drift` and/or `required_main_agent_actions` load with safe defaults. | pass | Legacy missing-field normalization covered by `src/types/subagent-reports.test.ts`, `src/storage/store-temporal/shared.test.ts`, `src/temporal/change-state.test.ts`; task tk-60a1383e8b32 GREEN: 4 files / 51 tests. |
| AC2 | acceptance_criterion | `adv_change_show` and `adv_gate_status` work on changes containing those legacy reports. | pass | Task tk-60a1383e8b32 readback tests passed; current preflight loaded `adv_change_show` and `adv_gate_status` successfully. |
| AC3 | acceptance_criterion | New malformed report submissions remain rejected by strict Zod validation. | pass | Task tk-6d1355155f76 GREEN: `pnpm exec vitest run src/types/subagent-reports.test.ts src/tools/subagent-report.test.ts`; strict malformed submission rejection covered. |
| AC4 | acceptance_criterion | Acceptance-stage reviewer reports persist reliably through a supported structural anchor model; no synthetic task IDs. | pass | Change-scoped reviewer schema and `review:acceptance` / `harden:release` scope keys implemented; `src/tools/subagent-report.test.ts` covers persistence without synthetic task IDs. |
| AC5 | acceptance_criterion | Invalid task anchors return actionable diagnostics with valid anchor guidance. | pass | `src/tools/subagent-report.test.ts` covers `INVALID_TASK_ANCHOR` diagnostics and valid anchor guidance. |
| AC6 | acceptance_criterion | Worker prompts/examples use structural `scope`; string `scope` remains compatibility-only. | pass | Task tk-ec41dd0a0d51 GREEN: `pnpm exec vitest run src/adv-engineer-assets.test.ts src/adv-designer-assets.test.ts src/adv-reviewer-asset.test.ts` passed 3 files / 144 tests. |
| AC7 | acceptance_criterion | Specs and tests cover legacy normalization, accepted task reports, invalid anchors, acceptance-review anchoring, and prompt/schema alignment. | pass | Spec law updated; `src/subagent-reports-spec-assets.test.ts` passed. Full execution verification passed `pnpm test`, `pnpm run check`, and `pnpm run build`. |
| C1 | constraint | Preserve Temporal replay safety and legacy compatibility (`rq-subagentReports09`). | respected | Temporal tests and `src/temporal/workflow-bundle-boundary.test.ts` passed in tk-60a1383e8b32 verification. |
| C2 | constraint | Preserve strict Zod validation for new payloads (`rq-subagentReports01`). | respected | Strict Zod submission tests pass in `src/types/subagent-reports.test.ts` and `src/tools/subagent-report.test.ts`. |
| C3 | constraint | Use explicit deterministic normalization; no heuristic inference of identity anchors. | respected | Normalizer uses explicit agent allowlist and deterministic default fills; scope keys are structurally validated and tested. |
| C4 | constraint | Keep scanner lanes non-persisted unless an orchestrator-submitted scanner bundle is explicitly used. | respected | Individual scanner prompts remain non-persisted; orchestrator submitted one `adv-scanner-bundle` report with change scope `scanner-bundle:review`. |
| C5 | constraint | Coordinate with `fixTaskCompletion` only where touched task/report consumers overlap; do not solve task-completion semantics here. | respected | Cross-repo audit passed: no `target_repo`, `target_path`, cancellations, or `fixTaskCompletion` semantic changes; 5 tasks done / 0 cancelled. |
| DONT1 | avoidance | Do not require manual ADV state-file edits as the normal recovery path. | respected | Automatic normalization implemented; no manual ADV state-file mutation used or required. |
| DONT2 | avoidance | Do not persist reviewer reports against fabricated task IDs. | respected | Reviewer reports use change-scoped anchors; invalid task anchors fail with diagnostics. |
| DONT3 | avoidance | Do not weaken strict validation to make malformed new reports pass. | respected | Malformed new submissions remain rejected by strict schema tests. |
| DONT4 | avoidance | Do not broaden into a rewrite of delegation architecture or the seven-gate lifecycle. | respected | Diff limited to report schemas, readback, diagnostics, prompts/contracts, specs, and tests. |
| DONT5 | avoidance | Do not silently treat string `scope` as the preferred new-report shape. | respected | Prompt asset tests enforce structural scope examples; string scope remains compatibility-only. |
| OOS1 | out_of_scope | Broad rewrite of ADV delegation or sub-agent architecture. | not_applicable | No broad ADV delegation/sub-agent architecture rewrite in diff. |
| OOS2 | out_of_scope | Task completion ownership/semantics owned by `fixTaskCompletion`. | not_applicable | No task-completion ownership/semantics changes; audit found no `fixTaskCompletion` expansion. |
| OOS3 | out_of_scope | Adding unrelated sub-agent report variants. | not_applicable | No unrelated report variants added beyond agreed reviewer change-scope/scanner-bundle support. |
| OOS4 | out_of_scope | Manual mutation of external ADV state files as the intended fix path. | not_applicable | No manual external ADV state mutation path used as intended fix. |
| OOS5 | out_of_scope | Broad scanner/handoff persistence refactor beyond clarifying current persisted vs non-persisted lanes. | not_applicable | No broad scanner/handoff persistence refactor; scanner lane clarified and bundle submitted structurally. |

