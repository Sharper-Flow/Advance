# Contract Traceability

**Change ID:** retireAgendaWorkflow
**Contract Version:** 1
**Rigor:** strict
**Reviewed:** 2026-07-14T01:59:37.236Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Agenda retirement suite and review confirm typed task/fast-follow/ops ownership; no generic queue remains. |
| SC2 | success_criterion | pass | review | ConflictInventory implementation and 11 focused tests distinguish complete, degraded, and blocked results. |
| SC3 | success_criterion | pass | review | Store cleanup tests cover local-store inventory, manifest-before-delete, retained failure, and idempotent retry. |
| SC4 | success_criterion | pass | review | Epic lineage projection tests cover bounded advisory fast-follow context without task/release authority. |
| AC1 | acceptance_criterion | pass | test | agenda-retirement.test.ts passed; final tool/asset removal verified in full suite. |
| AC2 | acceptance_criterion | pass | test | report-followup tests cover typed owner routing before planning and fast-follow children after planning. |
| AC3 | acceptance_criterion | pass | test | report-followup tests cover source-attributed metadata and explicit promotion targets without Agenda writes. |
| AC4 | acceptance_criterion | pass | test | snapshot repair audit and subagent-report tests preserve typed design concern/audit behavior without Agenda. |
| AC5 | acceptance_criterion | pass | test | conflict-inventory tests cover paginated typed change/Epic context and degraded/blocked no-clean-result behavior. |
| AC6 | acceptance_criterion | pass | test | Epic focused suite covers source task/child/advisory lineage and absence of task/release effects. |
| AC7 | acceptance_criterion | pass | test | store-cleanup tests cover dry run, approval/hash gating, manifest, locks, failure retention, and retry. |
| AC8 | acceptance_criterion | pass | test | Legacy report/change source compatibility tests pass while new Agenda mutation paths are absent. |
| AC9 | acceptance_criterion | pass | test | Post-review verification: pnpm run check, bin/oc-test full (341 files/5086 tests), and pnpm run build all passed. |
| C1 | constraint | respected | static_check | Fast-follow tests and gate-readiness review confirm only ops blocks affects release. |
| C2 | constraint | respected | static_check | Report follow-up schema/promotion path retains ordinary suggestions in source report until explicit promotion. |
| C3 | constraint | respected | static_check | Cleanup store discovery and retained unsafe-store tests enforce local-root and retry behavior. |
| C4 | constraint | respected | static_check | Cleanup tests prove dry-run, explicit approval/hash, and manifest-before-delete ordering. |
| C5 | constraint | respected | static_check | Cleanup reuses existing approval/session boundary; no auth or identity schema introduced. |
| C6 | constraint | respected | static_check | ConflictInventory uses typed entries/completeness/source, not heuristic task/Epic matching. |
| C7 | constraint | respected | static_check | Epic lineage is additive advisory projection; no ordering/task ownership mutation. |
| DONT1 | avoidance | respected | review | Review confirms Agenda removed rather than replaced with a generic queue. |
| DONT2 | avoidance | respected | review | Cleanup deletes after manifest; no legacy row promotion/migration path added. |
| DONT3 | avoidance | respected | review | Conflict scan emits degraded/blocked state for warnings/omissions. |
| DONT4 | avoidance | respected | review | Reviewer confirmed no Epic task ownership, dependency enum, or generic child release rule. |
| DONT5 | avoidance | respected | review | Reviewer remediation fixed manifest-before-delete and focused/full verification passed. |
| DONT6 | avoidance | respected | review | Design concern disposition and ops blocks semantics retained; review READY. |
| OOS1 | out_of_scope | not_applicable | not_applicable | GitHub Project and ROADMAP intake were not changed. |
| OOS2 | out_of_scope | not_applicable | not_applicable | Repo backlog remains separate; no Agenda migration added. |
| OOS3 | out_of_scope | not_applicable | not_applicable | No board, assignment, sprint, or generic task queue added. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-af84f6493331 | AC2, AC3, AC8, SC1 |  | C1, C2, C5, C6, DONT1, DONT6 |  |
| tk-b3640b891394 | AC5, SC2 |  | C6, DONT3, DONT6 |  |
| tk-dfa9f0d9a814 | AC6, SC4 |  | C1, C7, DONT4, DONT6 |  |
| tk-c47cd01aa7e1 | AC7, SC3 |  | C3, C4, DONT2, DONT5 |  |
| tk-9cd734f688db | AC4, AC1, SC1 |  | C4, DONT1, DONT6 |  |
| tk-bd2ca3857e09 | AC1, AC4, AC8, SC1 |  | C5, DONT1, DONT2, DONT5, DONT6 |  |
| tk-e4030c36dd42 |  | AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC9, SC1, SC2, SC3, SC4 | C1, C2, C3, C4, C5, C6, C7, DONT1, DONT2, DONT3, DONT4, DONT5, DONT6 |  |
