# Contract Traceability

**Change ID:** fixTrunkFirewallRelPath
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-05-29T02:44:19.317Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | integration.test.ts:REL path allowed when active change has worktree — resolves against worktree, firewall ALLOWs |
| AC2 | acceptance_criterion | pass | test | integration.test.ts:REL path blocked when no worktree exists — falls back to session dir, firewall BLOCKs |
| AC3 | acceptance_criterion | pass | test | !isAbsolute(targetPath) guard ensures ABS paths skip worktree resolution; test verifies ABS to trunk still BLOCKED |
| AC4 | acceptance_criterion | pass | test | git diff shows zero changes to bash-related code; 3366 existing tests pass |
| AC5 | acceptance_criterion | pass | test | trunk-write-firewall.regression.test.ts: 23-case behavior matrix, all pass |
| AC6 | acceptance_criterion | pass | test | Full suite: 3366 tests pass, 0 regressions |
| C1 | constraint | respected | static_check | Only plugin/src/index.ts changed — 3 files total diff confirms |
| C2 | constraint | respected | static_check | git diff trunk-write-firewall.ts: zero changes |
| C3 | constraint | respected | static_check | No bash-related files in diff |
| C4 | constraint | respected | static_check | No new imports from external packages — join, existsSync, getWorktreeBase all existing |
| DONT1 | avoidance | respected | review | Pure structural check: rel path + isMainCheckout + changeId + existsSync — no content/intent parsing |
| DONT2 | avoidance | respected | review | No workdir/workdir parameter added to any tool |
| DONT3 | avoidance | respected | review | !isAbsolute guard means ABS paths always use session directory — firewall semantics unchanged |
| DONT4 | avoidance | respected | review | No changes to worktree_isolation_guard or worktree_auto_manage modules |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-5f30b082e48c | AC1, AC2 | AC1, AC2, AC3, AC4 | C1, C2, C3, C4, DONT1, DONT3, DONT4 |  |
| tk-d2719b28d412 | AC5, AC6 | AC5, AC6 |  |  |
