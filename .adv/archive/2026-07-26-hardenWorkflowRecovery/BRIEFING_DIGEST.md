# Archive Briefing Digest

**Change ID:** hardenWorkflowRecovery
**Title:** Harden workflow recovery architecture
**Status:** archived
**Generated:** 2026-07-26T04:10:51.363Z

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

Showing 100 of 114 durable facts (14 omitted).

- **[unresolved_action]** required_main_agent_actions: Record durable RED/GREEN evidence with adv_run_test (phase:red and phase:green) because the adv-engineer sub-agent role firewall blocks adv_run_test. Shell evidence is preserved in this report.
- **[archive_only_evidence]** decisions: Made expectedRevision optional in commitChangeProjection — Disjoint recovery mutations must re-read latest and merge. Strict CAS would block second disjoint writer. Callers supply expectedRevision only for conflict-sensitive same-field mutations.
- **[archive_only_evidence]** decisions: Persisted bounded projection_commits audit trail — Design D3 requires bounded mutation/recovery audit metadata. 50-entry cap prevents unbounded projection growth.
- **[archive_only_evidence]** decisions: Left raw saveChange guard for later migration tasks — Foundation task scope is the primitive itself per task instructions. Broader caller migration and mechanical saveChange restriction belong to later tasks.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/storage/change-projection-transaction.test.ts (0) — 14/14 tests pass, including 100/100 concurrent disjoint writes and typed stale_revision for same-field race
- **[archive_only_evidence]** verification: cd plugin && pnpm run check (0) — schemas:check, typecheck, generate:manifests:check, test-isolation, lockfile-policy, lint, and format:check all green
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: shell-bin-oc-test-targeted-projection-tx
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: shell-pnpm-run-check
- **[archive_only_evidence]** decisions: Storage owns lock/latest read/revision compare/write/readback — Caller-level CAS cannot prevent stale whole-snapshot replacement.
- **[archive_only_evidence]** decisions: Expected revision is optional for mergeable disjoint intents and required for conflict-sensitive intents — Allows serialized latest-state field merge while preserving explicit conflict semantics.
- **[archive_only_evidence]** verification: whole-object last-writer-wins reproduction (1) — RED: disjoint whole-object writes lose one field.
- **[archive_only_evidence]** verification: projection transaction targeted suite (0) — GREEN: 14/14 including 100/100 concurrency and typed conflict.
- **[archive_only_evidence]** verification: pnpm run check (0) — VERIFY: all static/schema/type/manifest checks pass.
- **[archive_only_evidence]** decisions: Implemented ChangeMutationCoordinator as a pure tool-layer generic mutation function — Keeps authority and outcomes typed/testable without adding SDK types to workflow-reachable code.
- **[archive_only_evidence]** decisions: Mapped committed projection transaction outcome to recovered_verified only after primitive readback — Preserves design requirement that persistence completion alone is insufficient.
- **[archive_only_evidence]** decisions: Added a foundation gate-readiness adapter rather than migrating every tool — Full production migration remains Tasks 3/4; this task establishes the shared seam.
- **[archive_only_evidence]** verification: node executable reproduction of persistence success without downstream-visible postcondition (1) — RED: legacy success semantics allow save resolution without visible postcondition.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/change-mutation-coordinator.test.ts src/tools/change-mutation-readiness-adapter.test.ts (0) — GREEN: 29/29 coordinator and readiness-adapter tests pass.
- **[archive_only_evidence]** verification: pnpm run check (0) — VERIFY: schemas, types, manifests, isolation, lockfile, lint, and formatting pass.
- **[archive_only_evidence]** decisions: Replaced direct saveRecoveredReviewMatrix and saveRecoveredVerificationEvidenceDisposition with coordinateChangeMutation — Eliminates whole-object recovery writes and routes both healthy and recovery paths through the shared coordinator + commitChangeProjection, satisfying SC1/SC3/SC4
- **[archive_only_evidence]** decisions: Relaxed WorkflowHandleLike.query/signal to unknown definitions — Matches the storage/shared handle interface so typed signals and queries compile across the coordinator boundary
- **[archive_only_evidence]** decisions: Verification evidence disposition postcondition does not assert dispositionedAt — The timestamp is set at mutation time and will differ from the caller's captured expected value; taskId/concernKey/disposition/evidence are the identity fields
- **[archive_only_evidence]** verification: pnpm run check (0) — schemas:check, typecheck, manifest check, test isolation, lockfile policy, lint, and format:check all passed
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/contract.test.ts src/tools/verification-evidence.test.ts src/tools/incident-pair-migration.test.ts src/tools/change-mutation-coordinator.test.ts src/tools/change-mutation-readiness-adapter.test.ts (0) — All 61 targeted unit tests pass, including 100-iteration concurrent pair race for contract matrix + verification disposition
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: local-check-001
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: targeted-tests-001
- **[archive_only_evidence]** decisions: Migrated review matrix and verification disposition through coordinateChangeMutation — Eliminates whole-object recovery writers while preserving healthy Temporal signals.
- **[archive_only_evidence]** decisions: Used family-specific postconditions — Readback must prove exact gate-visible matrix and disposition fields.
- **[archive_only_evidence]** verification: node incident-pair whole-object lost-update reproduction (1) — RED: concurrent matrix/disposition whole-object recovery loses gate-visible matrix state.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- incident pair and coordinator suites (0) — GREEN: 61/61 tests pass, including 100-iteration concurrent incident pair.
- **[archive_only_evidence]** verification: pnpm run check (0) — VERIFY: all schema/type/manifest/isolation/lint/format checks pass.
- **[archive_only_evidence]** decisions: Routed active recovery writers through coordinator and conditional projection commit — Eliminates direct whole-object save paths while preserving Temporal-first behavior.
- **[archive_only_evidence]** decisions: Added mechanically checked saveChange allow-list — Prevents new unenumerated raw projection writers.
- **[archive_only_evidence]** decisions: Migrated Temporal dual-write projection through commitChangeProjection — All active projection writes must share the storage conditional boundary.
- **[archive_only_evidence]** decisions: Retained terminal/bundle exceptions in explicit inventory — Non-active projection formats and terminal imports have different invariants but must remain mechanically visible.
- **[archive_only_evidence]** verification: pre-migration raw saveChange inventory against 65f26ed0 (1) — RED: nine raw tool-layer saveChange callers existed before migration.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- six migrated-family suites (0) — GREEN: 321/321 tests pass.
- **[archive_only_evidence]** verification: pnpm run check (0) — VERIFY: schemas, types, manifests, isolation, lockfile, lint, format pass.
- **[archive_only_evidence]** decisions: Implemented fail-closed Worker Deployment readiness without enabling routing — Singleton self-roll cannot retain pinned old workers through drainage.
- **[archive_only_evidence]** decisions: Added candidate built-bundle replay verification and workflow evolution guard — Release safety requires actual worker bundle replay, not source-only confidence.
- **[archive_only_evidence]** decisions: Reclassified makeLegacyDesignValidation as immutable_history with exact event 479 evidence — It is the deliberate incompatible AC7 fixture; no historical proof supports adding a patch branch.
- **[archive_only_evidence]** decisions: Centralized TMPRL1100 replay classification — Keeps nondeterminism evidence typed and avoids distributed regexes.
- **[archive_only_evidence]** verification: node pre-fix self_healed replay-failure reproduction (1) — RED: fixture classified self_healed still fails replay with TMPRL1100 at event 479.
- **[archive_only_evidence]** verification: pnpm run build:worker (0) — Worker bundle built; generation db3c2da7088a…
- **[archive_only_evidence]** verification: pnpm exec tsx scripts/verify-candidate-worker-bundle.ts (0) — GREEN: candidate bundle verification passes; supported histories replay and immutable negative fails as expected.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- worker readiness/replay suites (0) — VERIFY: 67/67 worker readiness, evolution guard, replay classification, drift, and replay tests pass.
- **[archive_only_evidence]** verification: pnpm run check (0) — VERIFY: schemas, types, manifests, isolation, lockfile, lint, format pass.
- **[archive_only_evidence]** decisions: Added worker_bundle_impact to archive-phase9-splitbrain workflow seed — Release gate readiness now requires a typed worker_bundle_impact declaration; the fixture is not a worker-impacting change, so not_applicable with rationale is correct.
- **[archive_only_evidence]** decisions: Updated message contract test to include workerBundleImpactSet signal — The 64-signal surface includes workerBundleImpactSet; the 63-signal fixture and representative payload case were stale.
- **[archive_only_evidence]** decisions: Verified disk readback before using it for recovery readiness in completeGateViaRecovery — An unverified stale disk snapshot (leaked default fixture) was overriding the verified workflow-derived recovery gates; canCompleteGate verification ensures only authoritative disk projections are used.
- **[archive_only_evidence]** decisions: Added external citation comment for rq-releaseRepairRecovery01 in gate.ts — spec-citation-invariant requires every non-planned requirement to have an external citation in plugin/src code.
- **[archive_only_evidence]** decisions: Updated frozen registry/tool-surface snapshots and docs — cli-bridge-contract.test.ts, docs/cli-surface-matrix.md, and docs/tool-ownership.md are the owning source/generator for the canonical tool list and classification; keeping them in sync closes the frozen-asset drift.
- **[archive_only_evidence]** verification: bin/oc-test full (0) — Full plugin Vitest suite: 511 test files passed, 7573 tests passed, 1 skipped, 0 failures
- **[archive_only_evidence]** verification: cd plugin && pnpm run check (0) — schemas:check, typecheck, generate:manifests:check, test-isolation, lockfile-policy, lint, format:check all green
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/temporal/__tests__/archive-phase9-splitbrain.itest.ts src/temporal/messages.test.ts src/tools/gate.test.ts src/cli-bridge-contract.test.ts src/tool-name-assets.test.ts src/__tests__/spec-citation-invariant.test.ts (0) — Focused remediation set: 98/98 tests passed after fixes
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_full_suite_20260726
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_pnpm_check_20260726
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_focused_20260726
- **[archive_only_evidence]** decisions: Verified recovery disk readback through canCompleteGate before authority — Prevents stale/missing workflow state from overriding verified recovery projection.
- **[archive_only_evidence]** decisions: Updated worker-bundle tool/signal frozen assets at their owning docs/tests — Public exported surfaces require mechanically synchronized contracts.
- **[archive_only_evidence]** decisions: Classified the first full-run timeout through exact rerun and full-suite rerun — Evidence showed contention-only timeout; no unverified flake claim.
- **[archive_only_evidence]** verification: focused conformance failure set (1) — RED: 8 deterministic failures across phase9 recovery, frozen tool/signal assets, citation, and acceptance recovery.
- **[archive_only_evidence]** verification: focused remediation suite (0) — GREEN: 98/98 focused tests pass.
- **[archive_only_evidence]** verification: bin/oc-test full first run (1) — VERIFY retry trigger: single legacy-copoll 5s timeout after deterministic failures were fixed.
- **[archive_only_evidence]** verification: legacy-copoll targeted rerun (0) — Targeted timeout reproduction passes in 3.74s.
- **[archive_only_evidence]** verification: bin/oc-test full rerun (0) — Full suite passes on rerun.
- **[archive_only_evidence]** verification: pnpm run check (0) — All static/schema/type/manifest/isolation/lint/format checks pass.
- **[archive_only_evidence]** verification: pnpm run build:worker (0) — Current worker bundle built; generation db3c2da7088a…
- **[archive_only_evidence]** verification: candidate worker bundle replay (0) — Current candidate worker bundle replay passes supported histories and expected immutable negatives.
- **[report_follow_up]** follow_ups: Packet omitted TASK_SCOPE, IN_SCOPE, OUT_OF_SCOPE, DONE_WHEN, STOP_WHEN, and VERIFICATION anchors; report used user request as research scope.
- **[report_follow_up]** follow_ups: Verify installed Temporal Server/dev-server version and Worker Deployment API availability before planning Worker Deployments.
- **[report_follow_up]** follow_ups: Verify exact client-facing error behavior for queries while workflow-task replay is nondeterministic; official docs establish that query invokes its handler and failed workflow tasks retry, but this research did not reproduce the SDK error surface.
- **[research_citation]** sources: Temporal Worker Versioning: Authoritative Worker Deployment Version concepts: deployment name + Build ID, Current/Ramping/Draining/Drained lifecycle, pinned vs auto-upgrade, and version inheritance. (https://docs.temporal.io/worker-versioning)
- **[research_citation]** sources: Temporal Worker Deployments: Temporal recommends Worker Versioning for new production deployments; patching is fallback when versioned deployments cannot be supported. (https://docs.temporal.io/production-deployment/worker-deployments)
- **[research_citation]** sources: Temporal safe deployments: Workflow changes need deterministic safe-deployment mechanisms and replay testing. (https://docs.temporal.io/develop/safe-deployments)
- **[research_citation]** sources.omitted: 5 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Current workers omit WorkerDeploymentOptions, so they do not opt into Worker Deployments. The lockfile resolves Temporal SDK 1.17.2, while package ranges are ^1.16.0. The existing wf.patched/deprecatePatch convention plus committed replay histories is the actual compatibility control. The one-worker-per-project/session ownership model cannot safely use Pinned workflow routing by merely adding build IDs: a retired version must keep polling every relevant queue until all pinned runs drain, whereas an OOP bundle roll replaces its only child. Therefore Worker Deployments require a durable multi-version worker lifecycle before they become the primary compatibility mechanism.
- **[report_follow_up]** follow_ups: Packet omitted TASK_SCOPE, IN_SCOPE, OUT_OF_SCOPE, DONE_WHEN, STOP_WHEN, and VERIFICATION anchors; user request defined scope.
- **[report_follow_up]** follow_ups: Installed Temporal Server deployment capability was not verified because design defers enablement; future readiness check must prove it.
- **[report_follow_up]** follow_ups: Read-only review; no repository edits or runtime probes performed.
- **[research_citation]** sources: Approved agreement: Contract SC1-SC6, AC1-AC9, C1-C6, and DONT1-DONT6. (adv://change/hardenWorkflowRecovery/agreement)
- **[research_citation]** sources: Approved design: D1-D12 coordinator, recovery transaction, authority readback, migration, and deferred deployment readiness. (adv://change/hardenWorkflowRecovery/design)
- **[research_citation]** sources: Temporal Worker Versioning: Pinned workflows remain on one deployment version; prior versions continue polling while pinned work drains; Current/Ramping and Draining/Drained semantics. (https://docs.temporal.io/worker-versioning)
- **[research_citation]** sources.omitted: 3 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: D1-D2 preserve required healthy Temporal signal/receipt/query-refresh path; D5-D7 bind recovery verification and gate readiness to one authority-specific readback, avoiding cache authorization. D8 correctly defers Pinned Worker Deployments because Temporal requires old versions to continue polling while pinned workflows drain, but singleton self-roll replaces its only worker. D9-D12 provide incremental backward-compatible migration with legacy revision=0 parsing and archive-field preservation. However, D3's per-change file lock plus embedded revision is not a compare-and-swap at persistence boundary: a stale/non-cooperating writer can still write a stale whole object after reading revision N, and atomic save/rename does not conditionally reject that write. Design therefore does not yet prove SC3/AC2/AC3/C6 for required non-cooperating/stale-writer case.
- **[unresolved_action]** validation.blockers: D3 does not specify a durable conditional commit that compares current projection_revision at commit; lock + pre-write revision check cannot stop a later stale/bypassing whole-object save.
- **[report_follow_up]** follow_ups: Spawn packet omitted TASK_SCOPE, IN_SCOPE, OUT_OF_SCOPE, DONE_WHEN, STOP_WHEN, and VERIFICATION anchors; research used the user-provided diagnosis scope.
- **[report_follow_up]** follow_ups: No candidate dist/temporal/workflows.js existed in this worktree, so this run could not independently reproduce reported candidate error.
- **[research_citation]** sources: Temporal TypeScript SDK patching API: patched(id) replays false for histories predating its marker and true for histories carrying it; it must branch to old/new command sequences. deprecatePatch may not be used while unpatched workers or histories remain. (https://github.com/temporalio/sdk-typescript/blob/main/packages/workflow/src/workflow.ts)
- **[research_citation]** sources: Temporal TypeScript replay example: Official SDK example replays production histories against a prebuilt workflow bundle and treats per-history replay errors as determinism evidence. (https://github.com/temporalio/sdk-typescript/blob/main/packages/test/src/test-integration-split-one.ts)
- **[research_citation]** sources: Local classification law: Immutable histories require recoveryEvidence and recoveryTarget; all six fixtures require terminal classifications. (plugin/src/temporal/replay-history-classification.ts)
- **[research_citation]** sources.omitted: 1 additional source omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Choose immutable_history, not a speculative patch. The committed fixture has no recorded compatibility marker and currently claims self_healed despite the reported candidate/source TMPRL1100. The candidate verifier already implements the intended negative-fixture contract. A new patch is technically capable of routing markerless histories to an old command sequence, but no evidence establishes that one legacy sequence is safe for every markerless history or identifies the precise historical branch. The committed metadata/classification additionally name event 651 while the reported failure names event 479; reconcile this provenance before changing event fields.
- **[unresolved_action]** required_main_agent_actions: No remediation action required. Leave `plugin/src/temporal/gate-readiness.ts` trunk conflict and worktree freshness integration to release handling, per packet.
- **[wisdom_candidate]** wisdom_candidates: [pattern] Temporal projection writes must merge only an explicit workflow-owned field set into the transaction-locked latest projection; captured whole Change snapshots can erase concurrent disk-only recovery metadata.
- **[archive_only_evidence]** changes_made: plugin/src/storage/store-temporal/shared.ts: Added typed, explicit Temporal-owned projection policy and a field-local merge helper that preserves latest projection revision/audit and recovery-only fields.
- **[archive_only_evidence]** changes_made: plugin/src/storage/store-temporal/index.ts: Replaced captured whole-change dual-write callback with transaction-local `projectTemporalStateOntoLatest(latest, state)`; removed captured overlay copying.
- **[archive_only_evidence]** changes_made: plugin/src/storage/change-projection-transaction.test.ts: Added Temporal dual-write versus disjoint recovery-repair regression asserting both projections and audit metadata persist.
- **[archive_only_evidence]** verification: tests_run=../bin/oc-test targeted -- src/storage/change-projection-transaction.test.ts src/tools/incident-pair-migration.test.ts, ../bin/oc-test targeted -- src/tools/change-mutation-coordinator.test.ts src/tools/incident-pair-migration.test.ts, pnpm run check, ../bin/oc-test full results=pass — Focused transaction/incident tests: 2 files, 16 tests passed. Coordinator/incident tests: 2 files, 25 tests passed. `pnpm run check` passed after Prettier normalization. Full suite passed: 511 files passed, 1 skipped; 7,574 tests passed, 1 expected fail, 1 skipped, 12 todo. Existing transaction coverage retains same-revision conflicting-write stale behavior.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: ../bin/oc-test targeted -- src/storage/change-projection-transaction.test.ts src/tools/incident-pair-migration.test.ts

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| SC1 | success_criterion | pass |
| SC2 | success_criterion | pass |
| SC3 | success_criterion | pass |
| SC4 | success_criterion | pass |
| SC5 | success_criterion | pass |
| SC6 | success_criterion | pass |
| AC1 | acceptance_criterion | pass |
| AC2 | acceptance_criterion | pass |
| AC3 | acceptance_criterion | pass |
| AC4 | acceptance_criterion | pass |
| AC5 | acceptance_criterion | pass |
| AC6 | acceptance_criterion | pass |
| AC7 | acceptance_criterion | pass |
| AC8 | acceptance_criterion | pass |
| AC9 | acceptance_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| C4 | constraint | respected |
| C5 | constraint | respected |
| C6 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |
| DONT4 | avoidance | respected |
| DONT5 | avoidance | respected |
| DONT6 | avoidance | respected |
| OOS1 | out_of_scope | missing |
| OOS2 | out_of_scope | missing |
| OOS3 | out_of_scope | missing |
| OOS4 | out_of_scope | missing |

## Unresolved Actions

- Record durable RED/GREEN evidence with adv_run_test (phase:red and phase:green) because the adv-engineer sub-agent role firewall blocks adv_run_test. Shell evidence is preserved in this report.
- verification_missing: No durable adv_run_test evidence found for run_id: shell-bin-oc-test-targeted-projection-tx
- verification_missing: No durable adv_run_test evidence found for run_id: shell-pnpm-run-check
- verification_missing: No durable adv_run_test evidence found for run_id: local-check-001
- verification_missing: No durable adv_run_test evidence found for run_id: targeted-tests-001
- verification_missing: No durable adv_run_test evidence found for run_id: tr_full_suite_20260726
- verification_missing: No durable adv_run_test evidence found for run_id: tr_pnpm_check_20260726
- verification_missing: No durable adv_run_test evidence found for run_id: tr_focused_20260726
- D3 does not specify a durable conditional commit that compares current projection_revision at commit; lock + pre-write revision check cannot stop a later stale/bypassing whole-object save.
- No remediation action required. Leave `plugin/src/temporal/gate-readiness.ts` trunk conflict and worktree freshness integration to release handling, per packet.
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: ../bin/oc-test targeted -- src/storage/change-projection-transaction.test.ts src/tools/incident-pair-migration.test.ts
