# Archive: Add workflow replay checks

**Change ID:** addWorkflowReplayChecks
**Archived:** 2026-05-22T15:06:26.693Z
**Created:** 2026-05-22T05:58:01.168Z

## Tasks Completed

- ✅ Add replay fixture harness and incident-class compatibility check
  > Added committed sanitized fixGateAutoWorktree replay fixture plus metadata and a replay-determinism Vitest using Worker.runReplayHistory. The fixture covers the observed TMPRL1100 class where legacy discovery gate completion scheduled inspectArtifactActivity at event 182 before search-attribute upsert. Added a targeted wf.patched compatibility branch for discovery contract readiness so legacy histories without the marker replay the old no-contract-blocker path, while new histories retain typed contract enforcement. Gate readiness gained an explicit enforceDiscoveryContract option for structural branching.
- ✅ Add per-change worktree query poison isolation
  > Changed listWorktreesAcrossChanges to return a structured result with records, warnings, poisonedWorkflows, and unavailable. Added per-change try/catch around getWorktreesQuery so one poisoned workflow no longer hides healthy worktrees. Reused recovery-probe and recovery-classification helpers to classify poisoned describe evidence and completed/missing workflow errors. Added bounded evidence summaries via recovery-probe. Updated backlog default worktree provider to consume result.records. Added tests for healthy+poisoned workflow query isolation.
- ✅ Expose automation-first poisoned workflow metadata in adv_wip_state
  > Extended adv_wip_state with additive poisoned_workflows output. Added WipPoisonedWorkflowEntry with source:'worktrees' and normalized structured worktree provider results from listWorktreesAcrossChanges. Preserved human-readable warnings by mapping per-worktree workflow warnings into the existing warnings array. Kept legacy array-returning test providers compatible. Added tests for empty poison metadata and healthy worktrees plus poisoned workflow metadata.
- ✅ Update replay/versioning/recovery specs and runbook
  > Added advance-workflow requirement rq-workflowVersioning01 for committed replay verification, command-producing workflow evolution strategy, patch deprecation/rationale, and worker-restart caveat. Added backlog-coordination rq-wipPoisonIsolation01 for adv_wip_state poisoned_workflows plus warning preservation and read-only triage posture. Added worktree-lifecycle rq-worktreePoisonVisibility01 for per-change query isolation, structured poison metadata, and explicit unavailable results. Updated docs/specs mirrors where present and docs/temporal-recovery.md with replay/versioning decision table and poisoned WIP read-only posture.
- ✅ Run full verification and release-readiness checks
  > Task checkpoint completed

## Specs Modified


## Wisdom Accumulated

- **[pattern]** For cross-change Temporal visibility readers, return a structural partial-result object (`records`, `warnings`, `poisonedWorkflows`, `unavailable`) instead of throwing or returning a raw array. Wrap each per-workflow query in its own try/catch, classify with existing recovery probes/classifiers, and continue so one poisoned workflow cannot hide healthy WIP.
- **[gotcha]** Replay failure `UpsertWorkflowSearchAttributesMachine does not handle HistoryEvent(... ActivityTaskScheduled)` can mean current readiness logic skipped an activity that legacy history scheduled, not that search-attribute code itself is wrong. Inspect the signal payload and event window around the failing event, then patch the exact command-producing branch (`wf.patched`) so old histories replay the old activity path.
- **[pattern]** When evolving tool provider seams from arrays to structured partial results, keep a normalization layer that accepts both the old array shape and the new object shape. This preserves existing tests/callers while allowing richer automation metadata such as `poisoned_workflows`.
- **[gotcha]** Spec JSON files are not part of `pnpm run format:check`; running Prettier over whole spec JSON can create noisy unrelated diffs. For spec-law edits, preserve existing JSON formatting and validate with JSON parse/adv_change_validate, while applying Prettier only to markdown mirrors/docs that are checked for readability.
- **[gotcha]** Adding new spec requirements requires external citations outside docs/specs and the spec.json itself. The invariant fails even when implementation tests pass. Add `rq-*` anchors near the implementing code/tests (e.g. replay test, backlog tool, worktree state) before full-suite verification.
