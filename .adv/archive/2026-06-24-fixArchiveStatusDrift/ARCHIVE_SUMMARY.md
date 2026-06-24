# Archive: Fix archive status drift

**Change ID:** fixArchiveStatusDrift
**Archived:** 2026-06-24T19:04:05.953Z
**Created:** 2026-06-24T02:40:11.544Z

## Tasks Completed

- ⏭️ Verify Advance status fix and live reload boundary
- ⏭️ Fix /adv-status archive-bundle dominance
- ⏭️ Add archive/status drift regression coverage
- ✅ Implement archive finalization recovery and failed phase9 classification
  > Added regression coverage for existing-bundle PR-merged pending_merge recovery, including PR route/prNumber reachability proof, phase9_status done recording, and archive status save. Added regression coverage for phase9_status failed with missing structural proof, requiring a phase9Failure classification and no archive status save. Implemented buildFailedPhase9Classification and sync-path phase9_status done recording after durable release gate proof and before archive status transition.
- ✅ Implement bounded status summary before enrichment
  > Added summary view caps: recent changes are sliced to 10 before recentChangeEnrichment, preventing unbounded store.changes.get/readArtifact work on large WIP sets. Added recommendation cap of 10 plus an omitted-count marker. Summary projection now exposes changes.omitted and recommendations_omitted. Regression covers 120 recent changes, 15 recommendations, capped enrichment calls, and omitted markers.
- ✅ Add archive/status repair spec requirements
  > Bumped advance-workflow to 1.21.0 with rq-archiveRecoveryConsistency01 covering PR-merged pending_merge recovery, failed phase9 fail-closed classification, status repair read-after-write visibility, target direct-or-packet behavior, and no direct external ADV state edits. Bumped advance-meta to 1.17.0 with rq-advStatusBoundedSummary01 covering summary recent cap before enrichment, recommendation cap with omitted marker, and detailed-view drilldowns. Updated docs/spec mirrors, version asset expectations, and code citations for spec-citation invariant.
- ✅ Implement repair read-after-write verifier and target direct-or-packet path
  > Added verifyStatusRepairReadAfterWrite to require canonical readback after disk-projection status repair: store.changes.get reports archived, in-flight list excludes the change, and archived list includes it exactly once. Extended adv_change_status_repair with target_path/target_confirmed/confirmationEvidence routing via withTargetPathStore; non-serviceable target mutation fails closed with a same-project targetRepairPacket. Added regression coverage for readback mismatch, target_store routing/project context, target serviceability packet fallback, and real recovery writer no-refresh behavior.
- ✅ Run full repository verification and report live reload boundary
  > Task checkpoint completed

## Specs Modified


## Wisdom Accumulated

- **[gotcha]** Archive sync recovery can finish release/status without touching phase9_status; PR-merged pending_merge recovery should record phase9_status done after durable release-gate proof and before archived status save so future status/repair reads do not see stale pending_merge/failed state.
- **[pattern]** For status performance fixes, cap summary-view recent changes immediately after scope filtering and before enrichment. Capping only in applyStatusView still pays the per-change enrichment/readArtifact cost and does not solve large-WIP latency.
- **[gotcha]** Read-after-write verification tests around disk-direct recovery writers must model the post-write canonical read path explicitly. saveRecoveredChangeStatus bypasses store.changes.save/refresh by design, so unit mocks will not observe archived state unless get/list readbacks are updated or backed by real disk projection.
