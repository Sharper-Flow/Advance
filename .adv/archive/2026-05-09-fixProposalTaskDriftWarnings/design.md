# Design

## Implementation Plan

1. Locate proposal-section parsing and `PROPOSAL_TASK_DRIFT` emission logic.
2. Add failing regression coverage for narrative sections (`Intent`, `Problem`, explanatory prose) not emitting drift.
3. Add/keep regression coverage for explicit task-bearing sections still emitting drift when unmatched.
4. Implement structural section classification for drift checks.
5. Run focused validator tests and plugin check.

## Planned Tasks

1. Add failing regression tests for narrative proposal sections not emitting `PROPOSAL_TASK_DRIFT` and explicit task-bearing sections still detecting drift.
2. Implement structural task-bearing section detection for proposal drift validation.
3. Run focused validator tests and plugin check; document verification evidence.

## Contracts

- Narrative sections do not cause task drift warnings.
- Explicit task/scope sections remain checked.
- Drift detection remains deterministic and test-covered.

## Test Strategy

- Red tests for false-positive narrative sections.
- Regression test for real drift.
- Focused validator tests, then `pnpm run check` from `plugin/`.