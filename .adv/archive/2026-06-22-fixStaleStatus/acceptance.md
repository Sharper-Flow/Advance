# Acceptance

Reviewed at: 2026-06-22T15:59:54.957Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| AC1 | acceptance_criterion | Running `/adv-status` and `adv_status view:"changes"` for the same project within the same session returns the same active changes and active count. | pass | `bun test bin/` passed 107 tests; CLI query in `bin/lib/live-status.ts` includes `ExecutionStatus = "Running"`; shared `buildVisibilityQuery` active paths include same guard. |
| AC2 | acceptance_criterion | Archived changes are excluded from the active table. | pass | `bin/lib/live-status.test.ts` regression excludes completed workflow with stale `AdvChangeStatus="active"`; `list-change-workflows.test.ts` asserts active queries include `ExecutionStatus = "Running"`. |
| AC3 | acceptance_criterion | Regression test covers a completed/archived workflow with stale active `AdvChangeStatus` / non-done gate attributes and proves it is excluded. | pass | RED/GREEN tests added for stale completed workflow exclusion and shared active visibility query guard; targeted and bin suites pass. |
| AC4 | acceptance_criterion | If status output uses a cache, freshness/cached-at is surfaced or invalidated after archive; if no cache backs CLI active rows, test/rationale states so. | pass | No cache added to CLI active rows; `loadLiveSummaries` still creates Temporal client and executes `summariesFromVisibility` per call. Active rows remain live Visibility-backed. |
| C1 | constraint | No new dependency. | respected | Diff touches existing TypeScript/test files only; no package or lockfile changes. |
| C2 | constraint | No disk fallback as source for active rows. | respected | Active rows still come from Temporal Visibility queries; disk reads remain terminal counts/archive modes only. |
| C3 | constraint | Default `/adv-status` remains thin CLI bridge over `adv status --no-color`. | respected | .opencode/command/adv-status.md unchanged and remains `adv status --no-color` bridge. |
| OOS1 | out_of_scope | Reworking MCP `adv_status` response shape. | respected | No changes to `plugin/src/tools/status.ts` response shape. |
| OOS2 | out_of_scope | Changing archive workflow semantics beyond status visibility filtering. | respected | Archive workflow semantics unchanged; only status Visibility filters/tests changed. |

