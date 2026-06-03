# Acceptance

Reviewed at: 2026-06-03T19:02:41.949Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| AC1 | acceptance_criterion | Given an explicit approved `target_path`, when `adv_worktree_delete` is invoked for a target-project stale/missing worktree, then it uses the target project's worktree registry/state and completes or refuses using existing safety gates. | pass | `plugin/src/tools/adv-worktree.test.ts` target_path delete test passed via `pnpm test -- src/tools/adv-worktree.test.ts src/tools/worktree/triage.test.ts` and `bin/oc-test full`. |
| AC2 | acceptance_criterion | Given target-project cleanup is requested without explicit confirmation, then mutation is rejected before deletion/registry changes. | pass | `adv_worktree_delete rejects unconfirmed target mutation before deleting` test passed; full suite passed. |
| AC3 | acceptance_criterion | Given `adv_worktree_triage projectRoot` reports target-project drift, then recommended remediation is actionable from a different current repo. | pass | `plugin/src/tools/worktree/triage.test.ts` target_path remediation test passed; full suite passed. |
| AC4 | acceptance_criterion | Given dirty or in-use target worktrees, then cleanup refuses unless existing safe force rules permit it. | pass | Code review confirmed existing `advWorktreeDelete`/`advWorktreeCleanup` bodies remain safety authorities; target routing only changes store/root context. adv-reviewer verdict READY. |
| AC5 | acceptance_criterion | Targeted tests and repo smoke checks pass. | pass | `pnpm run schemas:check` passed; targeted tests passed; `bin/oc-test smoke` passed; `bin/oc-test full` passed. |
| C1 | constraint | No direct ADV state file reads/writes. | respected | No direct ADV state file reads/writes used; implementation routes through target store and worktree state helpers. |
| C2 | constraint | No weakening dirty/in-use/merged/terminal safety checks. | respected | Existing deletion and cleanup functions remain sole authorities; no safety checks removed. adv-reviewer READY. |
| C3 | constraint | No unapproved cross-project mutation. | respected | Unconfirmed target mutation rejection test passed; target routing uses `withTargetPathStore` confirmation gate. |
| DONT1 | avoidance | Do not add shell-workaround-only cleanup paths. | respected | No shell-workaround cleanup path added; solution uses tool/store architecture. |
| DONT2 | avoidance | Do not make `adv_worktree_triage` mutate state. | respected | Triage remains read-only and only formats recommendations. |

