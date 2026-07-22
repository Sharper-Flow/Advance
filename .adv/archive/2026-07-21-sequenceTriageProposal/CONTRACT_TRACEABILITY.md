# Contract Traceability

**Change ID:** sequenceTriageProposal
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-21T12:50:00.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | adv-problem.md, adv-proposal.md, adv-task.md updated. |
| SC2 | success_criterion | pass | review | Bypass rationale template in adv-proposal.md. |
| SC3 | success_criterion | pass | review | No changes to /adv-idea, /adv-epic. |
| SC4 | success_criterion | pass | review | adv-task.md Phase 1 guard. |
| AC1 | acceptance_criterion | pass | test | adv-problem-assets.test.ts. |
| AC2 | acceptance_criterion | pass | test | adv-task-assets.test.ts. |
| AC3 | acceptance_criterion | pass | test | adv-instructions-assets.test.ts. |
| AC4 | acceptance_criterion | pass | test | adv-problem.md Output bullet. |
| AC5 | acceptance_criterion | pass | test | ADV_INSTRUCTIONS.md HITL extended. |
| AC6 | acceptance_criterion | pass | test | Spec delta recorded. |
| AC7 | acceptance_criterion | pass | test | manifest.test.ts regex. |
| AC8 | acceptance_criterion | pass | test | 8 new regex tests. |
| AC9 | acceptance_criterion | pass | test | pnpm run check exit 0. |
| C1 | constraint | respected | static_check | No runtime hard-block. |
| C2 | constraint | respected | static_check | manifest.ts doc-comment only. |
| C3 | constraint | respected | static_check | No Zod schema edits. |
| C4 | constraint | respected | static_check | No provider hints modified. |
| C5 | constraint | respected | static_check | No /adv-idea or /adv-epic changes. |
| C6 | constraint | respected | static_check | rq-defectOriginRca01 alongside existing. |
| DONT1 | avoidance | respected | review | No runtime hard-block. |
| DONT2 | avoidance | respected | review | Provider hints unchanged. |
| DONT3 | avoidance | respected | review | No schema tightening. |
| DONT4 | avoidance | respected | review | Defect-origin scope only. |
| DONT5 | avoidance | respected | review | No workflow chain regressions. |
| DONT6 | avoidance | respected | review | No tool-registry edits. |
| OOS1 | out_of_scope | missing | not_applicable |  |
| OOS2 | out_of_scope | missing | not_applicable |  |
| OOS3 | out_of_scope | missing | not_applicable |  |
| OOS4 | out_of_scope | missing | not_applicable |  |
| OOS5 | out_of_scope | missing | not_applicable |  |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-aa07da436cf5 | AC6 |  | C6 |  |
| tk-def2ae080007 |  | AC9, AC7 |  |  |
| tk-15e3a2a5f103 | AC3, AC5 |  | C1, C5 |  |
| tk-f223b7f5afe0 | AC8 | AC8 | C6 |  |
| tk-748ccc3d60a5 | AC1, AC2, AC4 | SC1, SC4 | C1, DONT1, DONT4 |  |
| tk-60eaa596c95f | AC7 |  | C2 |  |
