# Archive Briefing Digest

**Change ID:** fixArchiveCleanupSequencing
**Title:** Fix archive cleanup sequencing
**Status:** archived
**Generated:** 2026-07-29T23:46:40.000Z

## Identity Anchors

- CHANGE
- STATUS
- TERMINAL_GATE_SUMMARY

## Archive Digest

**Status:** archived

| Gate | Status |
| --- | --- |
| proposal | done |
| discovery | done |
| design | done |
| planning | done |
| execution | done |
| acceptance | done |
| release | pending |

## Epic Context

No Epic membership

## Durable Facts

Showing 38 of 38 durable facts.

- **[archive_only_evidence]** decisions: Replaced broad advWorktreeCleanup with targeted advWorktreeDelete("change/{id}") in Phase 9 finalization — Required behavior: archive finalization must use targeted managed-worktree removal, not broad discovery cleanup, so retention/in-use errors can block branch deletion safely
- **[archive_only_evidence]** decisions: Deferred removeChangeDir until after targeted worktree deletion — Prevents erasing the source-dir projection before the targeted cleanup has verified terminal state
- **[archive_only_evidence]** decisions: Treat WORKTREE_NOT_FOUND as verified absence for branch deletion — advWorktreeDelete API contract returns this code when neither registry nor resolved path exists; it satisfies the precondition that deleteChangeBranch requires the worktree to be already removed
- **[archive_only_evidence]** decisions: Updated change.test.ts no-op archive spy from advWorktreeCleanup to advWorktreeDelete — Implementation no longer calls advWorktreeCleanup during archive finalization; the spy must match the new function to preserve the no-op assertion
- **[archive_only_evidence]** verification: pnpm vitest run src/tools/change.archive-phase9.test.ts --reporter=verbose (0) — Phase 9 focused verification: 56 tests passed (1 new regression test + 55 existing tests)
- **[archive_only_evidence]** verification: pnpm vitest run src/tools/change.test.ts --reporter=verbose -t "adv_change_archive" (0) — Archive section in change.test.ts: 34 tests passed, 118 skipped
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_ms6f9669_649e48d4
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_ms6f9g6b_6eb6b003
- **[archive_only_evidence]** decisions: Temporarily added WORKTREE_IN_USE to the worktreeAbsent condition in change.ts — Produces the required red evidence: treating WORKTREE_IN_USE as verified absence re-enables branch deletion and makes the AC7 regression fail, proving the committed guard prevents unsafe deletion.
- **[archive_only_evidence]** decisions: Restored change.ts to committed SHA 472e22cb296d6423c220390c470154a3722e2831 after red evidence — Evidence-repair only; no behavioral change or new implementation commit.
- **[archive_only_evidence]** decisions: Used bin/oc-test targeted tier for focused test runs — Project provides bin/oc-test; routes through oc-test-gate throttle and matches existing test tooling.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/change.archive-phase9.test.ts -t "AC7 regression" (1) — Red evidence: AC7 regression failed because deleteChangeBranch was called despite WORKTREE_IN_USE
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/change.archive-phase9.test.ts (0) — Green evidence: 56 Phase 9 tests passed
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/change.test.ts -t "adv_change_archive" (0) — Verify evidence: 34 archive section tests passed, 118 skipped
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_ms6fem5k_5121cdbf
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_ms6ff60l_c152c206
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_ms6fffb5_3807e17a
- **[archive_only_evidence]** decisions: Bound latest task report to durable ADV test evidence — Clears stale verification_missing warning from pre-adv_run_test engineer report without changing implementation.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/change.archive-phase9.test.ts (0) — Durable post-rebase verification: 57/57 Phase 9 tests passed.
- **[archive_only_evidence]** decisions: Added narrow AC6 regression test in change.archive-phase9.test.ts without editing production code — Production code already returns early on pending_merge before targeted worktree/branch cleanup; the test locks the invariant and proves no regression exists.
- **[archive_only_evidence]** verification: pnpm vitest run src/tools/change.archive-phase9.test.ts -t "AC6: pending auto-merge path skips targeted cleanup and keeps archive nonterminal" (0) — AC6 red assertion: pending auto-merge path does not call advWorktreeDelete/deleteChangeBranch, archive stays nonterminal (1/1 passed)
- **[archive_only_evidence]** verification: pnpm vitest run src/tools/change.archive-phase9.test.ts -t "AC6: pending auto-merge path skips targeted cleanup and keeps archive nonterminal" (0) — AC6 green assertion: existing implementation satisfies the test (1/1 passed)
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/tools/change.archive-phase9.test.ts src/tools/worktree/index-delete.test.ts src/utils/branch-integration.test.ts results=pass — Focused regression suite passed: 3 files, 132 tests. Reviewed origin/trunk diff (7 files; 305 insertions, 52 deletions), archive ordering, durable terminal readback, branch-deletion guard, pending auto-merge, and no-remote/PR routes. Worktree clean; git diff --check and git diff --exit-code passed. Existing post-rebase pnpm check evidence supplied in packet.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tools/change.archive-phase9.test.ts src/tools/worktree/index-delete.test.ts src/utils/branch-integration.test.ts
- **[unresolved_action]** required_main_agent_actions: Respawn adv-reviewer with `SCOPE KEY: harden:release`; preserve CHANGE, WORKING DIRECTORY, PHASE, and ATTEMPT.
- **[archive_only_evidence]** verification: tests_run= results=n/a — No repository analysis or edits performed: required independent-summary identity anchor is missing.
- **[unresolved_action]** required_main_agent_actions: Inspect and commit the reviewer remediation in plugin/src/tools/change.ts and plugin/src/tools/change.archive-phase9.test.ts before release finalization.
- **[unresolved_action]** required_main_agent_actions: Preserve merge ordering: merge fixArchiveCleanupSequencing before the colliding fixMultiSessionConcurrency branch.
- **[unresolved_action]** required_main_agent_actions: No migration, frontend, or release-note follow-up is required. If local plugin deployment is needed after merge, run it from updated trunk only.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] Archive retry paths that omit worktreePath must treat missing targeted-cleanup evidence as unsafe, not as proof of worktree absence; otherwise branch cleanup can delete a branch still owned by a managed worktree.
- **[archive_only_evidence]** changes_made: plugin/src/tools/change.ts: Retained the change branch when an existing-bundle archive retry omits worktreePath; absence of a cleanup attempt is no longer treated as proof that no managed worktree owns the branch.
- **[archive_only_evidence]** changes_made: plugin/src/tools/change.archive-phase9.test.ts: Added regression coverage proving an existing-bundle retry without worktreePath does not invoke targeted worktree cleanup or delete the branch.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/tools/change.archive-phase9.test.ts, pnpm --dir plugin run check, bin/oc-test targeted -- src/tools/change.archive-phase9.test.ts src/tools/change.test.ts src/tools/worktree/index-delete.test.ts src/utils/branch-integration.test.ts, bin/adv slop-scan plugin/src/tools/change.ts --json, git diff --check results=pass — Phase 9 test passed 58/58; combined archive/change/worktree/branch suite passed 285/285; pnpm check passed (3 pre-existing eslint warnings only in src/utils/manifest-frontmatter.ts); git diff --check passed. Slop scan completed with all important detectors; its sole changed-file signal was pre-existing review-only LOW unused export loadProposalForContext at change.ts:6323, outside this change's diff and not deleted. Worker-bundle impact is not applicable: changed files are tool/util/test modules and workflow bundle entrypoint workflows.ts has no import path to them. Release consequences: no frontend route, data migration, or deployment configuration change; merge collision instruction remains that this branch merges before fixMultiSessionConcurrency.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tools/change.archive-phase9.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir plugin run check
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tools/change.archive-phase9.test.ts src/tools/change.test.ts src/tools/worktree/index-delete.test.ts src/utils/branch-integration.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/adv slop-scan plugin/src/tools/change.ts --json
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| AC1 | acceptance_criterion | pass |
| AC2 | acceptance_criterion | pass |
| AC3 | acceptance_criterion | pass |
| AC4 | acceptance_criterion | pass |
| AC5 | acceptance_criterion | pass |
| AC6 | acceptance_criterion | pass |
| AC7 | acceptance_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| OOS1 | out_of_scope | not_applicable |
| OOS2 | out_of_scope | not_applicable |
| OOS3 | out_of_scope | not_applicable |

## Unresolved Actions

- verification_missing: No durable adv_run_test evidence found for run_id: tr_ms6f9669_649e48d4
- verification_missing: No durable adv_run_test evidence found for run_id: tr_ms6f9g6b_6eb6b003
- verification_missing: No durable adv_run_test evidence found for run_id: tr_ms6fem5k_5121cdbf
- verification_missing: No durable adv_run_test evidence found for run_id: tr_ms6ff60l_c152c206
- verification_missing: No durable adv_run_test evidence found for run_id: tr_ms6fffb5_3807e17a
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tools/change.archive-phase9.test.ts src/tools/worktree/index-delete.test.ts src/utils/branch-integration.test.ts
- Respawn adv-reviewer with `SCOPE KEY: harden:release`; preserve CHANGE, WORKING DIRECTORY, PHASE, and ATTEMPT.
- Inspect and commit the reviewer remediation in plugin/src/tools/change.ts and plugin/src/tools/change.archive-phase9.test.ts before release finalization.
- Preserve merge ordering: merge fixArchiveCleanupSequencing before the colliding fixMultiSessionConcurrency branch.
- No migration, frontend, or release-note follow-up is required. If local plugin deployment is needed after merge, run it from updated trunk only.
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tools/change.archive-phase9.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir plugin run check
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tools/change.archive-phase9.test.ts src/tools/change.test.ts src/tools/worktree/index-delete.test.ts src/utils/branch-integration.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/adv slop-scan plugin/src/tools/change.ts --json
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check
