# Contract Traceability

**Change ID:** addTypedOrchestrationApi
**Contract Version:** 1
**Rigor:** strict
**Reviewed:** 2026-07-16T17:54:14.167Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Independent acceptance review attempt 3: canonical PhasePlan and opt-in plan projection provide one durable-state plan source. |
| SC2 | success_criterion | pass | review | Legacy directive adapter and existing command-entry consumer tests remained green in focused verification. |
| SC3 | success_criterion | pass | review | Reviewer confirmed degraded/fail-closed plan behavior; phase-plan and migration tests passed. |
| SC4 | success_criterion | pass | review | Implementation and acceptance materials record baseline/post-change context and payload measurements; no reduction threshold claimed. |
| AC1 | acceptance_criterion | pass | test | PhasePlan focused suite: 67/67 passed in durable run tr_mrnsmz0n_462aa341. |
| AC2 | acceptance_criterion | pass | test | PhasePlan focused suite: 67/67 passed in durable run tr_mrnsmz0n_462aa341. |
| AC3 | acceptance_criterion | pass | test | PhasePlan and fail-closed migration coverage passed; reviewer verified non-authorizing degraded behavior. |
| AC4 | acceptance_criterion | pass | test | PhasePlan focused suite: 67/67 passed in durable run tr_mrnsmz0n_462aa341. |
| AC5 | acceptance_criterion | pass | test | PhasePlan focused suite: 67/67 passed in durable run tr_mrnsmz0n_462aa341. |
| AC6 | acceptance_criterion | pass | test | Parity/gate/change focused suite: 321/321 passed in durable run tr_mrnso4c2_37c7684c. |
| AC7 | acceptance_criterion | pass | test | Parity/gate/change focused suite: 321/321 passed in durable run tr_mrnso4c2_37c7684c. |
| AC8 | acceptance_criterion | pass | test | Query/message/change focused suite: 145/145 passed in durable run tr_mrnso67s_13adbf19. |
| AC9 | acceptance_criterion | pass | test | Migration and fail-closed focused suite: 92/92 passed in durable run tr_mrnsojah_6792fbbd. |
| AC10 | acceptance_criterion | pass | test | Parity/gate/change focused suite: 321/321 passed in durable run tr_mrnso4c2_37c7684c. |
| AC11 | acceptance_criterion | pass | test | Final execution evidence: full suite 378 files/5,848 tests; fresh pnpm run check passed in durable run tr_mrnsqjwp_e0b707c6. |
| C1 | constraint | respected | static_check | Reviewer found canonical plan derives from Temporal/Zod state; no competing persistence introduced. |
| C2 | constraint | respected | static_check | Plan schemas and query projection are read-only; reviewer found no mutation authority path. |
| C3 | constraint | respected | static_check | Workflow-safe derivation and worker build passed; no storage/tool/manifest imports in workflow-reachable kernel. |
| C4 | constraint | respected | static_check | Review confirmed current ADV tool opt-in projection only; no external MCP surface added. |
| C5 | constraint | respected | static_check | Migration/fail-closed suite passed 92/92; routing remains bounded to complete structural migration conditions. |
| DONT1 | avoidance | respected | review | Reviewer confirmed authority remains durable-state/gate based, not agent prose. |
| DONT2 | avoidance | respected | review | Reviewer confirmed one canonical PhasePlan derivation with legacy adapter, not a second plan state machine. |
| DONT3 | avoidance | respected | review | Review confirmed no external MCP read/compose surface. |
| DONT4 | avoidance | respected | review | Migration tests cover typed diagnostics and stop only plan-dependent consumer routing after required proof. |
| DONT5 | avoidance | respected | review | Reviewer confirmed degraded read-plan behavior is non-authorizing and does not terminate or signal workflows. |
| OOS1 | out_of_scope | not_applicable | not_applicable | Agreement scope retained existing human approvals and gate authority. |
| OOS2 | out_of_scope | not_applicable | not_applicable | No partial per-project migration was introduced. |
| OOS3 | out_of_scope | not_applicable | not_applicable | Role-scoped tools and external MCP work remain separate Epic entries. |
| OOS4 | out_of_scope | not_applicable | not_applicable | Broader Temporal Worker Versioning was not adopted. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-d1c2ea5736a9 | SC1, SC3, AC1, AC2, AC3, AC4, AC5 |  | C1, C2, C3, DONT1, DONT2 |  |
| tk-24c49be3f36b | SC1, SC2, AC3, AC6, AC8 |  | C1, C2, C3, C4, DONT3 |  |
| tk-181fde6bc5d5 | AC2, AC6, AC7, AC10 |  | C1, C3 |  |
| tk-c9beb1315936 | SC2, SC3, AC9, AC11 |  | C5, DONT4, DONT5, OOS2, OOS4 |  |
| tk-53f52731bdc9 | SC4 |  | C4, OOS3 |  |
| tk-7b0032f82437 |  | SC1, SC2, SC3, SC4, AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC9, AC10, AC11 | C1, C2, C3, C4, C5, DONT1, DONT2, DONT3, DONT4, DONT5, OOS1, OOS2, OOS3, OOS4 |  |
