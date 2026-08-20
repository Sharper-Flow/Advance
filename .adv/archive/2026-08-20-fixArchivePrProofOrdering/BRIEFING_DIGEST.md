# Archive Briefing Digest

**Change ID:** fixArchivePrProofOrdering
**Title:** Fix archive PR proof ordering
**Status:** archived
**Generated:** 2026-08-20T17:05:03.088Z

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

Showing 35 of 35 durable facts.

- **[report_follow_up]** follow_ups: Align item 3 proof token with replaceReleaseEvidence RCA-2 direction (pr_merged_by_tree) before implementation
- **[report_follow_up]** follow_ups: Bundle determinism follow-up: spec.updated_at (delta.ts:320,377), generated_at (archive.ts:520), archivedAt (archive.ts:1341) — replaces design item 5
- **[report_follow_up]** follow_ups: adv-cleanup: 4 of the 5 'in-flight' worktrees (improveCrossProject, fixReleaseGateProjection, addDefaultSignalHandler, reconcileStoreMigrationResidue) have no active ADV change — orphaned drift; only fixTaskUpdatePersistence is active (release phase)
- **[report_follow_up]** follow_ups: Packet scope_key 'design-validation-pre-archive-tip' does not match the persisted-report schema regex; submitted as researcher:design-validation-pre-archive-tip
- **[research_citation]** sources: Tip capture ordering defect: commitArchiveArtifacts precedes changeTipSha = rev-parse sourceBranch (plugin/src/tools/archive-helpers/git-finalize.ts:3613-3645)
- **[research_citation]** sources: Proof equality + guards: prHeadSha === localTip among 8 conjuncts; mergeCommitOid reachability; ambiguous fails closed (plugin/src/tools/archive-helpers/git-finalize.ts:1482-1494,1565-1569,1528-1537)
- **[research_citation]** sources: commitArchiveArtifacts: returns {committed:false} when clean (3372-3374); unconditional new commit when dirty (3385-3389) (plugin/src/tools/archive-helpers/git-finalize.ts:3340-3399)
- **[research_citation]** sources.omitted: 9 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Defect verified: commitArchiveArtifacts (git-finalize.ts:3340-3399) runs at 3613, changeTipSha captured AFTER at 3636-3645, and verifyDirectMergedPrProof:1494 requires prHeadSha === that post-bundle tip, so a PR merged pre-bundle (scenario B) can never prove. Items 1-2 of the design (capture preArchiveTipSha before the commit; accept either SHA) are sound and minimal. Both candidate SHAs are tips of the same change/{id} branch captured one commit apart inside one finalizeRelease invocation; the proof still requires MERGED state, head branch name, base branch, exact head repo, non-cross-repo, non-empty mergeCommitOid, and origin/default reachability of the merge commit (1482-1494, 1565-1569); multiple exact matches fail closed MERGED_PR_PROOF_AMBIGUOUS (1528-1537). committed:false degenerates pre===post so the acceptance set collapses to a singleton — no weakening, no degenerate amplification. Only prHeadSha equality in the codebase is the defect line itself (repo-wide grep: 2 hits, one being it). Scenario A pinning test confirmed at git-finalize.test.ts:3055-3058. Items 3 and 5 need redesign; item 4 is incomplete.
- **[archive_only_evidence]** decisions: Added rewrite-resistant integration coverage for both squash-merged and merge-commit PRs with an archive bundle commit between PR head capture and finalization. — The observable contract must prove resume-after-merge ships with mergeCommitSha; helper-only tests could be lost in a wholesale rewrite.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/tools/archive-helpers/git-finalize.test.ts src/tools/change.archive-phase9.test.ts --maxWorkers=4 (1) — RED: new squash/merge scenario-B integration tests and Phase 9 preservation assertion failed against the pre-fix implementation.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/tools/archive-helpers/git-finalize.test.ts src/tools/change.archive-phase9.test.ts src/types/changes.archive-passthrough.test.ts --maxWorkers=4 (0) — GREEN: scenario-B integration, handler-level preservation, and existing targeted coverage passed.
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_mt1qi7bt_bc0653d6
- **[archive_only_evidence]** decisions: Added preArchiveTipSha to Phase9FinalizationStatusSchema before threading writers, then regenerated change.schema.json. — Zod strips unknown keys on round-trip; schema-first prevents silent evidence loss.
- **[archive_only_evidence]** decisions: Added the field to preservePhase9Evidence and archive convergence/recovery writers. — Phase 9 status transitions can omit the field, so explicit carry-forward is required.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/tools/change.archive-phase9.test.ts src/types/changes.archive-passthrough.test.ts --maxWorkers=4 (1) — RED: preArchiveTipSha round-trip/preservation behavior failed before the schema and writer threading changes.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/tools/change.archive-phase9.test.ts src/types/changes.archive-passthrough.test.ts --maxWorkers=4 (0) — GREEN: 17 schema and Phase 9 preservation tests passed.
- **[archive_only_evidence]** verification: pnpm run schemas:check (0) — Generated JSON schemas match source schemas.
- **[archive_only_evidence]** decisions: Captured preArchiveTipSha immediately before commitArchiveArtifacts and retained changeTipSha after the commit. — Existing post-bundle semantics and pinned scenario-A tests must remain unchanged while scenario B needs the earlier merged head.
- **[archive_only_evidence]** decisions: Accepted a merged PR head matching either post-bundle or pre-bundle tip while retaining every repository, branch, state, merge-commit, and ancestry check. — The two tips are the complete same-invocation candidate set; unrelated or divergent heads still fail closed.
- **[archive_only_evidence]** decisions: Threaded preArchiveTipSha through persisted recheck input as well as finalization handoffs. — A later archive proof must retain the same exact candidate set after the worktree is gone.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/tools/archive-helpers/git-finalize.test.ts --maxWorkers=4 (1) — RED: disabling pre-archive capture reproduced both scenario-B integration failures.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/tools/archive-helpers/git-finalize.test.ts src/tools/change.archive-phase9.test.ts src/types/changes.archive-passthrough.test.ts --maxWorkers=4 (0) — GREEN: 171 targeted tests passed, including squash-merge, merge-commit, and neither-tip fail-closed coverage.
- **[archive_only_evidence]** verification: pnpm exec vitest run --maxWorkers=4 --testTimeout=120000 (0) — Full plugin unit suite passed: 389 files, 5145 passed, 1 skipped, 12 todo.
- **[archive_only_evidence]** verification: pnpm run typecheck (0) — TypeScript typecheck passed.
- **[archive_only_evidence]** decisions: Use proof token pr_merged_by_tree_pre_archive for a pre-bundle tree match. — Keeps structural evidence auditable and prevents conflation with API-confirmed pr_merged.
- **[archive_only_evidence]** decisions: Walk the post-bundle tree first, then the pre-bundle tree, with a separate bounded 50-commit log for each. — Preserves existing post-bundle behavior and adds scenario-B coverage without widening either walk; maximum tree probes doubles from 50 to 100.
- **[archive_only_evidence]** decisions: Allow structural proof to complete reachability while leaving mergeCommitSha unset. — Callers can ship released content, but the structural token is not treated as API-confirmed merge proof.
- **[archive_only_evidence]** decisions: Thread preArchiveTipSha through gate.ts release rechecks. — Gate consumers must be able to reproduce the same pre-bundle structural fallback from persisted Phase 9 state.
- **[archive_only_evidence]** verification: pnpm --dir plugin exec vitest run src/tools/archive-helpers/git-finalize.test.ts -t "tries the pre-archive tree" (1) — RED: new pre-archive tree test failed before implementation; current detector returned unreachable.
- **[archive_only_evidence]** verification: pnpm --dir plugin exec vitest run src/tools/archive-helpers/git-finalize.test.ts -t "tries the pre-archive tree" (0) — GREEN: distinct pre-archive proof test passed.
- **[archive_only_evidence]** verification: pnpm --dir plugin exec vitest run src/tools/archive-helpers/git-finalize.test.ts -t "pre-archive tree|tree fallback" (0) — Structural fallback and proof-token tests passed.
- **[archive_only_evidence]** verification: pnpm --dir plugin run typecheck (0) — TypeScript typecheck passed.
- **[archive_only_evidence]** verification: pnpm --dir plugin exec prettier --check src/tools/archive-helpers/git-finalize.ts src/tools/archive-helpers/git-finalize.test.ts src/tools/gate.ts (0) — Prettier check passed.
- **[archive_only_evidence]** verification: pnpm --dir plugin exec vitest run --maxWorkers=4 (0) — Full plugin Vitest suite passed with capped four workers.

## Contract / AC Coverage

No contract items.

## Unresolved Actions

- verification_missing: No durable adv_run_test evidence found for run_id: tr_mt1qi7bt_bc0653d6
