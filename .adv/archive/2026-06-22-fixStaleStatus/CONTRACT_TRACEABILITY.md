# Contract Traceability

**Change ID:** fixStaleStatus
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-06-22T15:59:54.957Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | `bun test bin/` passed 107 tests; CLI query in `bin/lib/live-status.ts` includes `ExecutionStatus = "Running"`; shared `buildVisibilityQuery` active paths include same guard. |
| AC2 | acceptance_criterion | pass | test | `bin/lib/live-status.test.ts` regression excludes completed workflow with stale `AdvChangeStatus="active"`; `list-change-workflows.test.ts` asserts active queries include `ExecutionStatus = "Running"`. |
| AC3 | acceptance_criterion | pass | test | RED/GREEN tests added for stale completed workflow exclusion and shared active visibility query guard; targeted and bin suites pass. |
| AC4 | acceptance_criterion | pass | test | No cache added to CLI active rows; `loadLiveSummaries` still creates Temporal client and executes `summariesFromVisibility` per call. Active rows remain live Visibility-backed. |
| C1 | constraint | respected | static_check | Diff touches existing TypeScript/test files only; no package or lockfile changes. |
| C2 | constraint | respected | static_check | Active rows still come from Temporal Visibility queries; disk reads remain terminal counts/archive modes only. |
| C3 | constraint | respected | static_check | .opencode/command/adv-status.md unchanged and remains `adv status --no-color` bridge. |
| OOS1 | out_of_scope | respected | not_applicable | No changes to `plugin/src/tools/status.ts` response shape. |
| OOS2 | out_of_scope | respected | not_applicable | Archive workflow semantics unchanged; only status Visibility filters/tests changed. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-cd0ab3e0f8c9 | AC1, AC2, AC3, C1, C2, C3 | AC1, AC2, AC3, AC4 | C1, C2, C3, OOS1, OOS2 |  |
| tk-ac9c574356ac | AC1, AC2, AC3, C1, C2, C3 | AC1, AC2, AC3 | C1, C2, C3, OOS1, OOS2 |  |
