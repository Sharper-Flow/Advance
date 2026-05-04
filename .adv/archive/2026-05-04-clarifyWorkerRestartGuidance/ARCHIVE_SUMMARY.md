# Archive: Clarify worker restart guidance

**Change ID:** clarifyWorkerRestartGuidance
**Archived:** 2026-05-04T03:47:20.289Z
**Created:** 2026-05-04T02:55:28.509Z

## Tasks Completed

- ✅ Correct Temporal worker restart guidance and tests

TDD intent: inline
Delegation hint: inline_required
Touched files:
- plugin/src/tools/temporal-ops.ts
- plugin/src/tools/change.ts
- docs/temporal-recovery.md
- plugin/src/tools/temporal-ops.test.ts
- plugin/src/tools/change.test.ts

Scope:
- Update five tool-code guidance sites:
  1. plugin/src/tools/temporal-ops.ts recommendTemporalRecovery search-attribute unverified branch
  2. plugin/src/tools/temporal-ops.ts recommendTemporalRecovery worker-not-alive branch
  3. plugin/src/tools/temporal-ops.ts recommendPostRegistrationAction
  4. plugin/src/tools/temporal-ops.ts adv_temporal_worker_restart description
  5. plugin/src/tools/change.ts ARCHIVE_SEARCH_ATTRIBUTE_RECOVERY_HINT
- Update docs/temporal-recovery.md with bounded reload-path guidance.
- Update tests that assert guidance text.

Red phase:
- First update/add tests so current source fails because guidance lacks the required reload-path caveats.
- Run: pnpm test -- src/tools/temporal-ops.test.ts src/tools/change.test.ts

Green phase:
- Implement wording updates only; do not change restart runtime behavior.
- Keep short recovery hints concise for OpenCode agents; put full caveat in tool description/docs.
- Run targeted tests green.
- Run pnpm run check before checkpoint.

Scenarios:
- Given an agent reads adv_temporal_worker_restart description, when it needs reload guidance, then the description distinguishes OpenCode-loaded tool modules from Temporal worker code and names the correct reload actions.
- Given search-attribute recovery guidance recommends worker restart, when an agent follows it, then it understands worker restart does not reload plugin tool code.
- Given worker source under plugin/src/temporal changes, when guidance describes restart, then it says to run pnpm run build:worker before adv_temporal_worker_restart.
- Given issue #20 is implemented locally, when final report is emitted, then the issue is not auto-closed before landing and evidence is reported.
  > Updated Temporal worker restart guidance in temporal-ops tool descriptions/recovery hints, archive recovery hint, and temporal recovery docs. Added/updated tests to lock reload-path caveats. Verification: red targeted test failed on new assertions; green targeted test passed; pnpm run check passed after formatting. Checkpoint commit: ff09c60.

## Specs Modified


## Wisdom Accumulated

- **[gotcha]** Fresh ADV worktrees may lack gitignored `plugin/node_modules`; targeted pnpm tests can fail with `vitest: not found`. Symlinking to the main checkout's existing node_modules restored test execution without changing package deps. Also, `adv_run_test` has a 30s timeout that can reject green evidence for targeted suites that complete in ~32s; record fallback evidence with command/output when needed.
- **[failure]** adv_task_checkpoint can successfully commit while failing task-run ledger recording with `Workflow Update failed`. If default vs target_path task-run views diverge, record remediation in task error_recovery and verify git/task evidence before proceeding; this may indicate a ledger binding/tooling gap rather than implementation failure.
