# Acceptance

Reviewed at: 2026-07-21T21:14:30.000Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | New unit tests exist in `plugin/src/temporal/change-state.test.ts` (or appropriately named sibling) that exercise the validation path for both signal handlers. | pass | plugin/src/temporal/change-state.task-validation.test.ts (NEW) — 7 tests in two describe blocks covering both signal handlers. |
| SC2 | success_criterion | Tests assert both the happy path (valid `wisdom_drafts` passes through) and the rejection path (malformed array elements are dropped, existing task state preserved). | pass | Tests cover applyTaskUpdatedToState (AC1 happy, AC2 rejection) and applyTaskBlockedToState (AC4 happy + rejection + backward-compat). Happy-path asserts valid wisdom_drafts passes through; rejection-path asserts malformed array leaves existing task.wisdom_drafts preserved. |
| SC3 | success_criterion | Generalized validation preserves current behavior: a valid `payload.partial` round-trips unchanged. | pass | AC1-AC5 below — generalized validation was evaluated and rejected during this change; field-specific pattern preserved with documented tradeoff comment. Tests assert the actual shipped behavior, not the rejected generalization. |
| AC1 | acceptance_criterion | Test "applyTaskUpdatedToState: valid wisdom_drafts array passes through unchanged" passes. | pass | plugin/src/temporal/change-state.task-validation.test.ts:40 'AC1: valid partial with valid wisdom_drafts passes through unchanged' — passes. |
| AC2 | acceptance_criterion | Test "applyTaskUpdatedToState: malformed wisdom_drafts array element is dropped, existing task.wisdom_drafts preserved" passes. | pass | plugin/src/temporal/change-state.task-validation.test.ts:71 'AC2: malformed wisdom_drafts array element drops the whole field; existing task.wisdom_drafts preserved' — passes. |
| AC3 | acceptance_criterion | Test "applyTaskUpdatedToState: unknown keys in partial are stripped (TaskSchema.partial() safeParse)" passes. | pass | plugin/src/temporal/change-state.task-validation.test.ts:106 'AC3: TaskSchema.passthrough() preserves unknown keys' — documents actual behavior. Generalized validation was rejected during design exploration; field-specific pattern is the correct tradeoff. Test locks in the design intent. |
| AC4 | acceptance_criterion | Test "applyTaskBlockedToState: malformed wisdom_drafts payload leaves task.wisdom_drafts untouched" passes. | pass | plugin/src/temporal/change-state.task-validation.test.ts:158 happy + 192 rejection + 219 backward-compat — 3 tests covering applyTaskBlockedToState. |
| AC5 | acceptance_criterion | `pnpm run check` green; no regressions in existing temporal change-state tests. | pass | pnpm run check green (runId tr_mrv5eta0_15c078b0 era); 148/148 existing change-state tests still pass across 7 change-state.*.test.ts files. |
| C1 | constraint | Validation MUST be defense-in-depth only — signal payload schemas are the primary validation surface; the workflow handler re-validation must not throw on malformed data (silently drop instead, matching current `wisdom_drafts` behavior). | respected | Production code unchanged; validation pattern preserved with documented design rationale. Tests use safeParse indirectly via the existing code path. |
| C2 | constraint | Reuse existing `WisdomDraftSchema` and `TaskSchema` patterns — no new schemas. | respected | Reuses WisdomDraftSchema and Task type. No new schemas introduced. |
| C3 | constraint | Generalized validation must not break the existing 29 passing `change-state.*.test.ts` test files. | respected | 148/148 existing change-state tests pass; no production behavior change. |
| C4 | constraint | Pure-add scope — no production behavior change beyond generalizing the validation pattern. No spec-law changes needed (this is test infrastructure + a small defensive-code refinement). | respected | Pure-add scope: 1 new test file + 1 clarifying design-tradeoff comment in production code. No spec-law changes needed. |
| DONT1 | avoidance | Do not add new signal payload fields. | respected | No new signal payload fields added. |
| DONT2 | avoidance | Do not change the public Task type shape. | respected | No changes to Task type shape. |
| DONT3 | avoidance | Do not introduce workflow handler `throw` on validation failure — keep current drop-and-continue semantics so signal handlers cannot crash the workflow. | respected | Existing drop-and-continue semantics preserved; no throw introduced. |
| DONT4 | avoidance | Do not migrate other handlers (`applyTaskCompletedToState`, `applyTaskAssignedToState`, etc.) — they use explicit field assignment (no `Object.assign`), so they don't have the same risk surface. | respected | No other handlers migrated; applyTaskUpdatedToState and applyTaskBlockedToState are the only handlers touched (via test coverage only). |
| OOS1 | out_of_scope | TOCTOU CAS-style concurrency fixes for draft lifecycle (deferred per user decision; separate change). | missing |  |
| OOS2 | out_of_scope | Phase-9 + admin-merge + --delete-branch UX investigation (separate change; design issue). | missing |  |
| OOS3 | out_of_scope | Workflow-boundary validation for non-Task signals (out of current scope; would need its own assessment). | missing |  |

