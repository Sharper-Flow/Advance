# Contract Traceability

**Change ID:** consolidateAdvToolSurface2
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-15T15:45:07.948Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | ADV_PUBLIC_TOOL_BASELINE_COUNT=80; retained canonical list is 78; inventory test asserts exact removal accounting. |
| SC2 | success_criterion | pass | review | Typed PUBLIC_TOOL_GROUPS derives names and warrant surface; parity tests cover runtime, degraded map, args, and titles. |
| SC3 | success_criterion | pass | review | Exhaustive code-owned role policy and exact manifest tests passed. |
| SC4 | success_criterion | pass | review | Five-name tombstone/reference checks and repo-wide cleanup passed. |
| AC1 | acceptance_criterion | pass | test | Roadmap tests cover file/live behavior, <=100 batching, TTL freshness, and typed annotations_unavailable without fallback. |
| AC2 | acceptance_criterion | pass | test | Tombstone, registry, preflight, title, docs/spec, and asset checks prove adv_backlog_state removed. |
| AC3 | acceptance_criterion | pass | test | Wisdom tests prove project_only/maxEntries branch, filtering-before-limit, and specialized-tool removal. |
| AC4 | acceptance_criterion | pass | test | Latent-tool removal test verifies three definitions absent from groups, canonical names, and warrant surface. |
| AC5 | acceptance_criterion | pass | test | Inventory parity suite verifies exact retained registration, degraded, warrant args, title, and canonical-name surfaces. |
| AC6 | acceptance_criterion | pass | test | Role-policy suite verifies exact manifests, default-deny order, and policy/document parity. |
| AC7 | acceptance_criterion | pass | test | Review found no merged safety paths; policy preserves operator-only and action-level dual boundaries. |
| AC8 | acceptance_criterion | pass | test | Targeted 24-file/426-test, full 359-file/5370-test, and plugin pnpm run check passed; replacement docs and release notes added. |
| C1 | constraint | respected | static_check | adv_roadmap retained; no adv_backlog introduced. |
| C2 | constraint | respected | static_check | Roadmap annotation path batches issue numbers at <=100. |
| C3 | constraint | respected | static_check | CLI remains thin; annotation degradation is explicit MCP output. |
| C4 | constraint | respected | static_check | Removed names absent; tombstone tests reject aliases/active residues. |
| C5 | constraint | respected | static_check | Typed inventory, exact parity tests, preflight, and policy maps enforce tool-surface correctness. |
| C6 | constraint | respected | static_check | Default-deny wildcard precedes grants; operator-only tools restricted to orchestrator policy. |
| C7 | constraint | respected | static_check | Roadmap source modes and wisdom aggregate/change semantics retained; project-only branch is explicit. |
| DONT1 | avoidance | respected | review | Explicit createToolMap retained; no universal action router introduced. |
| DONT2 | avoidance | respected | review | All five removals are destructive; no wrappers or aliases. |
| DONT3 | avoidance | respected | review | Review verified archive/task/Temporal/store/cross-project operations remain separate. |
| DONT4 | avoidance | respected | review | Latent definitions and owned helpers/tests removed; retained workflow behavior preserved. |
| DONT5 | avoidance | respected | review | Discovery recorded Temporal inventory degradation; no false clean conflict claim. |
| OOS1 | out_of_scope | not_applicable | not_applicable | No Agenda authority reintroduced. |
| OOS2 | out_of_scope | not_applicable | not_applicable | No new adv_backlog tool. |
| OOS3 | out_of_scope | not_applicable | not_applicable | Backlog model retained; only state-reader behavior folded into roadmap. |
| OOS4 | out_of_scope | not_applicable | not_applicable | No unrelated retained-tool response shapes changed. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-9b61859aa2ba | SC1, SC2, AC5, C5 |  | C4, DONT1, DONT2 |  |
| tk-f022bfadbd81 | SC1, AC1, AC2 | C2, C3 | C1, C4, C7, DONT2, OOS2, OOS3 |  |
| tk-11d902254d63 | SC4, AC3 | AC3 | C4, C7, DONT2 |  |
| tk-abace490e402 | SC4, AC4 | AC4 | C4, DONT2, DONT4 |  |
| tk-40b1d4f120ea | SC2, SC3, AC5, AC6 | AC6, AC7 | C6, DONT3 |  |
| tk-4f695173ced8 | SC4, AC2, AC3, AC4, AC8 | AC8 | C4, DONT2, DONT4, DONT5 |  |
| tk-f72aae2550cd |  | SC1, SC2, SC3, SC4, AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8 | C1, C2, C3, C4, C5, C6, C7, DONT1, DONT2, DONT3, DONT4, DONT5, OOS1, OOS2, OOS3, OOS4 |  |
