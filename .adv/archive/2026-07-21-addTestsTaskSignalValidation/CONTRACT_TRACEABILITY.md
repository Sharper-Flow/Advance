# Contract Traceability

**Change ID:** addTestsTaskSignalValidation
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-21T21:14:30.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | plugin/src/temporal/change-state.task-validation.test.ts (NEW) — 7 tests in two describe blocks covering both signal handlers. |
| SC2 | success_criterion | pass | review | Tests cover applyTaskUpdatedToState (AC1 happy, AC2 rejection) and applyTaskBlockedToState (AC4 happy + rejection + backward-compat). Happy-path asserts valid wisdom_drafts passes through; rejection-path asserts malformed array leaves existing task.wisdom_drafts preserved. |
| SC3 | success_criterion | pass | review | AC1-AC5 below — generalized validation was evaluated and rejected during this change; field-specific pattern preserved with documented tradeoff comment. Tests assert the actual shipped behavior, not the rejected generalization. |
| AC1 | acceptance_criterion | pass | test | plugin/src/temporal/change-state.task-validation.test.ts:40 'AC1: valid partial with valid wisdom_drafts passes through unchanged' — passes. |
| AC2 | acceptance_criterion | pass | test | plugin/src/temporal/change-state.task-validation.test.ts:71 'AC2: malformed wisdom_drafts array element drops the whole field; existing task.wisdom_drafts preserved' — passes. |
| AC3 | acceptance_criterion | pass | test | plugin/src/temporal/change-state.task-validation.test.ts:106 'AC3: TaskSchema.passthrough() preserves unknown keys' — documents actual behavior. Generalized validation was rejected during design exploration; field-specific pattern is the correct tradeoff. Test locks in the design intent. |
| AC4 | acceptance_criterion | pass | test | plugin/src/temporal/change-state.task-validation.test.ts:158 happy + 192 rejection + 219 backward-compat — 3 tests covering applyTaskBlockedToState. |
| AC5 | acceptance_criterion | pass | test | pnpm run check green (runId tr_mrv5eta0_15c078b0 era); 148/148 existing change-state tests still pass across 7 change-state.*.test.ts files. |
| C1 | constraint | respected | static_check | Production code unchanged; validation pattern preserved with documented design rationale. Tests use safeParse indirectly via the existing code path. |
| C2 | constraint | respected | static_check | Reuses WisdomDraftSchema and Task type. No new schemas introduced. |
| C3 | constraint | respected | static_check | 148/148 existing change-state tests pass; no production behavior change. |
| C4 | constraint | respected | static_check | Pure-add scope: 1 new test file + 1 clarifying design-tradeoff comment in production code. No spec-law changes needed. |
| DONT1 | avoidance | respected | review | No new signal payload fields added. |
| DONT2 | avoidance | respected | review | No changes to Task type shape. |
| DONT3 | avoidance | respected | review | Existing drop-and-continue semantics preserved; no throw introduced. |
| DONT4 | avoidance | respected | review | No other handlers migrated; applyTaskUpdatedToState and applyTaskBlockedToState are the only handlers touched (via test coverage only). |
| OOS1 | out_of_scope | missing | not_applicable |  |
| OOS2 | out_of_scope | missing | not_applicable |  |
| OOS3 | out_of_scope | missing | not_applicable |  |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-1e02086a2f53 | AC1, AC2, AC3, AC4, AC5 |  | C1, C2, C3, DONT1, DONT2, DONT3, DONT4 |  |
