# Archive: Fix adv_change_validate warnings-only strict-mode result

**Change ID:** fixAdvChangeValidateWarnings
**Archived:** 2026-05-09T21:31:43.030Z
**Created:** 2026-05-09T02:45:20.254Z

## Tasks Completed

- ✅ Add failing regression tests for adv_change_validate strict-mode warning aggregation and strictWarnings opt-in behavior.
  > Added focused adv_change_validate regression coverage for warnings-only strict mode, strictWarnings opt-in warning escalation, errors-present failure, and clean validation pass. Implemented strictWarnings argument and changed strict-mode aggregation to fail only on errors unless warning escalation is explicitly requested. Focused green test passed: pnpm vitest run src/tools/change.test.ts --reporter=verbose. Checkpoint commit de8d89d9bfdbf25b20563120d9d9fe02894d908f.
- ✅ Implement strictWarnings schema/aggregation changes so default strict mode passes warnings-only and errors remain blocking.
  > Implemented strictWarnings schema/aggregation in adv_change_validate. strict:true now means strict checks run but pass/fail blocks on errors only by default; strictWarnings:true explicitly escalates warnings to blocking failures. Removed prior hardcoded archive-safe warning allowlist. Focused verification passed: pnpm vitest run src/tools/change.test.ts --reporter=verbose. No new commit needed; implementation included in checkpoint de8d89d9bfdbf25b20563120d9d9fe02894d908f.
- ✅ Run focused validation/tool tests and plugin check; document behavior and any live-session rebuild caveat.
  > Ran final verification for adv_change_validate strict warning semantics. First pnpm run check failed only Prettier format on src/tools/change.test.ts; formatted src/tools/change.test.ts and src/tools/change.ts, then pnpm run check passed. Focused validation test passed after formatting: pnpm vitest run src/tools/change.test.ts --reporter=verbose. Live OpenCode tool behavior requires pnpm run build + session restart because plugin dist is cached at session startup. Checkpoint commit 5e4aae528958e028f24f0bc97018c0c3e1c43dfb.

## Specs Modified


## Wisdom Accumulated

- **[gotcha]** adv_change_validate focused tests using createMockStore need proposal drift controlled. Missing proposal.md falls back to scaffold with Intent/Scope headers, causing PROPOSAL_TASK_DRIFT warnings unless task titles include those keywords or proposal loading is explicitly mocked/avoided. Also completed logic tasks need verification/tdd_evidence or MISSING_TDD_EVIDENCE errors fire.
- **[convention]** When changing ADV tool source behavior, unit/source tests can prove implementation in-session, but live adv_* tool invocations still use cached plugin/dist from session startup. Final notes should state pnpm run build + OpenCode restart needed before live tool behavior reflects source changes.
