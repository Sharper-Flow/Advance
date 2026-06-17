# Executive Summary: Harden TDD Proof Evidence

## Outcome

This change closes the structural gap between ADV's TDD policy (red-before-green as floor) and its enforcement mechanism (which was advisory-only). Three enforcement components now work together at the task-completion seam:

1. **Ordering enforcement (rq-TDD009seq):** Every `adv_run_test` call now persists a `TestRunRecord` to the change workflow state via `testRunRecordedSignal`. When an inline TDD task is completed with `lastGreenRunId`, the workflow verifies that a matching red run (exitCode≠0) precedes the green run (exitCode=0). Violations throw `TASK_ORDERING_VIOLATION` and are surfaced through checkpoint rejection messages.

2. **Advisory quality signals (rq-TDD010qual):** A static parser (`test-quality.ts`) computes `assertionDensity`, `mockSurface`, and `behaviorSurface` from the test file referenced by the command. These are advisory — surfaced to `/adv-review` for human attention, never gate task completion. Mock detection uses API-qualified patterns only (12 patterns across Vitest, Jest, Sinon, Python) to avoid false positives.

3. **Phase contract drift resolved:** The pre-existing HIGH-severity finding in `docs/adv-run-test-prep.md` (schema/spec/docs mismatch on `phase` field) is now resolved. `phase` remains descriptive, but the red→green *sequence* is structurally enforced.

## Backward Compatibility

Legacy tasks without `lastGreenRunId` are grandfathered — the ordering check only fires when the agent explicitly provides evidence refs. This enables a clean cutover: agents that know about the new fields get structural enforcement; agents that don't are unaffected.

## Verification

3755 tests pass across 271 files. `pnpm run check` clean. Bundle boundary preserved (no `tools/` imports from workflow bundle). All 10 acceptance criteria covered by tests.
