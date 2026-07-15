# Archive Briefing Digest

**Change ID:** fixArchiveTerminalProjection
**Title:** Fix archive terminal projection wedge
**Status:** archived
**Generated:** 2026-07-13T21:10:28.792Z

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

Showing 52 of 52 durable facts.

- **[agenda]** follow_ups: Task tk-a98c3ce70ad3 (verification) owns SC4's cross-store read-parity regression; the AC4 typed-timeout + re-run legs added here compose with it
- **[agenda]** follow_ups: If operators raise ADV_GIT_PUSH_TIMEOUT_MS above ~360s, the 420s outer net can still fire — safe by design (typed result), but worth noting in any future push-budget change
- **[unresolved_action]** required_main_agent_actions: Checkpoint this task (tk-08b5f7e5c1fe) — work is uncommitted per delegation instructions
- **[unresolved_action]** required_main_agent_actions: Task tk-f7248412becc (status_repair bundle-anchored) and tk-29dd9803ee8a (archive_repair reconcile) remain pending; this task does not unblock them (they depend on tk-23fd806e1cd9, already done)
- **[archive_only_evidence]** decisions: Timeout classifier implemented as an onToolTimeout hook on SafeExecuteOptions, invoked from safeExecute's catch on ToolExecutionTimeoutError — The safety-net race lives outside tool execute(); a hook is the only seam that can retype the timeout response without redesigning the wrapper. Hook is best-effort (undefined/throw → generic response) so it can never mask the original timeout
- **[archive_only_evidence]** decisions: Classifier probe is disk-only (findArchiveBundle over external archive + worktreePath/target_path/store-root in-repo mirrors); no Temporal queries, no git ops — After a timeout the Temporal worker may be the hung component; a second unbounded call could hang the error path itself. Disk probe covers both native and target_path routing without resolving target project identity
- **[archive_only_evidence]** decisions: timeoutMs: 420_000 = 300s inner git push budget (DEFAULT_GIT_PUSH_TIMEOUT_MS) + 120s headroom for fetch/merge/gh ops, release-gate signals, durable-proof queries, cleanup, issue closure — rq-toolTimeoutOverride01 requires the override to cite inner-budget rationale; 305s (adv_run_test tier) would still clip a slow push plus terminal-step work
- **[archive_only_evidence]** decisions: Typed payload keeps errorClass:'ToolExecutionTimeout' and adds archiveStatus:'still_finalizing', bundleDurable, archivePath, retrySafe, remediation, requirement:'rq-archiveOrdering01' — Preserves classifier continuity for downstream error-class consumers while making the interrupted-past-bundle-write state machine-readable and actionable per SC3/AC4
- **[archive_only_evidence]** decisions: No changes to plugin/src/tools/change.ts archive flow — C1 (preserve bundle-first ordering) — the fix is at the tool-boundary wrapper only; the idempotent re-run path (existingBundlePath recovery) already existed and is now explicitly test-locked for AC4
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/utils/safe-execute.test.ts src/tools/change/archive-timeout.test.ts src/tool-registry.test.ts (RED) (1) — RED confirmed before implementation: 3 test files failed (missing onToolTimeout hook, missing archive-timeout module, missing registry override)
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/utils/safe-execute.test.ts src/tools/change/archive-timeout.test.ts src/tool-registry.test.ts src/tools/change.archive-phase9.test.ts (0) — GREEN: 120/120 tests pass — safeExecute onToolTimeout hook (4 new), archive-timeout classifier (7 new), registry override static assertion (1 new), AC4 idempotent re-run test (1 new)
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/change.test.ts src/tools/change.archive-repair.test.ts src/tool-registry.surface.test.ts src/utils/tool-arg-preflight.test.ts src/__tests__/active-change-pointer.test.ts src/cli-bridge-contract.test.ts (0) — Regression surface green: 278/278 tests pass across registry-shape, preflight, bridge-contract, and archive-repair suites
- **[archive_only_evidence]** verification: pnpm run check (plugin/) (0) — schemas:check, typecheck, test-isolation, lockfile-policy, eslint, prettier — all green
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/utils/safe-execute.test.ts src/tools/change/archive-timeout.test.ts src/tool-registry.test.ts (RED)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/utils/safe-execute.test.ts src/tools/change/archive-timeout.test.ts src/tool-registry.test.ts src/tools/change.archive-phase9.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/change.test.ts src/tools/change.archive-repair.test.ts src/tool-registry.surface.test.ts src/utils/tool-arg-preflight.test.ts src/__tests__/active-change-pointer.test.ts src/cli-bridge-contract.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run check (plugin/)
- **[agenda]** follow_ups: Confirm the exact non-terminal enum member name with the implementation agent ('in_progress' vs 'started'); either is replay-safe but the choice must be consistent across schema, change.ts checkpoint, and any gate.ts/archive-gate.ts status!=done predicates (change.ts:2858-2861, archive-gate.ts:399-401 already treat any non-'done' as incomplete, so both work).
- **[agenda]** follow_ups: Verify no chat-history-based reasoning was used: this report is sourced entirely from live file:line reads; the SESSION_HEALTH banner flagged history may be unsafe.
- **[agenda]** follow_ups: IN_SCOPE/OUT_OF_SCOPE/DONE_WHEN/STOP_WHEN/VERIFICATION packet anchors were not provided in the delegating prompt; continued under existing prompt scope (read-only supplemental design evidence) per fallback policy.
- **[archive_only_evidence]** sources: safeExecute timeout override mechanism: DEFAULT_TOOL_TIMEOUT_MS=10_000 (L240). SafeExecuteOptions.timeoutMs override (L247-250). raceWithTimeout uses Promise.race against a setTimeout that rejects with ToolExecutionTimeoutError (L275-289). On timeout the outer Promise.race rejects the whole tool promise — the wrapped fn keeps running but its own try/catch never surfaces because the race already rejected. safeExecute reads timeoutMs=options?.timeoutMs ?? DEFAULT (L433).
- **[archive_only_evidence]** sources: Existing per-tool override registrations (exact seam): Named-override pattern: registerTool(desc,args,namedExecute(name, safeExecute(execFn, name, undefined, { timeoutMs: N }))). adv_run_test=305_000, adv_task_checkpoint=35_000, adv_temporal_worker_restart=15_000. Each carries an inline rationale comment; worker_restart cites rq-toolTimeoutOverride01.2.
- **[archive_only_evidence]** sources: adv_change_archive currently has NO override (root cause): adv_change_archive is registered via plain bindTool(changeTools.adv_change_archive, "adv_change_archive", store). bindTool (L215-228) calls safeExecute(fn, name) with no options → inherits the 10s default ceiling. This is the direct cause of GH #216: Phase 9 git+Temporal work exceeds 10s, race rejects, tool-local failed-status catch is bypassed.
- **[archive_only_evidence]** sources: Override test seam (structural registry guard): describe('safeExecute timeout overrides for slow-subprocess tools') reads tool-registry.ts as source text, extractRegistrationBlock(src,toolName) walks balanced parens from '<name>: registerTool(', asserts /timeoutMs:\s*(\d[\d_]*)/ >= threshold. NOTE: extractor anchors on 'registerTool(' — a bindTool-registered tool is NOT matched. Adding an archive override requires converting adv_change_archive from bindTool to an explicit registerTool block (like adv_gate_complete L714-728) so the guard can assert it.
- **[archive_only_evidence]** sources: Phase9 finalization flow — no pre-finalization checkpoint: finalizeRelease/verifyReleaseEvidenceFromMain is awaited at L2692-2706 inside try. recordPhase9Status is only ever called AFTER the await resolves: failed in catch (L2711), pending_merge (L2758), done (L2862). There is NO recordPhase9Status BEFORE L2692. A 10s outer-race rejection kills the promise before the catch runs → zero durable phase9_status is written → split-brain (bundle written by archiveChange at L2660, terminal status absent).
- **[archive_only_evidence]** sources: Phase9FinalizationStatusSchema enum (widening target): status enum is ["pending","pending_merge","done","failed"] with startedAt(required), completedAt/error/route/changeTipSha optional. No in_progress/started member exists to mark 'finalization dispatched, not yet terminal'.
- **[archive_only_evidence]** sources: Workflow signal handler is opaque assignment (replay-safe widening): phase9StatusUpdatedSignal handler does state.phase9_status = payload.phase9_status — no exhaustive switch on the enum in workflow-reachable code. Seed (L628) and projection (L1715) also opaque. recordPhase9Status fires phase9StatusUpdatedSignal via fireSignalAndRefresh. Adding an enum member introduces no new signal/handler/branch → replay-safe; only the Zod boundary widens.
- **[archive_only_evidence]** sources: Existing bundle-present retry / reconciliation seams: findArchiveBundle probes existing bundle (L2567). rq-archiveRetryIdempotence01: if status==archived && bundle present → reconcileArchivedBundleRetry (bounded metadata-only, L2610-2625). rq-archiveOrdering01: if bundle present but status!=archived → synthetic archiveResult, skip disk re-write, let status transition complete recovery (L2636-2658). reconcileArchivedBundleRetry (archive-gate.ts:290-431) re-verifies structural release proof + durable proof before no-op success.
- **[archive_only_evidence]** sources: Relevant spec requirements: rq-releaseFinalization01 (finalization→gate ordering, shipped invariant, .1-.12), rq-releaseProjectionDurability01 (durable proof or block), rq-archiveRecoveryConsistency01 (failed recovery must classify + fail closed), rq-archiveOrdering01 (resilient to failed disk write), rq-archiveRetryIdempotence01 (bounded reconcile). A new AC for pre-finalization durable checkpoint fits under rq-releaseFinalization01 or a sibling rq-releaseFinalization01.N.
- **[archive_only_evidence]** sources: Failed-status regression test seam (proven harness): mocks.finalizeRelease.mockRejectedValueOnce(...) then asserts mocks.workflow.signalPayloads containsEqual phase9_status.status='failed' and store.changes.save NOT called. Same mock harness (createMockStore, mocks.workflow.signalPayloads) can assert an 'in_progress'/'started' payload is fired BEFORE finalization and that a timeout leaves durable actionable state.
- **[archive_only_evidence]** architecture_assessment: GH #216 root cause is precise and single-seam: adv_change_archive (tool-registry.ts:379-382) is bound via bindTool with no SafeExecuteOptions, inheriting the 10s DEFAULT_TOOL_TIMEOUT_MS. Phase 9 legitimately does cumulative git + Temporal work exceeding 10s; safe-execute.ts raceWithTimeout rejects the tool promise, and because the ONLY durable phase9_status writes (change.ts:2711/2758/2862) occur AFTER the awaited finalization resolves, an outer-timeout abort bypasses all of them — no failed, no pending_merge, no done. Result: archive bundle present (archiveChange ran at L2660) with terminal projection absent = the exact split-brain wedge the change targets. Two mutually-reinforcing fixes: (1) explicit archive timeout override, (2) a durable pre-finalization checkpoint. The retry/reconciliation machinery to consume that checkpoint already exists (reconcileArchivedBundleRetry, rq-archiveOrdering01 synthetic-result recovery, rq-archiveRetryIdempotence01) — the missing durable link is a status set BEFORE the vulnerable await, independent of the inner catch.
- **[agenda]** follow_ups: Add regression test that temporal re-spread of archived over an already-archived disk get is a no-op (caution 2).
- **[unresolved_action]** consumer_warnings: verification_missing: Worker report transport failed with WorkflowNotFoundError; orchestrator persisted this source-backed validator report through the target store.
- **[archive_only_evidence]** sources: disk get bundle-blind: get resolves only paths.changes, returns literal 'Change not found' at :348, no archive fallback (H1 confirmed).
- **[archive_only_evidence]** sources: disk list bundle-aware: loadArchivedChanges reads paths.archive; merged when includeArchived — the get/list asymmetry.
- **[archive_only_evidence]** sources: temporal get bundle-dominant: loadArchiveBundleDominantProjection forces status archived when hasArchiveBundle (claim 2 confirmed).
- **[archive_only_evidence]** sources: target_path legacy routing: snapshot-ok and scaffold route to createLegacyStore; exact wedge surface (claim 3 confirmed).
- **[archive_only_evidence]** sources: archive no timeout override: archive uses plain bindTool → inherits DEFAULT_TOOL_TIMEOUT_MS=10000; checkpoint 35s / worker-restart 15s override (claim 4 confirmed).
- **[archive_only_evidence]** sources: audited recovery writer: saveRecoveredChangeStatus asserts authorization then disk-direct saveChange, bypassing archiveChangeSignal (claim 5 confirmed).
- **[archive_only_evidence]** sources: canonical-id dedupe helper: hasArchiveBundle handles non-eponymous archive dirs; reuse for rq-terminalProjectionTruth01.2 dedupe.
- **[archive_only_evidence]** architecture_assessment: All five root-cause claims confirmed at file:line. The wedge is primarily H1: target_path/snapshot-ok reads route to the legacy disk store whose get is bundle-blind, so a bundle-present change returns 'Change not found' while the native temporal get would surface it archived. Making the legacy disk get bundle-aware (read-only, mirroring loadArchiveBundleDominantProjection, deduped via hasArchiveBundle) is the correct minimal self-heal fix and does not touch write-side ordering. The adv_archive_repair reconcile mode is structurally identical to the shipped adv_change_status_repair audited flip. The typed idempotent archive-timeout plus raised ceiling matches existing override and idempotent-retry precedent.
- **[archive_only_evidence]** findings: [info] All requested regression and cross-cutting verification surfaces passed.
- **[unresolved_action]** required_main_agent_actions: No acceptance blocker remains. Retain the two uncommitted reviewer fixes for the parent agent's normal change workflow; do not revisit unrelated Temporal worker supervision or report-transport recovery. 
- **[wisdom_candidate]** wisdom_candidates: [pattern] Batch recovery scans must catch per-candidate durable-read exceptions and emit an explicit non-mutating disposition; treating only `{ success: false }` as unreadable lets one corrupt candidate abort reporting for the set.
- **[archive_only_evidence]** changes_made: plugin/src/tools/change.ts: Handled a thrown full-record read during archive reconcile as the non-mutating `skipped_unreadable_change` disposition, preserving per-candidate reconcile reporting rather than aborting the scan.
- **[archive_only_evidence]** changes_made: plugin/src/tools/change.archive-repair.test.ts: Added regression coverage proving unreadable reconcile candidates are reported and never probe bundles or invoke the audited recovery writer.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/tools/change.archive-phase9.test.ts src/tools/change.archive-repair.test.ts src/tools/change.status-repair.test.ts src/tools/change/archive-timeout.test.ts src/utils/safe-execute.test.ts src/tool-registry.test.ts, pnpm -C plugin run check, git diff --check results=pass — Acceptance-focused suite: 6 files, 149 tests passed. Plugin schemas, typecheck, isolation/lockfile checks, ESLint, and Prettier passed. Diff whitespace check passed.
- **[unresolved_action]** required_main_agent_actions: Release hardening complete; proceed with the normal release/archive gate flow.
- **[unresolved_action]** required_main_agent_actions: Do not treat a production reconcile as automatic: require approvedByUser, precise evidence, recovery reason, bundle/gates/merge proof, and inspect per-candidate dispositions.
- **[unresolved_action]** required_main_agent_actions: No executive-summary append made: reviewer runtime exposes no permitted artifact-write operation, and the existing executive summary already records ops readiness and the post-deploy reconcile follow-up.
- **[wisdom_candidate]** wisdom_candidates: [pattern] Release recovery safety is strongest when every reconciliation candidate must independently satisfy durable bundle, completed gates, merge proof, audited authorization, and read-after-write verification; unreadable/probe-failed candidates must be explicit non-mutating dispositions.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/storage/store-disk.test.ts src/tools/change.archive-phase9.test.ts src/tools/change.archive-repair.test.ts src/tools/change.status-repair.test.ts src/tools/change/archive-timeout.test.ts src/tool-registry.test.ts src/utils/safe-execute.test.ts, pnpm -C plugin run check, pnpm -C plugin run build, git diff --check 81604d7d..HEAD, git fsck --no-dangling --no-reflogs results=pass — Focused release/recovery regression suite passed 157/157. Schema freshness, typecheck, isolation/lockfile policy, lint, and formatting passed. Plugin plus Temporal worker build passed. Diff checks passed; worktree was clean before and after build; checkpoint history contains five task checkpoints; git fsck returned no errors.

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| SC1 | success_criterion | pass |
| SC2 | success_criterion | pass |
| SC3 | success_criterion | pass |
| SC4 | success_criterion | pass |
| AC1 | acceptance_criterion | pass |
| AC2 | acceptance_criterion | pass |
| AC3 | acceptance_criterion | pass |
| AC4 | acceptance_criterion | pass |
| AC5 | acceptance_criterion | pass |
| AC6 | acceptance_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| C4 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |
| OOS1 | out_of_scope | not_applicable |
| OOS2 | out_of_scope | not_applicable |

## Unresolved Actions

- Checkpoint this task (tk-08b5f7e5c1fe) — work is uncommitted per delegation instructions
- Task tk-f7248412becc (status_repair bundle-anchored) and tk-29dd9803ee8a (archive_repair reconcile) remain pending; this task does not unblock them (they depend on tk-23fd806e1cd9, already done)
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/utils/safe-execute.test.ts src/tools/change/archive-timeout.test.ts src/tool-registry.test.ts (RED)
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/utils/safe-execute.test.ts src/tools/change/archive-timeout.test.ts src/tool-registry.test.ts src/tools/change.archive-phase9.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/change.test.ts src/tools/change.archive-repair.test.ts src/tool-registry.surface.test.ts src/utils/tool-arg-preflight.test.ts src/__tests__/active-change-pointer.test.ts src/cli-bridge-contract.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm run check (plugin/)
- verification_missing: Worker report transport failed with WorkflowNotFoundError; orchestrator persisted this source-backed validator report through the target store.
- No acceptance blocker remains. Retain the two uncommitted reviewer fixes for the parent agent's normal change workflow; do not revisit unrelated Temporal worker supervision or report-transport recovery. 
- Release hardening complete; proceed with the normal release/archive gate flow.
- Do not treat a production reconcile as automatic: require approvedByUser, precise evidence, recovery reason, bundle/gates/merge proof, and inspect per-candidate dispositions.
- No executive-summary append made: reviewer runtime exposes no permitted artifact-write operation, and the existing executive summary already records ops readiness and the post-deploy reconcile follow-up.
