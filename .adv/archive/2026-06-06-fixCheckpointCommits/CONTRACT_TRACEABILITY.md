# Contract Traceability

**Change ID:** fixCheckpointCommits
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-06-06T23:22:18.409Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Targeted checkpoint tests pass: `pnpm --dir plugin exec vitest run src/tools/checkpoint.test.ts` => 20 passed. Subjects asserted as `chore(adv)` complete/cancel. |
| SC2 | success_criterion | pass | review | Subjects use fixed `chore(adv)` prefix; no BREAKING CHANGE footer or feat/fix type introduced. Reviewer verdict READY. |
| SC3 | success_criterion | pass | review | `buildCommitMessage` body tests assert `Change`, `Task`, `Mode`, `Verification`, and cancel `Reason`; reviewer added explicit changeId fallback regression. |
| AC1 | acceptance_criterion | pass | test | `checkpoint.test.ts` complete-mode assertions expect `chore(adv): checkpoint tk-AbC123` and regex `^chore\(adv\): checkpoint tk-[A-Za-z0-9]+$`; targeted test run passed 20/20. |
| AC2 | acceptance_criterion | pass | test | `checkpoint.test.ts` cancel-mode assertions expect `chore(adv): cancel checkpoint tk-AbC123` and regex `^chore\(adv\): cancel checkpoint tk-[A-Za-z0-9]+$`; targeted test run passed 20/20. |
| AC3 | acceptance_criterion | pass | test | `buildCommitMessage` rejects invalid task IDs and overlength subjects before commit; test `rejects task IDs that would produce overlength checkpoint subjects` passed. |
| AC4 | acceptance_criterion | pass | test | Body construction pushes `Task: <task-id>` and `Mode: <mode>`; complete/cancel body tests passed. |
| AC5 | acceptance_criterion | pass | test | Reviewer fix passes `effectiveChangeId` into `buildCommitMessage`; regression `uses explicit changeId in commit body when task lookup cannot derive one` passed. |
| AC6 | acceptance_criterion | pass | test | Complete-mode test asserts `Verification: Tests passed`; targeted test run passed 20/20. |
| AC7 | acceptance_criterion | pass | test | Cancel-mode test asserts `Reason: No longer needed` in body and subject excludes reason; targeted test run passed 20/20. |
| AC8 | acceptance_criterion | pass | test | `lgrep_search_text` in worktree found 0 results for stale generated-subject strings `task(tk-` and `task({taskId}): {mode}` after docs/spec updates. |
| AC9 | acceptance_criterion | pass | test | Worktree spec parse succeeded with `SpecSchema.parse` for `.adv/specs/advance-delivery/spec.json` and 23 requirements. |
| AC10 | acceptance_criterion | pass | test | Targeted checkpoint tests passed 20/20. Reviewer-reported `bin/oc-test smoke` passed after remediation; prior execution smoke also passed. |
| C1 | constraint | respected | static_check | Checkpoint commits preserved; change only alters commit-message subject/body construction and tests/specs. |
| C2 | constraint | respected | static_check | Temporal/task completion signal behavior unchanged; review diff limited to message construction input and regression test. |
| C3 | constraint | respected | static_check | Audit metadata remains machine-readable body text: Change/Task/Mode/Verification/Reason. |
| C4 | constraint | respected | static_check | No repo-specific commit policy detection added; subject is deterministic fixed `chore(adv)` format. |
| C5 | constraint | respected | static_check | Valid ADV task IDs remain in deterministic subjects; invalid/overlength values fail before commit. |
| DONT1 | avoidance | respected | review | No audit metadata dropped; cancel reason moved to body and explicit changeId fallback fixed. |
| DONT2 | avoidance | respected | review | Generated subjects now satisfy Conventional Commit shape, avoiding manual squash/rewrite for this checkpoint-policy issue. |
| DONT3 | avoidance | respected | review | Correctness is structural via fixed formatter, validation guards, and tests; no heuristic repo-policy detection. |
| DONT4 | avoidance | respected | review | Only Advance worktree files modified; originating `sharperflow-security-gates` repo untouched. |
| DONT5 | avoidance | respected | review | Existing branch history/checkpoint commits were not rewritten; new behavior applies forward. |
| OOS1 | out_of_scope | respected | not_applicable | No task lifecycle semantics changed; signal calls remain in existing flow. |
| OOS2 | out_of_scope | respected | not_applicable | No checkpoint timing or requirement changes made; only message construction changed. |
| OOS3 | out_of_scope | respected | not_applicable | No repo-specific Conventional Commit policy integration added. |
| OOS4 | out_of_scope | respected | not_applicable | No files changed in originating repository; work confined to Advance worktree. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-17d313e1402e | AC1, AC2, AC3, AC4, AC5, AC6, AC7, SC1, SC2, SC3 | AC1, AC2, AC3, AC4, AC5, AC6, AC7 | C1, C2, C3, C4, C5, DONT1, DONT2, DONT3, DONT5, OOS1, OOS2, OOS3 |  |
| tk-35c47729db58 | AC8, AC9 | AC8, AC9 | C1, C2, C3, C4, C5, DONT1, DONT2, DONT3, DONT4, DONT5, OOS1, OOS2, OOS3, OOS4 |  |
| tk-2a1266b3a013 |  | SC1, SC2, SC3, AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC9, AC10 | C1, C2, C3, C4, C5, DONT1, DONT2, DONT3, DONT4, DONT5, OOS1, OOS2, OOS3, OOS4 |  |
