# Contract Traceability

**Change ID:** addTargetCleanup
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-06-03T19:02:41.949Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | `plugin/src/tools/adv-worktree.test.ts` target_path delete test passed via `pnpm test -- src/tools/adv-worktree.test.ts src/tools/worktree/triage.test.ts` and `bin/oc-test full`. |
| AC2 | acceptance_criterion | pass | test | `adv_worktree_delete rejects unconfirmed target mutation before deleting` test passed; full suite passed. |
| AC3 | acceptance_criterion | pass | test | `plugin/src/tools/worktree/triage.test.ts` target_path remediation test passed; full suite passed. |
| AC4 | acceptance_criterion | pass | test | Code review confirmed existing `advWorktreeDelete`/`advWorktreeCleanup` bodies remain safety authorities; target routing only changes store/root context. adv-reviewer verdict READY. |
| AC5 | acceptance_criterion | pass | test | `pnpm run schemas:check` passed; targeted tests passed; `bin/oc-test smoke` passed; `bin/oc-test full` passed. |
| C1 | constraint | respected | static_check | No direct ADV state file reads/writes used; implementation routes through target store and worktree state helpers. |
| C2 | constraint | respected | static_check | Existing deletion and cleanup functions remain sole authorities; no safety checks removed. adv-reviewer READY. |
| C3 | constraint | respected | static_check | Unconfirmed target mutation rejection test passed; target routing uses `withTargetPathStore` confirmation gate. |
| DONT1 | avoidance | respected | review | No shell-workaround cleanup path added; solution uses tool/store architecture. |
| DONT2 | avoidance | respected | review | Triage remains read-only and only formats recommendations. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-538971f6fd33 | AC1, AC2, AC3, AC4 |  | C1, C2, C3 |  |
| tk-38c0ac1a4578 | AC1, AC2, AC4 | AC1, AC2, AC4 | C1, C2, C3 |  |
| tk-c93c7cb5ffab | AC3 | AC3 | C1, C2, C3 |  |
| tk-8c0c91513c61 |  | AC1, AC2, AC3, AC4, AC5 | C1, C2, C3 |  |
