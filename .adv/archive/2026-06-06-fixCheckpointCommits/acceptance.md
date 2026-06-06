# Acceptance

Reviewed at: 2026-06-06T23:22:18.409Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | ADV-generated checkpoint commits pass standard Conventional Commit header checks without repo-specific exceptions. | pass | Targeted checkpoint tests pass: `pnpm --dir plugin exec vitest run src/tools/checkpoint.test.ts` => 20 passed. Subjects asserted as `chore(adv)` complete/cancel. |
| SC2 | success_criterion | Checkpoint commits remain release-neutral by default: `chore(adv)` subject, no semver bump intent. | pass | Subjects use fixed `chore(adv)` prefix; no BREAKING CHANGE footer or feat/fix type introduced. Reviewer verdict READY. |
| SC3 | success_criterion | Audit trace remains visible in commit body: change ID when available, task ID, mode, verification, and cancel reason when present. | pass | `buildCommitMessage` body tests assert `Change`, `Task`, `Mode`, `Verification`, and cancel `Reason`; reviewer added explicit changeId fallback regression. |
| AC1 | acceptance_criterion | Complete checkpoint dirty-tree commit subject matches `^chore\(adv\): checkpoint tk-[A-Za-z0-9]+$`. | pass | `checkpoint.test.ts` complete-mode assertions expect `chore(adv): checkpoint tk-AbC123` and regex `^chore\(adv\): checkpoint tk-[A-Za-z0-9]+$`; targeted test run passed 20/20. |
| AC2 | acceptance_criterion | Cancel checkpoint dirty-tree commit subject matches `^chore\(adv\): cancel checkpoint tk-[A-Za-z0-9]+$`. | pass | `checkpoint.test.ts` cancel-mode assertions expect `chore(adv): cancel checkpoint tk-AbC123` and regex `^chore\(adv\): cancel checkpoint tk-[A-Za-z0-9]+$`; targeted test run passed 20/20. |
| AC3 | acceptance_criterion | Complete and cancel checkpoint subjects are ≤72 chars for valid ADV task IDs, or invalid/overlength input fails deterministically before malformed commit output. | pass | `buildCommitMessage` rejects invalid task IDs and overlength subjects before commit; test `rejects task IDs that would produce overlength checkpoint subjects` passed. |
| AC4 | acceptance_criterion | Commit body includes `Task: <task-id>` and `Mode: complete|cancel`. | pass | Body construction pushes `Task: <task-id>` and `Mode: <mode>`; complete/cancel body tests passed. |
| AC5 | acceptance_criterion | Commit body includes `Change: <change-id>` when available. | pass | Reviewer fix passes `effectiveChangeId` into `buildCommitMessage`; regression `uses explicit changeId in commit body when task lookup cannot derive one` passed. |
| AC6 | acceptance_criterion | Commit body includes `Verification: <summary>` when verification supplied. | pass | Complete-mode test asserts `Verification: Tests passed`; targeted test run passed 20/20. |
| AC7 | acceptance_criterion | Cancel commit body includes `Reason: <reason>` when reason supplied; cancel reason is not embedded in subject. | pass | Cancel-mode test asserts `Reason: No longer needed` in body and subject excludes reason; targeted test run passed 20/20. |
| AC8 | acceptance_criterion | ADV checkpoint docs/specs no longer require or cite `task(tk-xxxx): ...` generated subjects. | pass | `lgrep_search_text` in worktree found 0 results for stale generated-subject strings `task(tk-` and `task({taskId}): {mode}` after docs/spec updates. |
| AC9 | acceptance_criterion | If `advance-delivery` spec parse drift blocks spec update, malformed metadata is repaired only enough to make `adv_spec show advance-delivery` parse. | pass | Worktree spec parse succeeded with `SpecSchema.parse` for `.adv/specs/advance-delivery/spec.json` and 23 requirements. |
| AC10 | acceptance_criterion | Targeted checkpoint tests pass, and repo smoke/check path reports success. | pass | Targeted checkpoint tests passed 20/20. Reviewer-reported `bin/oc-test smoke` passed after remediation; prior execution smoke also passed. |
| C1 | constraint | Preserve checkpoint commits; do not remove or bypass checkpointing. | respected | Checkpoint commits preserved; change only alters commit-message subject/body construction and tests/specs. |
| C2 | constraint | Preserve task completion/cancellation semantics and Temporal signal behavior. | respected | Temporal/task completion signal behavior unchanged; review diff limited to message construction input and regression test. |
| C3 | constraint | Keep audit metadata machine-readable in commit body text. | respected | Audit metadata remains machine-readable body text: Change/Task/Mode/Verification/Reason. |
| C4 | constraint | Avoid repo-specific commit-policy detection or allowlist heuristics. | respected | No repo-specific commit policy detection added; subject is deterministic fixed `chore(adv)` format. |
| C5 | constraint | Keep generated subject deterministic for valid ADV task IDs. | respected | Valid ADV task IDs remain in deterministic subjects; invalid/overlength values fail before commit. |
| DONT1 | avoidance | Do not drop checkpoint audit metadata. | respected | No audit metadata dropped; cancel reason moved to body and explicit changeId fallback fixed. |
| DONT2 | avoidance | Do not require agents to manually squash or rewrite ADV checkpoint commits. | respected | Generated subjects now satisfy Conventional Commit shape, avoiding manual squash/rewrite for this checkpoint-policy issue. |
| DONT3 | avoidance | Do not make correctness depend on heuristic detection of repository commit policy. | respected | Correctness is structural via fixed formatter, validation guards, and tests; no heuristic repo-policy detection. |
| DONT4 | avoidance | Do not modify `sharperflow-security-gates` in this change. | respected | Only Advance worktree files modified; originating `sharperflow-security-gates` repo untouched. |
| DONT5 | avoidance | Do not rewrite existing branch history or existing checkpoint commits. | respected | Existing branch history/checkpoint commits were not rewritten; new behavior applies forward. |
| OOS1 | out_of_scope | Changing task lifecycle semantics. | respected | No task lifecycle semantics changed; signal calls remain in existing flow. |
| OOS2 | out_of_scope | Changing git checkpoint timing or when checkpoints are required. | respected | No checkpoint timing or requirement changes made; only message construction changed. |
| OOS3 | out_of_scope | Adding repo-specific Conventional Commit policy integration. | respected | No repo-specific Conventional Commit policy integration added. |
| OOS4 | out_of_scope | Modifying the originating repository. | respected | No files changed in originating repository; work confined to Advance worktree. |

