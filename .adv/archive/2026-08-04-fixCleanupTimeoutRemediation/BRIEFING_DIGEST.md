# Archive Briefing Digest

**Change ID:** fixCleanupTimeoutRemediation
**Title:** Fix cleanup timeout remediation
**Status:** archived
**Generated:** 2026-08-04T17:01:47.864Z

## Identity Anchors

- CHANGE
- STATUS
- TERMINAL_GATE_SUMMARY
- Origin: discovery

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

Showing 28 of 28 durable facts.

- **[archive_only_evidence]** decisions: Forward discover:false only when skipDiscovery is explicitly provided. — Preserves the existing default discovery behavior while enabling drain-only recovery; the archived_branches early route remains an intentional no-op.
- **[archive_only_evidence]** decisions: Kept deletion and drain behavior in the existing advWorktreeCleanup path. — Preserves C5, C3, and DONT4 by adding no deletion path or parallelism.
- **[archive_only_evidence]** decisions: Schemas check required no regeneration. — pnpm run schemas:check passed after the Zod argument addition.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/adv-worktree.test.ts (1) — RED confirmed: the two new skipDiscovery tests failed before implementation because the wrapper did not forward discover:false.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/adv-worktree.test.ts (0) — GREEN: 37 tests passed after implementing the interface, schema, and forwarding changes.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/adv-worktree.test.ts (0) — Final verification passed: 37 tests passed after formatting.
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_mseqxmyu_29060f27
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_mseqympl_9188a384
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_mser06jz_1a236f52
- **[archive_only_evidence]** decisions: Fire the discovery stage callback outside and immediately before the discovery gate. — This reports discovery even when discover is skipped, allowing the subsequent drain callback to supersede it exactly as requested.
- **[archive_only_evidence]** decisions: Read pendingDeleteCount from a fresh getPendingDeletes(database) call in the timeout branch. — The fresh database snapshot is safe while the non-cancelling cleanup promise continues, and avoids reading in-flight drain locals.
- **[archive_only_evidence]** decisions: Keep timeout response text, archived_branches handling, and cleanup promise race unchanged. — WS1 owns remediation text, archived_branches is out of scope, and DONT2 prohibits late handlers on the timed-out promise.
- **[archive_only_evidence]** verification: ../bin/oc-test targeted -- src/tools/adv-worktree.test.ts (1) — RED confirmed: the two new timeout-stage tests failed because stage and pendingDeleteCount were not yet in the timeout response; 37 existing tests passed.
- **[archive_only_evidence]** verification: ../bin/oc-test targeted -- src/tools/adv-worktree.test.ts (0) — GREEN: targeted adv-worktree suite passed, 39 tests.
- **[archive_only_evidence]** verification: pnpm run check (0) — Passed schemas check, typecheck, manifest/frontmatter/isolation/lockfile checks, lint with 4 existing warnings and no errors, and format check.
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_mserbntm_537852f1
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_mserlzfm_6a7039a3
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_mserszzg_b9e8daf6
- **[report_follow_up]** follow_ups: WS5 test gap: add C6 regression-guard test asserting a non-cleanup git() caller (e.g. standalone advWorktreeDelete path) receives the default 30000ms, not cleanup gitTimeoutMs
- **[report_follow_up]** follow_ups: WS5 test gap: add skipDiscovery:true + empty pending-delete-queue test asserting {removed:0,retained:0} and discovery never invoked
- **[report_follow_up]** follow_ups: WS1 precision: the error-string template 'during ${stage}' assumes WS2 stage tracking, which only exists in worktrees mode; archived_branches error text must not reference stage
- **[report_follow_up]** follow_ups: WS3 validation: clarify whether skipDiscovery:true + mode:archived_branches should be a Zod rejection or silent no-op (currently ignored, since archived_branches branch never reads it)
- **[report_follow_up]** follow_ups: Observability note: removing the poison claim is correct (D1: never validated) and WS2 stage/pendingDeleteCount is strictly better diagnostic info; no telemetry replacement needed
- **[research_citation]** sources: adv-worktree.ts timeout branches + archived_branches routing: executeWorktreeCleanup routes archived_branches (277-336) to cleanupArchivedMergedBranches with NO discover/skipDiscovery forwarding; worktrees branch (338+) calls advWorktreeCleanup (350-358). Both timeout branches (305-320, 371-386) confirmed: archived has unconditional remediation only; worktrees has unconditional remediation + hardcoded poison claim (380). (plugin/src/tools/adv-worktree.ts:268-406, 801-857)
- **[research_citation]** sources: worktree/index.ts git() helper + discovery call graph: Private git() helper at 850 uses timeout:30000. discoverTerminalCleanupCandidates (2911-2978) calls getDefaultBranch(2919), scanGitWorkspaceFacts(2927), verifyPrMergedChangeBranchIntegration(2961). Does NOT call verifyNonAdvBranchIntegration or getMergedBranchesForDelete. getPrMergedBranchIntegration git calls at 1787,1872,1877. verifyMissingRegistryChangeBranchIntegration(1964-2023) is delete-path only (called at 2274). (plugin/src/tools/worktree/index.ts:850-874, 1728-2023, 2911-3192)
- **[research_citation]** sources: census.ts git() helper + scanGitWorkspaceFacts: Private git() at 24 uses timeout:10_000. scanGitWorkspaceFacts(66-106) calls git at 72,77,78 (parallel) + 94 (per-worktree sequential status). scanGitWorkspaceFacts has ONE production caller: discoverTerminalCleanupCandidates (index.ts:2927). (plugin/src/tools/worktree/census.ts:24-106)
- **[research_citation]** sources.omitted: 6 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: The four workstreams are architecturally sound and use proven in-repo patterns. WS1 (conditional remediation + drop poison) is correct given D1 (no error object in the timeout branch — removal, not reclassification). WS2 callback mirrors triage.ts local-mutation-read-at-result (236-283) and is validated by the second caller at status.ts:875 which a return-handle would break. WS3 drain-only correctly reuses the existing discover?:boolean seam (index.ts:2878) with no new deletion path. WS4 optional-param-defaulting-to-current-value is the simplest C6-preserving option for the two non-compliant helpers (index.ts:850 30s, census.ts:24 10s); execGit (utils/git.ts:19, 5s) is already compliant and correctly excluded. One design defect found: WS1's single remediation template references skipDiscovery, which is unsupported in archived_branches mode (adv-worktree.ts:277-336 never forwards discover), creating a new AC1 violation if applied verbatim.

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
| C4 | constraint | respected |
| C5 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |
| DONT4 | avoidance | respected |
| DONT5 | avoidance | respected |
| OOS1 | out_of_scope | not_applicable |
| OOS2 | out_of_scope | not_applicable |

## Unresolved Actions

- verification_missing: No durable adv_run_test evidence found for run_id: tr_mseqxmyu_29060f27
- verification_missing: No durable adv_run_test evidence found for run_id: tr_mseqympl_9188a384
- verification_missing: No durable adv_run_test evidence found for run_id: tr_mser06jz_1a236f52
- verification_missing: No durable adv_run_test evidence found for run_id: tr_mserbntm_537852f1
- verification_missing: No durable adv_run_test evidence found for run_id: tr_mserlzfm_6a7039a3
- verification_missing: No durable adv_run_test evidence found for run_id: tr_mserszzg_b9e8daf6
