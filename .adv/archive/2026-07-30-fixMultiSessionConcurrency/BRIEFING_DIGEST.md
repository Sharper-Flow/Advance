# Archive Briefing Digest

**Change ID:** fixMultiSessionConcurrency
**Title:** Fix multi-session concurrency defaults
**Status:** archived
**Generated:** 2026-07-30T17:21:16.692Z

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

Showing 100 of 112 durable facts (12 omitted).

- **[archive_only_evidence]** decisions: Added generic boundedRetry helper to plugin/src/utils/fs.ts — Extracts the backoff-loop shape from the existing file lock so worktree create can reuse it while keeping stale-holder semantics in worker-lock unchanged.
- **[archive_only_evidence]** decisions: Injected clock/sleep/random through AdvWorktreeCreateDeps.contention — Allows deterministic tests to prove retry behavior without real sleeps; production defaults stay 1500ms budget/25ms base/250ms cap.
- **[archive_only_evidence]** decisions: Added a post-lock duplicate worktree reuse check — Prevents duplicate branch/path registration when a peer session creates the worktree while the current session is waiting for the lock.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/worktree/index-create.test.ts (0) — 27 tests pass (RED before implementation, GREEN after)
- **[archive_only_evidence]** verification: bin/oc-test smoke (0) — Smoke checks and 94 tests pass
- **[archive_only_evidence]** verification: cd plugin && pnpm run check (0) — schemas:check, typecheck, manifests:check, lint, format:check pass
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: oc-test-targeted-worktree-create-2026-07-29
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: oc-test-smoke-2026-07-29
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: pnpm-check-2026-07-29
- **[archive_only_evidence]** decisions: Bind latest report to durable adv_run_test evidence — Clears verification_missing warning from pre-adv_run_test engineer report.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/worktree/index-create.test.ts (0) — Durable verification: 27/27 worktree create contention tests passed.
- **[archive_only_evidence]** decisions: Centralized feature policy resolution in resolveProjectFeaturePolicy — Eliminated three duplicate private readBooleanFeatureFlag readers and made worker_singleton_enforce/worktree_queue_mode a single source of truth
- **[archive_only_evidence]** decisions: Derived workflowQueueMode from resolved worker_singleton_enforce value — Project mode (singleton) forces project-wide queue; session mode routes to per-session queue
- **[archive_only_evidence]** decisions: Added safe refusal when project mode has active session-pinned workflows — Prevents split-brain where singleton worker would orphan RUNNING workflows still on session queues
- **[archive_only_evidence]** decisions: Left ProjectConfigSchema strict on invalid feature values — Existing integration test and json.test.ts expect schema_error for invalid tdd_enforcement; invalid_fallback source is exercised directly via resolveProjectFeaturePolicy unit tests
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/types/project.test.ts src/tools/status.test.ts src/temporal/workflow-start.test.ts src/storage/store-temporal/changes.test.ts src/tools/task.test.ts src/tools/worktree-auto-manage.test.ts src/plugin-init.worker-singleton.test.ts (0) — All 229 tests pass across 7 targeted test files
- **[archive_only_evidence]** verification: cd plugin && pnpm run check (0) — schemas:check, typecheck, manifest:check, frontmatter, test-isolation, lockfile, lint, and format:check all pass (3 pre-existing eslint warnings in manifest-frontmatter.ts unrelated to this change)
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: oc-test-targeted-fixMultiSessionConcurrency-20260729
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: pnpm-run-check-20260729
- **[archive_only_evidence]** decisions: Bind latest report to durable adv_run_test evidence — Clears verification_missing warning from pre-adv_run_test engineer report.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/types/project.test.ts src/tools/status.test.ts src/plugin-init.worker-singleton.test.ts (0) — Durable verification: 82/82 policy/status/routing tests passed.
- **[archive_only_evidence]** decisions: Invoke local trunk sync from archive handler after canonical remote merge proof — Executable narrow seam without changing release authority.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/archive-helpers/git-finalize.test.ts src/tools/change.archive-phase9.test.ts (0) — Durable verification: 204/204 archive helper and Phase 9 tests passed.
- **[archive_only_evidence]** decisions: Implemented collector as injectable read-only utility rather than ADV tool or synthetic load generator — Task scope is research/source_audit evidence; must avoid starting sessions/workflows, polling, or target repo mutation. Injectable defaults allow fixture tests and real data sampling without runtime coupling.
- **[archive_only_evidence]** decisions: Historical peak (12 total/6 orchestrators) is preserved as authoritative baseline while current session DB metadata defaults sessions to sub-agent — OpenCode session DB stores null metadata in this environment, so live orchestrator/sub-agent split is not inferable; separating historical baseline from current samples preserves population identity and prevents unsupported orchestrator claims.
- **[archive_only_evidence]** decisions: Report explicitly states ten-orchestrator latency was not measured — Acceptance criterion AC3 forbids claiming measured ten-orchestrator latency; the report renders this claim as false and includes a limits line.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/utils/concurrency-evidence-collector.test.ts (0) — 13/13 fixture/query tests pass
- **[archive_only_evidence]** verification: pnpm --dir plugin run check (0) — schemas:check, typecheck, manifest:check, frontmatter, test-isolation, lockfile-policy, lint, format:check all pass (only pre-existing manifest-frontmatter warnings)
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: targeted-concurrency-evidence-collector-test
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: pnpm-check
- **[archive_only_evidence]** decisions: Computed live observed counts as sweep-line peaks over verified [startedAt, endedAt) session intervals. — Session row counts do not establish concurrency; end-before-start tie ordering prevents adjacent sequential intervals from overlapping.
- **[archive_only_evidence]** decisions: Represented unproven session roles as undefined and reported a separate unknown-role peak. — A missing or non-classifying metadata record cannot prove sub-agent membership.
- **[archive_only_evidence]** decisions: Retained the recorded 12-agent/6-orchestrator historical baseline as separately sourced evidence. — Historical evidence supports the historical demand claim but is not merged with current interval samples.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/utils/concurrency-evidence-collector.test.ts (0) — 15 collector tests passed, including verified-interval sweep peak, unknown role, and source-unavailable coverage.
- **[archive_only_evidence]** verification: pnpm --dir plugin run check (0) — Schemas, typecheck, manifests, isolation, lint, and formatting checks passed; pre-existing lint warnings remain warnings only.
- **[archive_only_evidence]** decisions: Compute all current peaks inside verified project partitions, then report the maximum per-project peak. — Intervals from distinct project identities cannot establish one shared concurrency population.
- **[archive_only_evidence]** decisions: Exclude globally sampled sessions without a verified project identity from peak claims while retaining samples and an explicit limit. — Preserves evidence visibility without making cross-project or unidentified-population claims.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/utils/concurrency-evidence-collector.test.ts (0) — 16 collector tests pass, including the cross-project overlap fixture and markdown report assertions.
- **[archive_only_evidence]** verification: pnpm run check (0) — Typecheck, schema and manifest checks, lint, and formatting checks pass; existing unrelated lint warnings remain warnings.
- **[archive_only_evidence]** verification: bun scripts/generate-concurrency-evidence-report.ts (0) — Regenerated docs/ten-agent-concurrency-evidence.md from the corrected collector.
- **[archive_only_evidence]** decisions: Downgraded rq-workerSingleton01 from MUST to SHOULD with an explicit-true conditional preamble — Default per-session routing means each session spawns its own worker; singleton enforcement is now an opt-in compatibility mode, preventing an active law from mandating client-only peers under the default policy.
- **[archive_only_evidence]** decisions: Rewrote rq-temporalConcurrentLoad01 around a ten total-agent evidence boundary that distinguishes orchestrators from sub-agents and forbids synthetic latency claims — Aligns the spec with the approved agreement: demand is derived from historical/current observation (12 total/6 orchestrators), not a measured synthetic benchmark.
- **[archive_only_evidence]** decisions: Added worker_singleton_enforce to the governed public FeatureFlagsSchema/Zod schema with default false — One typed resolver/source classifier now feeds runtime, diagnostics, and the published project.schema.json, matching KD1.
- **[archive_only_evidence]** decisions: Regenerated docs/specs/advance-meta.md via generateSpecDoc instead of hand-editing — The docs/specs directory is a generated mirror produced by plugin/src/archive/docs.ts at archive time; regeneration preserves the deterministic spec-to-doc contract.
- **[archive_only_evidence]** verification: bin/oc-test smoke (0) — schemas:check, typecheck, generate:manifests:check, frontmatter/test-isolation/lockfile checks, lint, format:check, and smoke tests all passed
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/__tests__/spec-deltas-cull.test.ts src/deploy-local.test.ts src/adv-stability-docs-assets.test.ts src/trunk-write-firewall-spec-assets.test.ts src/types/project.test.ts src/manifest-doc-drift.test.ts src/__tests__/spec-citation-invariant.test.ts src/__tests__/no-retired-tool-spec-refs.test.ts src/adv-status-cli-assets.test.ts src/tool-ownership-assets.test.ts (0) — All 137 targeted spec/schema/static assertions passed
- **[archive_only_evidence]** verification: pnpm run schemas:generate && pnpm run schemas:check (0) — Regenerated and verified 9 JSON schemas including project.schema.json with worker_singleton_enforce default false
- **[archive_only_evidence]** verification: pnpm exec tsx -e "..." (generateSpecDoc) (0) — docs/specs/advance-meta.md regenerated from .adv/specs/advance-meta/spec.json using plugin/src/archive/docs.ts generateSpecDoc
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: smoke-check
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: targeted-spec-assets
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: schemas-generate
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: docs-regenerate
- **[archive_only_evidence]** decisions: Bind latest report to durable adv_run_test evidence — Clears verification_missing warning from pre-adv_run_test engineer report.
- **[archive_only_evidence]** verification: pnpm --dir plugin run schemas:check (0) — Durable verification: schemas:check passed.
- **[unresolved_action]** required_main_agent_actions: After Advance merges, deploys from fresh trunk, and reloads, resume the linked target acceptance/release paths; do not claim their terminal release/merge state before that sequence completes.
- **[archive_only_evidence]** verification: tests_run= results=n/a — Artifact-reference review: both linked target changes have proposal/discovery/design/planning/execution gates done; all three target tasks are done. Backend execution evidence records 21,963 passed, 26 skipped, zero failures plus targeted 8/8 and diff check. Frontend execution evidence records 855 server tests and 28 mocked E2E with zero failures plus diff check. Context-packet independent READY reports and 17/17 matrices were reconciled with target task contract refs. Parent reentry history records the approved sequence: Advance acceptance/release/merge/deploy first, target acceptance/release/merge after plugin reload.
- **[report_follow_up]** follow_ups: Introspect commit bbbbdbca4 via git (requires shell; unavailable here) to confirm its diff left plugin-init.ts:282 unchanged — corroborates the incomplete-migration finding with primary commit evidence.
- **[report_follow_up]** follow_ups: Measure real worker count + RSS + Temporal poller total at 5 and 10 concurrent sessions on one project (agenda 4-6); the 4-worker/3.56GB sample and <=3-session ADR envelope do not establish a 5-10 ceiling. Projected (not measured): ~10 worker processes, ~40 pollers/project at 1+1-per-queue cap, RSS highly variable (890MB avg / 2.03GB outlier).
- **[report_follow_up]** follow_ups: Determine via runtime introspection (ps/process map) whether the 4 observed workers are 4 distinct projects (defect latent) or include peers of one project (defect active) — not determinable from source.
- **[report_follow_up]** follow_ups: Decide whether to consolidate the 3 duplicate readBooleanFeatureFlag copies into withStabilityFeatureDefaults as part of this change or surface as separate cleanup; only worker_singleton diverges today but the pattern is a drift footgun.
- **[report_follow_up]** follow_ups: Cross-link backlog bl-workerQueueReadBlackout: the RC1 default flip is the structural fix for the orphan-queue adoption blackout (non-owners never spawn a worker), so this change should close or supersede that item.
- **[research_citation]** sources: Runtime call site (the defect): resolveWorkerSingletonPlan early-returns shouldSpawnWorker:true when enforce is false (:131-132); but workerSingletonEnforce is resolved via readBooleanFeatureFlag(..., 'worker_singleton_enforce', TRUE) at :279-283, passing true as default. shouldSpawnWorker is false for non-lock-owners when enforce is true. (plugin/src/plugin-init.ts:131,279-289,300)
- **[research_citation]** sources: Canonical default helper: withStabilityFeatureDefaults applies worker_singleton_enforce=false and worktree_guard_enforce=true when omitted. This is the sole declared-default owner. (plugin/src/types/project.ts:169-183)
- **[research_citation]** sources: Config loader does NOT apply helper: loadProjectConfig parses project.json via ProjectConfigSchema.parse and returns raw; it does not call withStabilityFeatureDefaults, so the declared default never reaches plugin-init. (plugin/src/storage/json.ts:152-178)
- **[research_citation]** sources.omitted: 11 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: AGENDA 1 (intent vs oversight): The true default at plugin-init.ts:282 is an INCOMPLETE MIGRATION, not a deliberate fail-safe. ADR-0005:3/22/24, deployment-notes:10/21, and CHANGELOG:187 all record the deliberate intent to flip to false (commit bbbbdbca4); ADR-0005:24 explicitly classifies true as 'incorrect behavior under per-session routing'. The flip landed in the schema helper (types/project.ts:174-177), docs, and status projection (status.ts:678) but not at the one runtime call site that decides worker spawn. LIMITATION: no bash/shell tool was available in this read-only surface, so commit bbbbdbca4 was not introspected directly; the conclusion rests on the corroborating ADR + docs + live-source contradiction. AGENDA 2 (other call sites): worker_singleton_enforce is read ONLY at plugin-init.ts:279 — that is the sole behavioral divergence. worktree_guard_enforce is read via two DUPLICATE readBooleanFeatureFlag copies (worktree-auto-manage.ts:80, task.ts:194/271), all correctly defaulting true (matching the helper). So RC1 is not a multi-flag drift today, BUT there are 4 feature-flag resolvers (1 helper + 3 ad-hoc copies) instead of 1 owner — a latent footgun where any new flag default added to the helper silently won't reach the ad-hoc readers. AGENDA 3 (rq-workerSingleton01 currency): NOT stale. It describes singleton-lock coordination CONDITIONAL on enforcement being active; it mandates no default and is still correct law for projects that deliberately set enforce:true. The violated law is rq-advcfg01.2 (default false), which the runtime contradicts — fix the runtime, do not amend either spec beyond an optional clarifying note. RC2 (archive sync): confirmed unexecutable. syncDefaultBranchAfterMerge has zero production callers and no tool surface; adv-archive.md:517 treats command prose as an executable surface, which it is not. The git-finalize.test.ts:4538 boundary only forbids INTERNAL-within-git-finalize.ts callers, so an external caller (archive tool handler or new tool) is permitted. DESIGN-INDEPENDENT OBJECTIVES: O1 route the runtime worker_singleton resolution through withStabilityFeatureDefaults (one owner); O2 adv_status and runtime must share that one resolver; O3 RC2 needs an executable surface (tool OR fold-into-archive-handler) or explicit deletion+manual-doc; O4 RC2 sync is coupled to RC3 — MAIN_NOT_ON_DEFAULT (git-finalize.ts:217) blocks when trunk is dirty/on-wrong-branch, exactly the pokeedge/pokeedge-web trunk state, so trunk cleanup must precede or accompany RC2 for sync to ever succeed.
- **[report_follow_up]** follow_ups: Stale comment in worktree-auto-manage.ts referenced by discovery opportunity scout as a follow-up if that file is touched (KD1 removes its private reader).
- **[report_follow_up]** follow_ups: Confirm whether syncDefaultBranchAfterMerge needs a new dirty-main cleanliness probe or if existing blocked-reason suffices for KD3's MAIN_DIRTY result (read git-finalize.ts:189-314 function body during planning).
- **[report_follow_up]** follow_ups: Population-identity check: KD8 evidence collector must count DISTINCT session queues vs total workflow attempts to avoid the P39 mismatched-denominator trap when reporting failed-queue rates.
- **[research_citation]** sources: plugin-init.ts — private readBooleanFeatureFlag + defect call site: Private reader defaults worker_singleton_enforce to true (line 282), contradicting canonical false. resolveWorkerSingletonPlan at 128-146 gates shouldSpawnWorker on it. (plugin/src/plugin-init.ts:161-169,279-300)
- **[research_citation]** sources: project.ts — canonical withStabilityFeatureDefaults: worker_singleton_enforce defaults false; worktree_guard_enforce defaults true. Single canonical owner. (plugin/src/types/project.ts:169-183)
- **[research_citation]** sources: status.ts — manual source classification loop: Calls withStabilityFeatureDefaults (678) then manually recomputes featureFlagSources as explicit|default (682-687). No invalid_fallback classification. (plugin/src/tools/status.ts:675-687)
- **[research_citation]** sources.omitted: 11 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: DESIGN LEVERAGE SCOUT — 5 candidates (sorted by payoff/risk ratio).

=== CANDIDATE 1: KD2 queue-mode is a conditional at an existing seam, not new routing architecture (SIMPLIFICATION) ===
Candidate: KD2's prose ('Resolve one routing mode at plugin initialization and inject it into Temporal store construction') reads as new architecture, but workflow-start.ts:53-55 ALREADY routes by sessionId presence and changes.ts:659 ALREADY threads getCurrentSessionId(). The entire KD2 runtime change reduces to: store adapter receives workflowQueueMode from plugin-init (which knows the resolved policy) and conditionally omits sessionId from the workflow input when mode==project. Routing falls through to the existing project-queue branch. No ChangeWorkflowInput field, no workflow code change (already C4-compliant). The only genuinely new logic is the INCOMPATIBLE_ACTIVE_SESSION_QUEUES init-time diagnostic.
Evidence: workflow-start.ts:44-55 (existing routing); changes.ts:648-660 (existing sessionId injection); plugin-init.ts:279-289 (policy + plan); 0 existing workflowQueueMode matches (lgrep).
Payoff: high. Bounds implementation estimate; confirms C4 (unchanged workflow contracts) is structurally free, not costly.
Risk: low. sessionId threading is proven; conditional is additive.
Contract tie: AC1, AC10, C4, DDC2.
Prior consideration: new.
Recommended fate: adopt_now.
Fate rationale: Contract-tied, low risk, pure simplification; reduces planning risk by confirming the wiring point pre-exists.

=== CANDIDATE 2: status.ts source-classification loop is a partial ResolvedProjectFeaturePolicy.source map — fold it in (REUSE) ===
Candidate: status.ts:682-687 manually computes featureFlagSources[key] = rawFeatures[key]!==undefined ? 'explicit' : 'default'. KD1's ResolvedProjectFeaturePolicy should own source as explicit|default|invalid_fallback. The existing loop is the resolver's source map minus invalid_fallback. When the resolver owns the source map, status.ts's manual loop (682-687) becomes redundant and should be deleted, consuming the resolver's output instead. This closes a third source of truth and ensures invalid_fallback reaches diagnostics (AC2 currently cannot report invalid_fallback because status.ts never classifies it).
Evidence: status.ts:675-687 (calls resolver then recomputes sources); project.ts:169-183 (canonical resolver, no source classification).
Payoff: medium. Eliminates a third truth owner; adds invalid_fallback to diagnostics for free.
Risk: low. status.ts already calls the resolver; just consume a richer return.
Contract tie: AC2 (explicit/default reporting), AC9 (one effective value across runtime+diagnostics), DDC1.
Prior consideration: new.
Recommended fate: adopt_now.
Fate rationale: Contract-tied, low risk, reduces code surface and closes a classification gap.

=== CANDIDATE 3: Port-registry cleanup lifecycle crosses ADV delete authority and target-repo hooks — leak-detection gap (CROSS-CUTTING RISK) ===
Candidate: KD6 places port/PID namespace reservation 'under the repo external OpenCode project state' with 'pre-delete releases it only after normal ADV deletion safety passes.' But DONT7 forbids weakening worktree cleanup/lease/integration/terminal-proof authority, and OOS2 puts worktree flock/lease/cleanup-authority out of scope. So the port-registry cleanup is a NEW resource lifecycle that must hook the ADV delete path WITHOUT being owned by it. If the target-repo pre-delete hook fails to release a port, the reservation leaks silently — the ADV delete authority (DONT7) has no knowledge of port state. The design's mitigation ('Idempotent lease with PID/session liveness... reclaim only proven stale records') is lazy reclaim on next setup. Under 10 concurrent sessions, a leaked port blocks a new worktree until the next setup's stale-detection fires, amplifying KD4's bounded-lock contention. The design should specify: does a failed port-release hook BLOCK worktree deletion (and thus block fixArchiveCleanupSequencing terminal convergence)? Or is it best-effort with lazy reclaim? This is a user-value tradeoff (reliability vs liveness) the contract does not currently resolve.
Evidence: KD6 ('pre-delete releases it only after normal ADV deletion safety passes'); DONT7; OOS2; DDC7; risk-table line 'Port registry leaks after crash.'
Payoff: high. Prevents a resource leak that only surfaces under the exact 10-agent load target.
Risk: medium. Touches the boundary between ADV delete authority and target-repo hooks; DONT7 constrains cleanup-authority changes.
Contract tie: AC7, DDC7, DONT7.
Prior consideration: new.
Recommended fate: surface_to_user.
Fate rationale: Cross-cutting risk spanning two repos + a DONT constraint; involves a user-value tradeoff (block-on-hook-failure vs lazy-reclaim) that the contract does not resolve — must not auto-adopt.

=== CANDIDATE 4: Both this change and fixArchiveCleanupSequencing restructure archive-gate.ts Phase 9 — define the insertion seam now to avoid rebase collision (SIMPLIFICATION / COORDINATION) ===
Candidate: KD3 inserts syncDefaultBranchAfterMerge into archive-gate.ts Phase 9 (lines 400-434,737). fixArchiveCleanupSequencing ALSO restructures Phase 9 (terminal-convergence helper convergeAndCleanupArchiveSource 'near Phase 9/archive finalization'). Both changes edit the same function. KD3 says 'rebase after fixArchiveCleanupSequencing' but the risk is a code-level collision in the same handler, not just merge ordering. The intended seam is: release-proof-proven -> [KD3 local-sync] -> [fixArchiveCleanupSequencing terminal convergence] -> cleanup. If KD3 defines its insertion as a distinct helper call boundary (not inline edits to the Phase 9 body), fixArchiveCleanupSequencing can land its terminal-convergence helper without conflicting, and KD3's rebase becomes a clean insert-before rather than a line-level merge conflict.
Evidence: archive-gate.ts:400-434 (Phase 9 handler, shared surface); KD3 design ('rebase and inserts local sync'); fixArchiveCleanupSequencing design ('archive-owned helper near Phase 9/archive finalization').
Payoff: medium. Avoids rebase thrash between two active changes touching the same function.
Risk: low. Coordination discipline, not code risk.
Contract tie: C2 (coordinated three-repo), DDC4.
Prior consideration: conflict:fixArchiveCleanupSequencing (explicitly referenced as coordination dependency).
Recommended fate: design_around.
Fate rationale: Contract-tied, low risk, needs design adjustment (extract KD3 local-sync as a helper-call boundary rather than inline Phase 9 edits) to deconflict.

=== CANDIDATE 5: Extract fs.ts acquireFileLock backoff structure as shared primitive for KD4 (REUSE) ===
Candidate: fs.ts:91-166 (acquireFileLock) already implements bounded wall-clock budget + jittered exponential backoff + stale-holder reclaim. KD4 proposes to build the same structure inline at worktree/index.ts:1116-1132 ('exponential delays 25ms base, capped 250ms, bounded jitter, total 1500ms budget'). Two independent implementations of the same retry/backoff pattern will drift in constants and jitter semantics. Extracting the backoff LOOP STRUCTURE (not the file-lock-specific stale-detection, which uses PID/timestamp .lock files vs git-flock) as a shared bounded-acquire-with-backoff primitive lets both call sites share constants and test seams.
Evidence: fs.ts:91-166 (acquireFileLock bounded loop); worktree/index.ts:1116-1132 (one-shot flock, no retry); KD4 ('bounded acquire loop').
Payoff: medium. Reduces new code; prevents drift between two retry loops; KD4's test-seam requirement (injected wait/random/clock) is satisfied for free by the extracted primitive.
Risk: low-medium. acquireFileLock's stale-detection is file-lock-specific (PID/timestamp); git-flock stale reclaim is owned by acquireWorkerLock. Extraction must be scoped to the retry/backoff structure only, not the stale-detection, to avoid coupling file-lock semantics into the flock path.
Contract tie: AC6, DDC5 (lock budget).
Prior consideration: new (design references fs.ts as a 'precedent' but does not propose extraction).
Recommended fate: design_around.
Fate rationale: Contract-tied, low risk, needs design adjustment to scope the shared primitive to backoff structure only.
- **[report_follow_up]** follow_ups: CAUTION (AC4/DDC4): cited helper syncDefaultBranchAfterMerge has status type synced|diverged|blocked only (git-finalize.ts:171-174) — no MAIN_DIRTY. Design promises 'dirty → MAIN_DIRTY, no mutation'. Safety invariant holds structurally (ff-only, never checkout/switch/reset/pull) but precise dirty-case classification+remediation is not delivered by the cited seam. Resolve in planning: add a git-status pre-check (new blocked reason, in-bounds vs DONT4 boundary test) or correct the outcome table. In-scope remediation; not a release blocker.
- **[report_follow_up]** follow_ups: MINOR (clarity): KD4 references acquireWorkerLock but the worktree-create path uses acquireGitWorktreeFlock (worktree/index.ts:1119). Terminology slip; intent (keep dead-holder reclaim inside the lock primitive) is clear and correct.
- **[report_follow_up]** follow_ups: VERIFY-AT-TASKS: KD6/KD7/KD5 target-repo work (pokeedge, pokeedge-web) cannot be source-verified from this repo; confirm at planning that DDC6/DDC7/DDC8/DDC9 each have an owner task in the corresponding cross-project changes and that DDC7 (nonblocking lease) is testable independently of ADV deletion authority.
- **[report_follow_up]** follow_ups: NOTE: fixArchiveCleanupSequencing is execution-pending, not merged. KD3's 'lands first; rebase' dependency is a real ordering constraint — if it stalls, KD3 work is blocked but KD1/KD2 can proceed independently.
- **[research_citation]** sources: plugin/src/plugin-init.ts:161-169,270-300 (KD1/KD2 worker decision): readBooleanFeatureFlag helper (161-169); workerSingletonEnforce default hardcoded TRUE at line 282; workerQueues already polls [sessionQueue, expectedQueue] in default path (270-275); shouldSpawnWorker gated by resolveWorkerSingletonPlan. Confirms runtime-default-true defect + KD2 worker seam. (plugin/src/plugin-init.ts)
- **[research_citation]** sources: plugin/src/tools/worktree-auto-manage.ts:80-93 (KD1 duplicate): Second near-identical readBooleanFeatureFlag (85-93); worktree_guard_enforce default true (80). Confirms duplicate boolean owner. (plugin/src/tools/worktree-auto-manage.ts)
- **[research_citation]** sources: plugin/src/tools/task.ts:292-300 (KD1 duplicate): Third duplicate readBooleanFeatureFlagLocal (292-300), renamed. Confirms 'duplicated local readers are recurrence vectors' rationale. (plugin/src/tools/task.ts)
- **[research_citation]** sources.omitted: 13 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Design is well-grounded and spec-law-compliant. All eight KDs cite real source levers, verified present at the claimed locations. The central defect is confirmed: runtime defaults worker_singleton_enforce=true (plugin-init.ts:282) while spec law defaults false (advance-meta.md rq-advcfg01.2), originating from two conflicting archived changes (advstabilityhardening set runtime-true 2026-05-12; flipWorkerSingletonMultiWorker set spec-false 2026-05-22). KD1's 'one typed resolver' is strongly motivated: three near-identical private readBooleanFeatureFlag duplicates exist (plugin-init.ts, worktree-auto-manage.ts, task.ts — one even renamed), plus a manual explicit|default source loop in status.ts. KD2 reuses existing routing seams (workflow-start.ts:53-55, store-temporal/index.ts:708) without touching ChangeWorkflowInput/workflow code — honors C4 (workflow contract unchanged). KD3 is lower-risk than it appears: syncDefaultBranchAfterMerge is already implemented+tested under rq-releaseFinalization03 and the DONT4 boundary test explicitly permits external (archive-handler) callers, so KD3 is primarily wiring + removing uncallable Phase 9.5 prose. The fixArchiveCleanupSequencing dependency is coherent (adjacent boundaries, lands-first ordering). KD5 correctly treats the firewall's script-internal-write gap as the documented accepted residual (rq-twf01.7) and adds a structural repo-owned ops gate rather than hacking the parser (P35). KD6 nonblocking-lease + proven-stale reclaim correctly decouples auxiliary port leaks from archive authority (DONT7/DDC7). KD7 is trigger-driven, no daemon/polling (DONT8/P37). KD8 honors the evidence boundary (12 total/6 orchestrator, no synthetic load) per C1/SC2.
- **[unresolved_action]** required_main_agent_actions: Remediate evidence-1 in plugin/src/utils/concurrency-evidence-collector.ts and its tests, then regenerate docs/ten-agent-concurrency-evidence.md.
- **[unresolved_action]** required_main_agent_actions: Rerun the targeted evidence suite plus pnpm run check and pnpm run build after remediation.
- **[unresolved_action]** required_main_agent_actions: Do not revisit worker routing, archive local-sync, or bounded worktree-lock code: inspected paths and their targeted tests passed.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] A bounded collection of session-history rows is not concurrency evidence. Demand, memory, and failure claims must use the same verified overlap population; label unmatched rows as samples and do not derive a concurrency claim from their count.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/utils/concurrency-evidence-collector.test.ts src/plugin-init.worker-singleton.test.ts src/temporal/workflow-start.test.ts src/tools/worktree/index-create.test.ts src/tools/archive-helpers/git-finalize.test.ts src/tools/change.archive-phase9.test.ts src/types/project.test.ts, pnpm run check, pnpm run build, git diff --check results=fail — Targeted suite passed: 7 files, 282 tests. pnpm run check passed (3 pre-existing ESLint warnings, 0 errors). pnpm run build passed. git diff --check passed. Review failed on AC3/DDC10 evidence-population correctness; no scoped code edit was applied because this independent packet provides no task-bound edit surface.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/utils/concurrency-evidence-collector.test.ts src/plugin-init.worker-singleton.test.ts src/temporal/workflow-start.test.ts src/tools/worktree/index-create.test.ts src/tools/archive-helpers/git-finalize.test.ts src/tools/change.archive-phase9.test.ts src/types/project.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm run check
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm run build
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check
- **[unresolved_action]** required_main_agent_actions: Add explicit target-project filtering before peak aggregation and regression coverage for cross-project overlap.
- **[unresolved_action]** required_main_agent_actions: Regenerate docs/ten-agent-concurrency-evidence.md after the scoped collector is fixed, then rerun the collector target suite and review.
- **[unresolved_action]** required_main_agent_actions: Preserve prior clean judgement: do not revisit routing, archive local sync, or bounded worktree lock in this remediation.
- **[wisdom_candidate]** wisdom_candidates: [pattern] Concurrency evidence requires both verified intervals and a single scoped population. A correct sweep-line algorithm remains invalid for a same-project claim when its input aggregates unrelated project shards or unscoped global rows.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/utils/concurrency-evidence-collector.test.ts, git diff --check 192da1b9..HEAD results=fail — Targeted collector suite passed: 1 file, 15 tests. Diff check passed. Confirmed interval sweep-line, sequential peak=1 test, unknown-role preservation, and separately sourced historical 12/6 baseline. Review remains blocked because target-project population filtering and regenerated committed evidence are absent.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/utils/concurrency-evidence-collector.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check 192da1b9..HEAD
- **[wisdom_candidate]** wisdom_candidates: [success] Population-correct passive concurrency evidence can report a maximum per-project sweep-line peak while preserving unscoped rows as excluded and historical observed overlap as separate provenance.

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
| AC10 | acceptance_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| C4 | constraint | respected |
| C5 | constraint | respected |
| C6 | constraint | respected |
| C7 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |
| DONT4 | avoidance | respected |
| DONT5 | avoidance | respected |
| DONT6 | avoidance | respected |
| DONT7 | avoidance | respected |
| DONT8 | avoidance | respected |
| DONT9 | avoidance | respected |
| DONT10 | avoidance | respected |
| OOS1 | out_of_scope | not_applicable |
| OOS2 | out_of_scope | not_applicable |
| OOS3 | out_of_scope | not_applicable |
| OOS4 | out_of_scope | not_applicable |
| OOS5 | out_of_scope | not_applicable |
| OOS6 | out_of_scope | not_applicable |

## Unresolved Actions

- verification_missing: No durable adv_run_test evidence found for run_id: oc-test-targeted-worktree-create-2026-07-29
- verification_missing: No durable adv_run_test evidence found for run_id: oc-test-smoke-2026-07-29
- verification_missing: No durable adv_run_test evidence found for run_id: pnpm-check-2026-07-29
- verification_missing: No durable adv_run_test evidence found for run_id: oc-test-targeted-fixMultiSessionConcurrency-20260729
- verification_missing: No durable adv_run_test evidence found for run_id: pnpm-run-check-20260729
- verification_missing: No durable adv_run_test evidence found for run_id: targeted-concurrency-evidence-collector-test
- verification_missing: No durable adv_run_test evidence found for run_id: pnpm-check
- verification_missing: No durable adv_run_test evidence found for run_id: smoke-check
- verification_missing: No durable adv_run_test evidence found for run_id: targeted-spec-assets
- verification_missing: No durable adv_run_test evidence found for run_id: schemas-generate
- verification_missing: No durable adv_run_test evidence found for run_id: docs-regenerate
- After Advance merges, deploys from fresh trunk, and reloads, resume the linked target acceptance/release paths; do not claim their terminal release/merge state before that sequence completes.
- Remediate evidence-1 in plugin/src/utils/concurrency-evidence-collector.ts and its tests, then regenerate docs/ten-agent-concurrency-evidence.md.
- Rerun the targeted evidence suite plus pnpm run check and pnpm run build after remediation.
- Do not revisit worker routing, archive local-sync, or bounded worktree-lock code: inspected paths and their targeted tests passed.
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/utils/concurrency-evidence-collector.test.ts src/plugin-init.worker-singleton.test.ts src/temporal/workflow-start.test.ts src/tools/worktree/index-create.test.ts src/tools/archive-helpers/git-finalize.test.ts src/tools/change.archive-phase9.test.ts src/types/project.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm run check
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm run build
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check
- Add explicit target-project filtering before peak aggregation and regression coverage for cross-project overlap.
- Regenerate docs/ten-agent-concurrency-evidence.md after the scoped collector is fixed, then rerun the collector target suite and review.
- Preserve prior clean judgement: do not revisit routing, archive local sync, or bounded worktree lock in this remediation.
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/utils/concurrency-evidence-collector.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check 192da1b9..HEAD
