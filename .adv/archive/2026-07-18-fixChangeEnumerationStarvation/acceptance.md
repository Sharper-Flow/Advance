# Acceptance

Reviewed at: 2026-07-18T18:17:14.224Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | Archive proceeds when all active conflict authority is complete and no conflict exists. | pass | Acceptance review READY; active-only authority inspected. |
| SC2 | success_criterion | Terminal history remains usable with large archive volume and poisoned active workflows. | pass | Acceptance review verified bounded terminal history and benchmark. |
| SC3 | success_criterion | Incomplete non-authoritative history is visible as partial with a warning, never misrepresented as complete. | pass | Acceptance review verified typed partial warnings. |
| SC4 | success_criterion | Existing terminal bundles remain readable. | pass | Acceptance review verified summary compatibility. |
| AC1 | acceptance_criterion | Given archive validation, when active conflict authority is complete, then terminal-history latency cannot block a clean no-conflict result. | pass | tr_mrqo85cv_36f02103 passed. |
| AC2 | acceptance_criterion | Given incomplete active authority, when archive validation runs, then it remains fail-closed. | pass | Fail-closed authority tests passed. |
| AC3 | acceptance_criterion | Given large terminal history and poisoned active workflows, when bounded enumeration runs, then active authority completes within the archive validation bound. | pass | 50x50 benchmark matrix passed. |
| AC4 | acceptance_criterion | Given a terminal record lacks a valid lightweight representation, when history is read, then legacy data is used or typed degradation is returned. | pass | Summary fallback/typed omission tests passed. |
| AC5 | acceptance_criterion | Given a non-authoritative history view exceeds its larger fixed budget, when it returns, then available rows and explicit partial-result warning are returned. | pass | History deadline degradation tests passed. |
| AC6 | acceptance_criterion | Given existing archive/list consumers, when the projection changes, then terminal visibility and canonical-ID deduplication remain compatible. | pass | Bundle compatibility/dedup tests passed. |
| AC7 | acceptance_criterion | Given cache state differs, when correctness is evaluated, then cache data cannot independently establish conflict completeness. | pass | Cache-independent authority tests passed. |
| C1 | constraint | Archive conflict authority remains structural and fail-closed. | respected | Typed fail-closed authority path inspected. |
| C2 | constraint | Archive validation retains its fixed 8-second aggregate bound. | respected | 8-second active authority deadline inspected. |
| C3 | constraint | Non-authoritative history views use a larger fixed bound and explicit partial-result warning. | respected | 20-second terminal-history deadline inspected. |
| C4 | constraint | Existing terminal bundles remain durable, readable compatibility sources. | respected | Legacy bundle compatibility path inspected. |
| C5 | constraint | No new dependency is introduced. | respected | pnpm run check passed; no dependencies added. |
| DONT1 | avoidance | Do not treat incomplete inventory as clean. | respected | Reviewer confirmed incomplete authority cannot conclude clean. |
| DONT2 | avoidance | Do not use cache, heuristic, title, or partial result as conflict authority. | respected | Reviewer confirmed history/cache are not authority. |
| DONT3 | avoidance | Do not introduce unbounded reads, polling, or replay dependencies. | respected | Fixed bounds and no polling verified. |
| DONT4 | avoidance | Do not mass-purge archives or terminate workflows as this fix. | respected | No purge or workflow termination included. |
| OOS1 | out_of_scope | Unrelated poisoned-workflow recovery semantics. | not_applicable | Unrelated recovery semantics unchanged. |
| OOS2 | out_of_scope | Changes to proportionate-evidence behavior. | not_applicable | Proportionate-evidence behavior unchanged. |
| OOS3 | out_of_scope | Consumer-repository implementation. | not_applicable | Consumer repository unchanged. |

