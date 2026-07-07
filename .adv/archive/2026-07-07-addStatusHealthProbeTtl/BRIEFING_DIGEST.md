# Archive Briefing Digest

**Change ID:** addStatusHealthProbeTtl
**Title:** Add status health probe TTL
**Status:** archived
**Generated:** 2026-07-07T16:06:41.616Z

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

Epic: optimizeAdvPerformanceStructure · Add status health probe TTL (order 3)

## Durable Facts

Showing 20 of 20 durable facts.

- **[archive_only_evidence]** sources: probe-cache.ts: ProbeCacheFreshness has only cached_at/stale/error (no age_ms/ttl_ms). forceRefresh already fully plumbed through fetch() into LRU fetchMethod. ttlMs and cachedAtMs already computed centrally (line 62,120).
- **[archive_only_evidence]** sources: backlog.ts + roadmap.ts freshness: Existing age_ms/ttl_ms freshness contract + forceRefresh arg + refresh_reason pattern already shipped for the roadmap/backlog probe. Reusable naming + shape precedent.
- **[archive_only_evidence]** sources: temporal-ops.ts safety pattern: isRestartServiceabilityVerified refuses stale for safety-critical restart proof (serviceable && !stale). Already forces forceRefresh:true in the verification wait loop. Canonical non-stale-authority pattern to preserve.
- **[archive_only_evidence]** sources: status-view.ts: buildStatusViewPlan already gates providers per view; health view already surfaces _freshness (line 211); summary view already omits detailed probes. Design only needs to enrich existing _freshness, not add new plumbing.
- **[archive_only_evidence]** sources: status.ts probeFreshness assembly + args: adv_status args = view + scope only (no forceRefresh yet). probeFreshness map already assembled per-probe and attached as _freshness. Threading forceRefresh is a localized addition.
- **[archive_only_evidence]** sources: spec advance-meta rq-statusProbeCache01: Spec already mandates _freshness with cached_at/stale/optional error and stale-diagnostic-only safety. age_ms/ttl_ms + forceRefresh are additive extensions requiring a spec body update, not a new requirement.
- **[archive_only_evidence]** architecture_assessment: The draft design substantially overstates net-new work. forceRefresh already exists end-to-end in createProbeCache.fetch (probe-cache.ts:30,100) — no new cache plumbing is required; the only gap is (a) adding age_ms/ttl_ms to ProbeCacheFreshness computed centrally (ttlMs + cachedAtMs are already in scope at line 62/120), (b) adding an optional forceRefresh arg to adv_status and threading it into the ~5 fetchStatus* wrappers, and (c) a spec body update. The age_ms/ttl_ms naming and forceRefresh+refresh_reason shape already have a shipped precedent in backlog.ts/roadmap.ts — reuse it verbatim for cross-surface consistency. The safety boundary the draft calls out is already structurally enforced by isRestartServiceabilityVerified (serviceable && !stale) in temporal-ops.ts, which is a separate uncached verification path and must NOT consume the advisory status _freshness — the design should assert this boundary is unchanged rather than re-implement it. Summary lightness is already guaranteed by buildStatusViewPlan; no extra guard needed beyond a regression test.
- **[agenda]** follow_ups: Implementation: add test asserting adv_status forceRefresh on summary view force-refreshes temporal_health yet still omits _freshness (guards AC3+AC2 interaction).
- **[agenda]** follow_ups: Spec: run schemas/spec validation after amending rq-statusProbeCache01 so new scenarios (age_ms, ttl_ms, status-facing forceRefresh, diagnostic-only stale) are covered (AC6).
- **[archive_only_evidence]** sources: advance-meta spec rq-statusProbeCache01 (Bounded Cached Health Probes): Requires _freshness (cached_at, stale, optional error); coalesced probes; stale data diagnostic-only and must not authorize safety-critical mutations (restart/reclaim/override/unlock/archive). Design D1/D4/D5 align; adding age_ms/ttl_ms is an additive superset.
- **[archive_only_evidence]** sources: plugin/src/tools/probe-cache.ts: createProbeCache already computes cached_at/stale/error centrally at cache boundary and already threads {forceRefresh} into cache.fetch (line 100). D1 (central age_ms/ttl_ms) and D2 forceRefresh plumbing are minimal additive extensions to existing code, not new architecture.
- **[archive_only_evidence]** sources: plugin/src/tools/status-view.ts buildStatusViewPlan + applyStatusView: Summary view projection emits only temporal_health_ok boolean and worktree_count; _freshness is projected ONLY in health view (line 211). D3/AC3 structurally satisfied by existing projection — summary cannot leak detailed _freshness.
- **[archive_only_evidence]** sources: plugin/src/tools/temporal-ops.ts isRestartServiceabilityVerified: Guard is (status===serviceable && !stale), consumed at restart gate line 655. D4 preserves this stale-safety boundary; AC5/DONT stale-safety guard is intact and independent of adv_status freshness enrichment.
- **[archive_only_evidence]** sources: lru-cache FetchOptions docs (Context7 /isaacs/node-lru-cache): forceRefresh:boolean forces re-fetch even if cached and not stale. allowStaleOnFetchAbort/allowStaleOnFetchRejection return stale on bounded abort/rejection. Confirms D2 claim: forceRefresh:true refreshes (AC2) while preserving stale-on-timeout fallback (AC4).
- **[archive_only_evidence]** architecture_assessment: Design is additive over an already-correct probe-cache architecture. All four key anchors verified in source: (1) createProbeCache centrally derives freshness at the cache boundary and already threads forceRefresh; (2) buildStatusViewPlan selects advisory probes per view; (3) applyStatusView projects _freshness only in health view, guaranteeing summary lightness structurally; (4) isRestartServiceabilityVerified enforces serviceable && !stale for safety-critical restart. Adding age_ms/ttl_ms to ProbeCacheFreshness and a public adv_status.forceRefresh confined to view-plan-selected advisory caches does not touch status load, change/task/gate reads, contract state, archive decisions, mutation readiness, Temporal replay surface, or spec/tool boundaries. lru-cache forceRefresh + stale-on-abort/rejection semantics are documented and already configured (allowStale/allowStaleOnFetchAbort/allowStaleOnFetchRejection/ignoreFetchAbort). Naming reuse (age_ms/ttl_ms) matches backlog/roadmap freshness precedent. Updating rq-statusProbeCache01 in place (D5) rather than minting a new requirement is correct: the new fields are a superset of the same requirement's freshness contract.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/tools/probe-cache.test.ts src/tools/status.test.ts src/tools/temporal-ops.test.ts src/deploy-local.test.ts src/adv-stability-docs-assets.test.ts, pnpm run schemas:check results=pass — Targeted suite passed: 5 files, 138 tests. schemas:check completed successfully via tsx scripts/generate-json-schemas.ts --check.
- **[unresolved_action]** required_main_agent_actions: For release, preserve caveat that live ADV tool behavior cannot be proven in current cached OpenCode process until plugin is built, deployed, and session/plugin host restarted.
- **[unresolved_action]** required_main_agent_actions: If final release path requires freshest merge proof, rerun merge-compatibility dry-run after the latest formatting commit as noted in the context packet.
- **[archive_only_evidence]** verification: tests_run=Path preflight for all affected files, Source review of .adv/specs/advance-meta/spec.json, plugin/src/tools/probe-cache.ts, plugin/src/tools/status-health.ts, plugin/src/tools/status.ts, plugin/src/tools/probe-cache.test.ts, plugin/src/tools/status.test.ts, plugin/src/tools/temporal-ops.test.ts, plugin/src/deploy-local.test.ts, git status --short, bin/oc-test targeted -- src/tools/probe-cache.test.ts src/tools/status.test.ts src/tools/temporal-ops.test.ts src/deploy-local.test.ts src/adv-stability-docs-assets.test.ts results=pass — Path preflight OK for 8 affected files. Source review found probe freshness metadata (cached_at/stale/age_ms/ttl_ms/error), forceRefresh scoped to selected status probes, summary projection without detailed _freshness payload, stale serviceability rejected for restart proof, and spec/test coverage for rq-statusProbeCache01. Targeted verification passed: 5 test files, 138 tests. git status --short produced no output after verification. First task-scoped submission using TASK: release-hardening was rejected because that task anchor does not exist; persisted as independent harden release summary per tool guidance.
- **[epic_terminal_note]** epic.membership: optimizeAdvPerformanceStructure · Add status health probe TTL (order 3)

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| SC1 | success_criterion | pass |
| SC2 | success_criterion | pass |
| SC3 | success_criterion | pass |
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
| OOS1 | out_of_scope | respected |
| OOS2 | out_of_scope | respected |
| OOS3 | out_of_scope | respected |
| OOS4 | out_of_scope | respected |
| OOS5 | out_of_scope | respected |

## Unresolved Actions

- For release, preserve caveat that live ADV tool behavior cannot be proven in current cached OpenCode process until plugin is built, deployed, and session/plugin host restarted.
- If final release path requires freshest merge proof, rerun merge-compatibility dry-run after the latest formatting commit as noted in the context packet.
