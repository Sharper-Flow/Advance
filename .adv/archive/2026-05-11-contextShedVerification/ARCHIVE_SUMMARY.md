# Archive: Context-shed verification evidence for noisy ADV operations

**Change ID:** contextShedVerification
**Archived:** 2026-05-11T15:54:26.926Z
**Created:** 2026-05-11T05:58:49.210Z

## Tasks Completed

- ✅ Implement smart truncation in `adv_run_test` with inline TDD: first add failing unit tests in `plugin/src/tools/test.test.ts` proving (a) late failure lines survive noisy failing output, (b) late summary lines survive noisy passing output, (c) output remains bounded near 2000 chars, and (d) `[adv_run_test]` diagnostic prefixes survive truncation. Then add exported pure helper `shapeCommandOutput` in `plugin/src/tools/test.ts`, replace head-only truncation with the helper, preserve exact `... (truncated)` suffix, preserve API/return shape/exitCode semantics, and run focused tests plus repo check.
  > Task checkpoint completed

## Specs Modified

