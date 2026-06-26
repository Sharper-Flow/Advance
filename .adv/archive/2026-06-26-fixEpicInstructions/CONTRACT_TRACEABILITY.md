# Contract Traceability

**Change ID:** fixEpicInstructions
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-06-26T04:41:59.534Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | adv-reviewer READY report: AC1 satisfied; .opencode/agents/adv.md no longer says Epics are current-repo-only in v1. |
| AC2 | acceptance_criterion | pass | test | adv-reviewer READY report: AC2 satisfied; plugin/src/tools/epic.ts descriptions for link/unlink/move are target_path-aware and repair already documents target routing. |
| AC3 | acceptance_criterion | pass | test | bin/oc-test targeted -- src/advance-epics-assets.test.ts src/tools/epic.test.ts passed: 2 files, 59 tests. |
| AC4 | acceptance_criterion | pass | test | adv-reviewer READY report: guidance documents create/use target-project ADV change then adv_epic_link_change target_path for cross-project shell-shaped work. |
| AC5 | acceptance_criterion | pass | test | adv_run_test and adv-reviewer verification: bin/oc-test targeted -- src/advance-epics-assets.test.ts src/tools/epic.test.ts passed, 59 tests. |
| C1 | constraint | respected | static_check | Change aligns instructions/tool descriptions/ADR with existing advance-epics spec; no spec rewrite or invariant change. |
| C2 | constraint | respected | static_check | No Jira-like planning constructs added; reviewer reported no findings/scope drift. |
| C3 | constraint | respected | static_check | No one-Epic-per-change schema or membership invariant changes made. |
| C4 | constraint | respected | static_check | All changes were source files in worktree; no ADV state files edited directly. |
| DONT1 | avoidance | respected | review | Guidance explicitly says not to claim adv_epic_promote_shell creates cross-project changes directly unless target support is added. |
| DONT2 | avoidance | respected | review | Regression tests structurally pin agent/tool/ADR surfaces instead of prose-only expectations. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-6dfa52f0d695 | AC1, AC2, AC3, AC4 | AC1, AC2, AC3, AC4 | C1, C2, C3, C4, DONT1, DONT2 |  |
| tk-109109bcb840 | AC1, AC2, AC3, AC4, AC5 | AC1, AC2, AC3, AC4, AC5 | C1, C2, C3, C4, DONT1, DONT2 |  |
