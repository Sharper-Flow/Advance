# Acceptance

Reviewed at: 2026-06-26T04:41:59.534Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| AC1 | acceptance_criterion | Searching `.opencode/agents/adv.md` for Epic guidance shows no statement that Epics are current-repo-only in v1. | pass | adv-reviewer READY report: AC1 satisfied; .opencode/agents/adv.md no longer says Epics are current-repo-only in v1. |
| AC2 | acceptance_criterion | `plugin/src/tools/epic.ts` descriptions for link, unlink, move, and repair reflect target-project/cross-project membership where their args support `target_path`. | pass | adv-reviewer READY report: AC2 satisfied; plugin/src/tools/epic.ts descriptions for link/unlink/move are target_path-aware and repair already documents target routing. |
| AC3 | acceptance_criterion | `plugin/src/advance-epics-assets.test.ts` or adjacent tests assert cross-project Epic guidance and tool descriptions include `target_path`-aware membership language. | pass | bin/oc-test targeted -- src/advance-epics-assets.test.ts src/tools/epic.test.ts passed: 2 files, 59 tests. |
| AC4 | acceptance_criterion | Guidance states the operational workflow for cross-project shell-shaped work: create or use the target-project ADV change, then link it into the owner Epic with `adv_epic_link_change target_path` unless direct shell promotion gains target support. | pass | adv-reviewer READY report: guidance documents create/use target-project ADV change then adv_epic_link_change target_path for cross-project shell-shaped work. |
| AC5 | acceptance_criterion | Targeted verification passes with `bin/oc-test targeted -- src/advance-epics-assets.test.ts src/tools/epic.test.ts` or equivalent scoped test evidence. | pass | adv_run_test and adv-reviewer verification: bin/oc-test targeted -- src/advance-epics-assets.test.ts src/tools/epic.test.ts passed, 59 tests. |
| C1 | constraint | Existing `advance-epics` spec remains source of truth. | respected | Change aligns instructions/tool descriptions/ADR with existing advance-epics spec; no spec rewrite or invariant change. |
| C2 | constraint | No new Jira-like planning constructs. | respected | No Jira-like planning constructs added; reviewer reported no findings/scope drift. |
| C3 | constraint | No changes to one-Epic-per-change membership invariant. | respected | No one-Epic-per-change schema or membership invariant changes made. |
| C4 | constraint | No direct ADV state file edits. | respected | All changes were source files in worktree; no ADV state files edited directly. |
| DONT1 | avoidance | Do not claim `adv_epic_promote_shell` supports cross-project creation unless implemented and tested. | respected | Guidance explicitly says not to claim adv_epic_promote_shell creates cross-project changes directly unless target support is added. |
| DONT2 | avoidance | Do not use prose-only correctness where tests can pin the expected agent/tool surface. | respected | Regression tests structurally pin agent/tool/ADR surfaces instead of prose-only expectations. |

