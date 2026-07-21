# Executive Summary

## Outcome

ADV's task-signal workflow-boundary validation now has explicit test coverage, and the design tradeoff between field-specific and full-partial validation is documented in code. The approver is deciding whether to ship this test-coverage-only follow-up to release.

## Why It Matters

The `addWisdomAutoSurfacing` acceptance review shipped a defense-in-depth validation pattern (`WisdomDraftSchema.array().safeParse`) at the `applyTaskUpdatedToState` and `applyTaskBlockedToState` workflow boundaries with zero test coverage. This change closes that gap and locks in the design intent so future contributors don't accidentally regress it. The design exploration also documented why the obvious generalization (full `TaskSchema.partial()` safeParse) is the wrong choice — preserving the design knowledge for the next person tempted to "improve" the validation.

## Verdict

APPROVED

## What Was Built

1. **New test file `plugin/src/temporal/change-state.task-validation.test.ts`** — 7 tests covering:
   - AC1: valid partial with valid `wisdom_drafts` passes through unchanged
   - AC2: malformed `wisdom_drafts` array drops the field; existing task state preserved
   - AC3: `TaskSchema.passthrough()` design intent documented (unknown keys preserved by design for forward/backward compat)
   - AC4: `applyTaskBlockedToState` happy path + rejection path + backward-compat (omitted field)
   - AC5: handler does not re-validate scalar fields (signal payload schema is primary validator)
2. **Design-tradeoff comment in `plugin/src/temporal/change-state.ts`** — explains why field-specific validation is the correct tradeoff vs full-partial safeParse (preserves partial-update semantics, doesn't fight TaskSchema's passthrough design).

## What Was Verified

- Verdict: APPROVED with 0 findings. Test-only change with clarifying production comment.
- Tests: 7/7 new task-validation tests pass; 148/148 existing change-state tests still pass; `pnpm run check` green.
- TDD: red phase confirmed before green phase (2 of 7 tests failed against initial generalization attempt, proving the tests can detect the wrong approach).
- Contract matrix: 16 rows (3 SC + 5 AC + 4 C + 4 DONT), 0 failing.
- Preview URL: not_applicable — pure test/code-comment change.

## Remaining Concerns

None. Test-coverage-only change; no production behavior change.

## Supporting Evidence

- Task: tk-1e02086a2f53 (done, checkpoint SHA 0b66585e).
- Tests: 7/7 task-validation (runId tr_mrv5eta0_15c078b0); 148/148 existing change-state pass.
- Red phase evidence: runId tr_mrv5butw_178a1338 (2 failures against initial generalization, confirming tests detect regressions).
- Contract review matrix: 16 rows, 0 failing.

## Consequence Context

1. **Delivered value**: Closes test coverage gap on security-relevant validation code; locks in design intent.
2. **Enabling-only/follow-up dependency**: None.
3. **Ops readiness**: Ready — standard plugin rebuild; no migrations, no config changes.
4. **Migration/data impact**: n/a — test-only change.
5. **Frontend/preview impact**: not_applicable.
6. **Collision/release risk**: Low — pure-add test file + clarifying comment; no production behavior change.
7. **Open follow-ups**: None.
8. **Next action**: Acceptance approval proceeds inline to push + merge + archive.