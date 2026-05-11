# Archive: Structured task output as queryable metadata

**Change ID:** structuredTaskOutputAs
**Archived:** 2026-05-11T15:42:05.573Z
**Created:** 2026-05-11T05:56:36.890Z

## Tasks Completed

- ✅ Create `plugin/src/types/task-output.ts` with TaskStructuredOutputSchema, FileChangeSchema, DecisionSchema, STRUCTURED_OUTPUT_MAX_BYTES constant (10KB), and exported types. Schema uses .passthrough() to allow extra agent fields. All fields have safe defaults (empty arrays, 0 for counts).
  > Created plugin/src/types/task-output.ts with TaskStructuredOutputSchema (filesChanged, testsAdded, testsModified, decisions, followUps, .passthrough()), FileChangeSchema, DecisionSchema, STRUCTURED_OUTPUT_MAX_BYTES (10KB). 15 tests pass in task-output.test.ts.
- ✅ Add `structured_output: TaskStructuredOutputSchema.optional()` field to TaskSchema in `plugin/src/types/tasks.ts`. Add `structured_output: TaskStructuredOutputSchema.optional()` field to TaskCompletedSignalPayloadSchema in `plugin/src/types/signals.ts`. Import from ./task-output.
  > Extended TaskSchema with `structured_output: TaskStructuredOutputSchema.optional()` and TaskCompletedSignalPayloadSchema with same field. Added imports from ./task-output. Typecheck passes cleanly.
- ✅ Create `plugin/src/utils/extract-structured-output.ts` with extractStructuredOutput(text: string): TaskStructuredOutput | null. Logic: regex match last `<adv-output>...</adv-output>`, strip markdown fences, JSON.parse, size check (10KB), TaskStructuredOutputSchema.parse(). Non-blocking: on failure log warning, return null. Create `plugin/src/utils/extract-structured-output.test.ts` with 12+ test cases: no tag, valid full, partial+defaults, invalid JSON, schema fail, multiple tags (last wins), fences, oversized, tag in second field, extra fields passthrough, empty tag, whitespace-only tag.
  > Created extract-structured-output.ts with extractStructuredOutput(): regex last-match for <adv-output> tags, fence stripping, JSON parse, 10KB size check, schema validation. Non-blocking: all failures return null with warnings. 13 tests pass.
- ✅ Wire extraction into `adv_task_update` status='done' path (task.ts ~line 358): scan implementation_summary + notes, add structured_output to signal payload. Wire extraction into `adv_task_completed` (task.ts ~line 631): scan verification + summary, add structured_output to signal payload. Add tests in task.test.ts for both paths.
  > Extraction wired into adv_task_update (status='done' from impl_summary+notes) and adv_task_completed (from verification+summary). 2 tests added. Fixed LogMeta typecheck in extract-structured-output.ts.
- ✅ Wire extraction into `fireTaskCompletedFromCheckpoint` (checkpoint.ts ~line 365): scan verification text, add structured_output to signal payload. Add test in checkpoint.test.ts.
  > Extraction wired into fireTaskCompletedFromCheckpoint (from verification text). 1 test added. Clean tree (changes already committed with task 4).
- ✅ Add `if (payload.structured_output) task.structured_output = payload.structured_output;` to applyTaskCompletedToState in `plugin/src/temporal/change-state.ts` (~line 273). Add test in workflows.signal-handlers.test.ts verifying structured_output is stored on task when present in signal payload.
  > Added structured_output assignment in applyTaskCompletedToState (change-state.ts). Added 2 signal handler tests: structured_output stored when present, undefined when absent. All 6 tests pass.
- ✅ Run full verification: `pnpm test` in plugin/, `pnpm run check` (typecheck + lint + format). All existing tests must pass. All new tests must pass. No type errors.
  > Full verification complete. pnpm run check passes (typecheck+lint+format). pnpm test: 2172 passed, 1 pre-existing failure (overlay-sync-assets.test.ts, unrelated). All new tests pass. No regressions.

## Specs Modified

