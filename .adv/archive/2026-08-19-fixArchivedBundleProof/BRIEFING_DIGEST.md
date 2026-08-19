# Archive Briefing Digest

**Change ID:** fixArchivedBundleProof
**Title:** Fix archived bundle proof
**Status:** archived
**Generated:** 2026-08-19T02:30:08.601Z

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

Showing 18 of 18 durable facts.

- **[report_follow_up]** follow_ups: Packet SCOPE KEY 'design-validation:proof-authority' is not lane-prefixed; typed schema requires researcher:<slug>; submitted as researcher:proof-authority — orchestrator should fix the spawn pattern.
- **[report_follow_up]** follow_ups: Add identity check for bundlePath reads in verifyReleaseGateDurableForArchive (currently absent; foreign-id bundle accepted by routing, see change.archive-phase9.test.ts:352-383).
- **[report_follow_up]** follow_ups: Reconcile path does not close linked issues (closeLinkedIssue only runs in the general path, handlers-archive.ts:1089) — verify the live change has no open linked issue or accept the gap.
- **[report_follow_up]** follow_ups: Bundle lifecycleState never converges to archived via reconcile repair (no archive-writer sets it; grep shows pass-through only) — consider setting it in the recovery mutation per rq-archiveTerminalDurability01 agreement clause.
- **[research_citation]** sources: handlers-archive.ts reconcile gate + proof call: Gate requires lifecycleState==='archived' to route reconcile; proof call at 830 passes no bundlePath; retire step runs coordinateChangeMutation against activeStore.paths.changes unconditionally when !dryRun. (plugin/src/tools/change/handlers-archive.ts:645-670,813-852,930-992)
- **[research_citation]** sources: archive-gate.ts recovery + verifier: completeArchivedBundleRelease only runs when loadChange(active).data===null, commits under withArchiveProjectionLock, returns recoveryMutation:true. verifyReleaseGateDurableForArchive already accepts bundlePath; no identity check on bundlePath reads. recoveryMutation returned only from bundle repair. (plugin/src/tools/change/archive-gate.ts:483-705,707-791,793-868)
- **[research_citation]** sources: change-projection-transaction.ts fail-fast: commitChangeProjection fails closed with operator_required when the projection file is absent ('change not found'). Retire step cannot succeed with missing active projection. (plugin/src/storage/change-projection-transaction.ts:300-309,366-371)
- **[research_citation]** sources.omitted: 3 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Causal path CONFIRMED at source level. (1) Legacy bundle (lifecycleState open/absent via dominance, handlers-archive.ts:645-652) fails the reconcile gate at :653-659 (requires lifecycleState==='archived'); zero-delta changes also skip the delta-repair gate at :404-405, so the run enters the general path. (2) completeReleaseGateAfterFinalization sees loadChange(active).data===null (the only way 'repaired archive bundle' is observable) and routes to completeArchivedBundleRelease, which commits release+phase9 into the bundle under withArchiveProjectionLock and returns recoveryMutation:true (archive-gate.ts:719-734,544,644). (3) The proof at handlers-archive.ts:830 passes no bundlePath, so verifyReleaseGateDurableForArchive reads the absent ACTIVE projection and emits exactly the observed 'Cannot confirm release gate completion from disk projection (status: missing)' (archive-gate.ts:669-672,686). Typed routing choice is sound: bundlePath is an existing tested verifier input (archive-gate.ts:654; test :352-383), recoveryMutation is the exact typed discriminator of 'durable completion now lives in the bundle', single production call site, and the iff-condition is load-bearing — unconditional bundlePath would false-block normal archives because the bundle is written at :690 BEFORE release completion. Lock/proof consistency holds: repair commits under archive projection lock with in-lock readback verify and archived_at-preserving refresh; the unlocked post-commit proof read matches the established reconcile pattern; shipped-authoritative evidence bypass is spec-sanctioned (rq-releaseProjectionDurability01.4). Active-path regression risk LOW: strictly conditional on recoveryMutation===true; active-present and corrupt-active runs keep identical behavior (corrupt never routes to bundle recovery, pinned by test :241-276). CRITICAL GAP: the fix is necessary but NOT sufficient for the observed live failure. After the proof passes, the same run reaches the archive_transition retire (handlers-archive.ts:930-992) which mutates activeStore.paths.changes via coordinateChangeMutation — and commitChangeProjection fails closed on an absent projection (change-projection-transaction.ts:300-309,366-371), returning ARCHIVE_MUTATION_OPERATOR_REQUIRED ('Archive status transition was not verified.'). The live archive moves from blocked-at-proof to blocked-at-retire. Spec-mandated route for active-absent + surviving bundle is existing-bundle reconciliation 'without recreating active state' (rq-archiveTerminalDurability01.1; rq-releaseProjectionDurability01 main body/.3), i.e. reconcileArchivedBundleRetry — which the legacy bundle currently cannot reach purely because of the lifecycleState clause.
- **[archive_only_evidence]** verification: tests_run=pnpm --dir plugin exec vitest run src/tools/change.archive-phase9.test.ts src/tools/change/handlers-archive.partial-repair.test.ts, pnpm --dir plugin run typecheck, pnpm --dir plugin exec eslint src/tools/change/archive-gate.ts src/tools/change/handlers-archive.ts src/tools/change.archive-phase9.test.ts src/tools/change/handlers-archive.partial-repair.test.ts, pnpm --dir plugin exec prettier --check src/tools/change/archive-gate.ts src/tools/change/handlers-archive.ts src/tools/change.archive-phase9.test.ts src/tools/change/handlers-archive.partial-repair.test.ts results=pass — Focused archive recovery suites: 24/24 passed. TypeScript typecheck, scoped ESLint, and Prettier checks passed. git diff --check passed.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir plugin exec vitest run src/tools/change.archive-phase9.test.ts src/tools/change/handlers-archive.partial-repair.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir plugin run typecheck
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir plugin exec eslint src/tools/change/archive-gate.ts src/tools/change/handlers-archive.ts src/tools/change.archive-phase9.test.ts src/tools/change/handlers-archive.partial-repair.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir plugin exec prettier --check src/tools/change/archive-gate.ts src/tools/change/handlers-archive.ts src/tools/change.archive-phase9.test.ts src/tools/change/handlers-archive.partial-repair.test.ts
- **[unresolved_action]** required_main_agent_actions: Fix lifecycle-convergence-1 in plugin/src/tools/change/archive-gate.ts and add its focused regression test.
- **[unresolved_action]** required_main_agent_actions: Diagnose and repair the repository prompt-budget regression before acceptance/archive quality can be green.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/tools/change/handlers-archive.partial-repair.test.ts src/tools/change.archive-phase9.test.ts, pnpm --dir plugin run check results=fail — Focused Vitest passed: 2 files, 24 tests. `pnpm --dir plugin run check` reached prompt-budget validation and failed because floorBytes 232423 (+1142) exceeds 231281 and instructionCount 44 (+2) exceeds 42. The reviewed diff changes only four archive source/test files, so the check failure is not attributable to this diff, but it prevents independent green static verification.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/tools/change.archive-phase9.test.ts, pnpm --dir plugin exec tsc --noEmit results=pass — Focused archive terminal-proof suite passed: 1 file, 10 tests. TypeScript typecheck exited successfully. The repaired exact-replay guard now requires archived status; the added regression proves draft status triggers audited recovery, revision increment, and archived convergence.

## Contract / AC Coverage

No contract items.

## Unresolved Actions

- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir plugin exec vitest run src/tools/change.archive-phase9.test.ts src/tools/change/handlers-archive.partial-repair.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir plugin run typecheck
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir plugin exec eslint src/tools/change/archive-gate.ts src/tools/change/handlers-archive.ts src/tools/change.archive-phase9.test.ts src/tools/change/handlers-archive.partial-repair.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir plugin exec prettier --check src/tools/change/archive-gate.ts src/tools/change/handlers-archive.ts src/tools/change.archive-phase9.test.ts src/tools/change/handlers-archive.partial-repair.test.ts
- Fix lifecycle-convergence-1 in plugin/src/tools/change/archive-gate.ts and add its focused regression test.
- Diagnose and repair the repository prompt-budget regression before acceptance/archive quality can be green.
