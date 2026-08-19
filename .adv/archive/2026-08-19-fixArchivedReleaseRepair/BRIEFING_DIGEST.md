# Archive Briefing Digest

**Change ID:** fixArchivedReleaseRepair
**Title:** Fix archived release repair
**Status:** archived
**Generated:** 2026-08-19T00:42:22.016Z

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

Showing 17 of 17 durable facts.

- **[report_follow_up]** follow_ups: Packet SCOPE KEY 'fast-track:architecture-validation' does not match the persisted-report schema regex (researcher|tron|scanner-bundle|verifier|visual-review|review:acceptance|harden:release prefixes); submitted as researcher:architecture-validation — orchestrator should align the spawn anchor with the report schema
- **[report_follow_up]** follow_ups: Fix saveRecoveredArchiveConvergence (helpers.ts:288-294) active-only mutation — same-pattern site for gate-complete release recovery; reuse the new bundle-leg owner
- **[report_follow_up]** follow_ups: Add spec scenario pinning the post-retirement durability surface for release-gate proof (rq-releaseProjectionDurability01 speaks Temporal-era 'store-backed gate read')
- **[research_citation]** sources: archive-gate.ts — completeReleaseGateAfterFinalization / reconcileArchivedBundleRetry / recordPhase9Status / verifyReleaseGateDurableForArchive: Release-gate writer hardwired to store.paths.changes; existingBundlePath dead; bundle-aware durable-proof reader already exists; recordPhase9Status same active-only defect (plugin/src/tools/change/archive-gate.ts:448-659,228-257)
- **[research_citation]** sources: handlers-archive.ts — archive handler flow: Bundle written pre-finalization; retire then removeChangeDir; reconcile entry conditions; no bundle re-sync anywhere (plugin/src/tools/change/handlers-archive.ts:211,369-371,643-668,671-712,725-852,930-992,1037-1043)
- **[research_citation]** sources: archive.ts — bundle writer + lock usage: writeArchiveBundleFiles is sole generated-file writer; reuseExistingBundlePath skips it; terminal-summary hash-bound to change.json bytes; archiveChange under withArchiveProjectionLock (plugin/src/archive/archive.ts:106-206,829-844,1075-1099,1137-1144)
- **[research_citation]** sources.omitted: 5 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Defect chain source-proven. (1) The external archive bundle is written BEFORE finalization/gate completion (handlers-archive.ts:690/705 precede :725-750 and :813-819), freezing gates.release=pending into the durable terminal record via writeArchiveBundleFiles ({...change, status:'archived'} — archive.ts:113-117). (2) With reuseExistingBundlePath, writeArchiveBundleFiles is never invoked; only spec-projection.json is rewritten (archive.ts:1078-1099), so NO path ever updates the bundle change.json after gate completion. (3) completeReleaseGateAfterFinalization loads/mutates only store.paths.changes (archive-gate.ts:518-556); existingBundlePath (:511) is dead. After retire (handlers-archive.ts:932-981) and removeChangeDir (:1037; json.ts:482-487), the active projection is gone; store.changes.get self-heals reads from the bundle (store-disk.ts:502-514), making release=pending the dominant terminal truth. (4) Retry enters reconcileArchivedBundleRetry (handlers-archive.ts:444/:658), re-proves shipped (archive-gate.ts:591-596), then loadChange returns success+null (change-projection-reader.ts:375-376) → commitChangeProjection fails closed 'change not found' (change-projection-transaction.ts:300-309) → 'Release gate projection was not durably verified.' (archive-gate.ts:557-564). Sibling defect: recordPhase9Status (archive-gate.ts:228-257) uses the same active-only routing and is called in the reconcile success path (:634-645) — it throws when active is absent and phase9_status!=done; it MUST be in scope. Adjacent same-pattern site (follow-up, not this change): saveRecoveredArchiveConvergence (helpers.ts:288-294) validates the bundle but mutates only paths.changes. IMPORTANT: the first-run completed archive ALSO ends bundle-pending (unifyPricingSourcePrecedence repro confirms: terminal/archived + bundle pending), so the 'synchronize the generated archive bundle' leg must cover the first-run path (sync before removeChangeDir), not only reconcile. Structural owner fix: in completeReleaseGateAfterFinalization, branch on active-projection presence. Active-exists → unchanged coordinateChangeMutation + bundle derived-file sync. Active-absent + validated bundle → under withArchiveProjectionLock (projection-lock.ts:6-31; pass store root), mutate the bundle projection via the exported transaction primitive commitChangeProjection (change-projection-transaction.ts:269; per-change lock, revision bump, audit entry, in-lock readback) with changesDir=dirname(bundlePath) and changeId=basename(bundlePath) — the dated bundle dir name is the addressing key, exactly how verifyReleaseGateDurableForArchive already reads bundles (archive-gate.ts:468-472); the bundle change.json id is not checked against the dir name. Fold gates.release AND phase9_status done into ONE transaction (single revision bump; satisfies rq-archiveRecoveryConsistency01.1 'phase9 done before success'). Then regenerate derived bundle files through the EXISTING single writer writeArchiveBundleFiles (export it; archive.ts:106-206) so terminal-summary changeHash binding (:116-141) and digest overwrite semantics (rq-briefingPacketArchiveDigest01) stay coherent; reuse the ORIGINAL archivedAt from the existing terminal-summary for determinism; preserve spec-projection.json bytes and multi-repo metadata. Do NOT call coordinateChangeMutation at the bundle dir (summary-shard + launcher-aggregate side effects would pollute the archive namespace — change-mutation-coordinator.ts:91-126). Do NOT resurrect changes/<id> (store-disk.ts:483-484 dominance is read-only by design). Do NOT add a second archive writer (reuse writeArchiveBundleFiles). External-bundle sync does not invalidate in-repo git proofs: verifyProjectionAtGitCommit binds spec-projection.json, not bundle gates.
- **[archive_only_evidence]** changes_made: plugin/src/tools/change/archive-gate.ts: Preserved an existing Phase 9 mergeCommitSha when fresh shipped-finalization evidence omits it, so archive recovery retains complete PR merge proof.
- **[archive_only_evidence]** changes_made: plugin/src/tools/change.archive-phase9.test.ts: Covered archived-bundle recovery retaining an existing merge commit SHA while refreshing release and Phase 9 metadata.
- **[archive_only_evidence]** verification: tests_run=pnpm test -- src/tools/change.archive-phase9.test.ts src/tools/change/handlers-archive.partial-repair.test.ts, pnpm exec prettier --check src/tools/change/archive-gate.ts src/tools/change.archive-phase9.test.ts, pnpm exec eslint src/tools/change/archive-gate.ts src/tools/change.archive-phase9.test.ts, git diff --check results=pass — Vitest completed 386 files: 5,132 passed, 1 skipped, 12 todo; targeted formatting and ESLint passed; git diff --check passed.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm test -- src/tools/change.archive-phase9.test.ts src/tools/change/handlers-archive.partial-repair.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm exec prettier --check src/tools/change/archive-gate.ts src/tools/change.archive-phase9.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm exec eslint src/tools/change/archive-gate.ts src/tools/change.archive-phase9.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check
- **[unresolved_action]** required_main_agent_actions: Record this READY independent acceptance review as acceptance evidence; no remediation is required.
- **[archive_only_evidence]** verification: tests_run=pnpm --dir plugin exec vitest run src/tools/change.archive-phase9.test.ts src/tools/change/handlers-archive.partial-repair.test.ts, pnpm --dir plugin run typecheck results=pass — Focused archive/Phase 9 review suite passed: 2 files, 19 tests. TypeScript typecheck passed. Reviewed origin/trunk...HEAD for recovery identity, archived-only projection mutation, archive-before-change lock nesting, readback, terminal-summary preservation, sidecar preservation, replay revision behavior, and normal archive refresh. Existing durable evidence reports full lane 5,132 passed and build passed; the two complete-check failures are documented as base-branch equivalent.

## Contract / AC Coverage

No contract items.

## Unresolved Actions

- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm test -- src/tools/change.archive-phase9.test.ts src/tools/change/handlers-archive.partial-repair.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm exec prettier --check src/tools/change/archive-gate.ts src/tools/change.archive-phase9.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm exec eslint src/tools/change/archive-gate.ts src/tools/change.archive-phase9.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check
- Record this READY independent acceptance review as acceptance evidence; no remediation is required.
