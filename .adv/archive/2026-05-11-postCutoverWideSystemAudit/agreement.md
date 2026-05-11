# Discovery Agreement

## Discovery Summary

The system is not in a broken state. Core architecture is mostly sound: Temporal signal/query direction aligns with LBP, workflow-bundle boundaries are guarded, cache-refresh discipline exists, and cross-project confirmation is structurally enforced. The remaining work is cleanup and hardening around post-cutover seams, file-size/complexity hotspots, archive/listing correctness, diagnostics performance, and upstream OpenCode friction.

## Current State Evidence

- Roadmap snapshot is fresh and shows 0 open bugs, 32 open features.
- Recent GitHub issue trend since 2026-05-01: 59 closed issues, including many ADV bugs around archive, Temporal, worktree, validation, status, cache, and worker health.
- Active changes in flight: `postCutoverWideSystemAudit`, `optimizeAdvCommandTokenLoadVia`, `updateAdvTriagePhase3bUse`, `fixForcedWorktreeDelete`.
- Pending agenda now has 13 items after housekeeping; remaining items mostly align with open roadmap features (#64, #66, #68, #69, #71, #78-84).
- `adv_change_validate` passes for this change with expected pre-prep warnings: `NO_TASKS`, `NO_DELTAS`.
- `adv_change_list includeArchived:true` timed out once at 10s while active-only list and Temporal diagnose were healthy; this is discovery evidence of archived-listing/perf fragility, not a blocker.

## Key Findings

### Code Quality

1. Tool implementation files remain oversized and multi-concern:
   - `plugin/src/tools/change.ts` (~2553 lines) combines create/list/show/update/archive/close/reenter/validate/cross-project behavior.
   - `plugin/src/tools/worktree/index.ts` (~2140 lines) spans state adapters, git helpers, create/resume/delete/cleanup, legacy wrappers.
   - `plugin/src/tools/status.ts` (~1139 lines) mixes health, hygiene, recommendations, target-project views.
2. Existing backlog already covers some cleanup:
   - #82 complexity reduction
   - #83 long factory closures
   - #84 unused type exports
3. Safe direct cleanup candidates found:
   - stale `safeUpdateHandler` comments after signal cutover
   - PSW retired comments after project-state-workflow retirement
   - worktree header/comments referring to OCX/SQLite legacy language
   - ignored local `scripts/provider-eval-results/` run output cleanup

### Architecture

1. Temporal direction is aligned: signal/query per-change workflow architecture is the correct long-term path; no Temporal replacement recommended.
2. Remaining seam risk is in recovery/listing/projection complexity:
   - `store-temporal/index.ts` read fallback combines workflow query, disk reseed, terminal/archive short-circuit, poisoned-history handling, visibility, disk, and archive sources.
   - archive/listing paths can produce stale or misleading state when disk projections and archive bundles disagree.
3. Follow-up needed to reconcile #99 traceability with shipped structural traceability code/tests.
4. External ADV-owned issue signals remain important: worker bundle stale-cache, archive partial-write, dangling commits/branch-deletion blindness, and target_path routing gaps.

### Performance

1. Status/health surfaces still have likely redundant probes:
   - `getTemporalWorkerDiagnostics()` called during queue serviceability without a TTL cache.
   - `getTemporalHealth(projectId)` called separately despite existing `healthSnapshotCache` for broader snapshot.
2. `adv_change_list includeArchived:true` timeout suggests archived/terminal listing path needs investigation or pagination optimization.
3. Potential follow-up: adaptive batching for change listing instead of fixed `CHANGE_LIST_BATCH_SIZE = 20`.

### DX / Agent UX

1. Stale terminology and comments still confuse future agents: Update vs Signal, PSW retired, SQLite/OCX worktree language.
2. Live-dist/worker-bundle stale-cache remains a recurring class; docs mostly cover it, but tool descriptions and archive/restart paths may need sharper warnings.
3. Upstream OpenCode risks matter:
   - subagent tool access regression
   - MCP process leaks
   - agent prompt frontmatter/body override
   - prompt/tool schema token bloat
   - git process contention / snapshot race
4. Cross-project task mutation routing is still a known high-risk area from external signals.

## Recommended Objectives

1. Produce a durable audit report in-repo or in the change notes with evidence and disposition for each finding.
2. Apply safe direct cleanup in this change:
   - refresh stale post-cutover comments/terminology
   - remove ignored generated provider-eval run outputs if present in the worktree
   - small doc/tool-description clarity edits where behavior is unchanged
3. Create or update follow-up backlog items for risky findings not already tracked:
   - archived/terminal listing timeout and state shadow fragility
   - status/health probe TTL caching
   - projection mismatch audit
   - dangling commit / branch reachability checks if not already fully represented
   - target_path routing audit for task mutation tools if not already fully represented
4. Reconcile known backlog items to avoid duplicates (#82, #83, #84, #99, #104, #72, #105).
5. Keep broad architecture/behavior changes out of this audit change; those require separate ADV changes.

## Draft Spec Deltas

No immediate spec delta is required for discovery. Potential future deltas may be needed for:

- archived/terminal listing correctness
- structured task checkpoint commit refs / branch reachability
- status probe caching expectations
- cross-project task mutation routing guarantees

## LBP Check

Aligned. Mature practice for a solo-maintainer internal system is not an external stability scoreboard; it is evidence-backed cleanup inventory plus targeted fixes. Temporal signal/query architecture remains LBP-aligned. Release automation and stability declaration are separate concerns and out of scope.

## Ambiguity Analysis

Coverage: B:C F:C S:C M:C

No blocking ambiguity findings.

- Boundaries clear: proposal explicitly includes wide audit and excludes Temporal replacement, dashboard, release cut, and broad rewrites.
- Functional scope clear: audit + safe cleanup + follow-up filing.
- Completion signals clear: report, evidence, safe cleanup, follow-up work, duplicate reconciliation, verification.
- Missing information handled: open unknowns moved into design/prep rather than blocking discovery.

## Discovery Checklist

| Step | Status | Evidence |
|---|---|---|
| Skills considered | PASS | adv-tron/explore/librarian-style recon used; no new skill needed |
| Prior research extension | PASS | Project wisdom, roadmap, recent issues, external OpenCode signals cited |
| Conflict scan | PASS | Active changes and agenda reconciled; no blocking conflict |
| Edge cases | PASS | Projection mismatch, cross-worker cache, target_path routing, stale bundle, dangling commits |
| Design questions | PASS | Direct cleanup vs follow-up boundaries identified |
| Draft spec deltas | PASS | No immediate deltas; future delta candidates listed |
| Related-pattern scan | PASS | Temporal/cache/archive/worktree/status patterns scanned |
| LBP check | PASS | Audit/cleanup direction aligned; Temporal replacement rejected |