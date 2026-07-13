# Archive Briefing Digest

**Change ID:** updateArchiveVisibilitySpec
**Title:** Update archive visibility spec
**Status:** archived
**Generated:** 2026-07-11T18:06:31.368Z

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

Showing 100 of 132 durable facts (32 omitted).

- **[archive_only_evidence]** decisions: Added regression-lock tests only; no production code changed — Audit of resolveReleaseReachability showed blocked, no_remote (both directions), direct (all fallbacks), and pr_auto_merge already covered; only pr_manual, merge_queue proof outcomes, blocked-route I/O short-circuit, and no_remote-unmerged lacked assertions. Prune-first: locking existing correct behavior beats refactoring (respects OOS2, C1).
- **[archive_only_evidence]** decisions: Blocked-route test asserts zero git/gh I/O via throwing mocks — AC1/C1 require blocked classification to be structural and side-effect-free; an I/O call would prove the short-circuit regressed.
- **[archive_only_evidence]** decisions: Did not duplicate bundle-present retry ordering tests — Existing phase9 tests already cover it (existing-bundle retry blocked without evidence, PR-merged pending_merge finalization from bundle, changeTipSha threading, idempotent re-run, gate reconciliation on retry). Verified by reading change.archive-phase9.test.ts rather than re-adding.
- **[archive_only_evidence]** verification: pnpm vitest run src/tools/archive-helpers/git-finalize.test.ts -t "route × proof discriminants" (0) — RED-phase record: 6 new discriminant tests pass against existing behavior — typed proof authority already implements all routes; tests are regression locks, no production change needed (runId tr_mrglhi3j_840bb9b8)
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/archive-helpers/git-finalize.test.ts src/tools/change.archive-phase9.test.ts src/tools/change.archive-repair.test.ts src/tools/change.status-repair.test.ts (0) — GREEN: all 166 tests pass across git-finalize, phase9 archive, archive-repair, and status-repair suites (runId tr_mrglik61_60e0d495)
- **[archive_only_evidence]** verification: pnpm exec tsc --noEmit -p tsconfig.json (0) — VERIFY: plugin typecheck clean (runId tr_mrglj42h_bebbad9e)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm vitest run src/tools/archive-helpers/git-finalize.test.ts -t "route × proof discriminants"
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/archive-helpers/git-finalize.test.ts src/tools/change.archive-phase9.test.ts src/tools/change.archive-repair.test.ts src/tools/change.status-repair.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec tsc --noEmit -p tsconfig.json
- **[agenda]** follow_ups: Pre-existing prettier drift on this branch (not touched by this task): plugin/src/adv-autonomy-quality-assets.test.ts, plugin/src/events/events.test.ts, plugin/src/events/terminal.ts — full `pnpm run format:check` fails until the owning task formats them.
- **[agenda]** follow_ups: Concurrent worktree modifications not made by this task and left untouched: .adv/specs/advance-workflow/spec.json, docs/specs/advance-workflow.md, plugin/src/tools/archive-helpers/git-finalize.test.ts, plugin/src/workflow-noise-reduction-assets.test.ts.
- **[unresolved_action]** required_main_agent_actions: Note the pre-existing prettier drift (3 files) when running full `pnpm run check` for release verification — it is outside this task's scope and may belong to concurrent task tk-f1f9465ad8b8 or an earlier checkpoint.
- **[archive_only_evidence]** decisions: Added findWorkspaceByDirectoryChecked returning { ok: true, workspace } | { ok: false, reason }; kept findWorkspaceByDirectory as a back-compat wrapper mapping failure to null — Preserves existing tests and the rq-warpModeContract05 asset contract while giving the delete path a structural unknown-vs-empty distinction (P33)
- **[archive_only_evidence]** decisions: Workspace delete failure now fails closed (typed blocker + pending-delete queue) instead of warn-and-continue to git removal — AC3/DONT2/DONT3: a workspace that could not be deleted still owns the worktree; proceeding to git worktree remove would strand it and downgrade a cleanup error into success
- **[archive_only_evidence]** decisions: 404 on workspace delete remains tolerated — deleteAdvWorkspace treats 404 as success — the workspace is proven gone, so ownership is certain and git removal is safe
- **[archive_only_evidence]** decisions: Typed blocker classes (workspace_ownership_uncertain / workspace_cleanup_failed) wired through classifyDeleteResultForPendingDelete and classifyPendingDelete reason fallback — AC4: retained cleanup must expose an exact typed blocker through drain records, adv_worktree_triage, and adv_status aggregates without new surfaces
- **[archive_only_evidence]** decisions: Added explicit WORKSPACE_* cases to the legacy worktree_delete tool result switch — Without them the new blockers fell to the generic default and lost the actionable retry hint (AC4 exact blocker visibility)
- **[archive_only_evidence]** verification: pnpm exec vitest run src/utils/workspace-warp.test.ts src/tools/worktree/index-delete.test.ts (1) — RED: 4 new fail-closed tests failed against fail-open behavior (WORKSPACE_CLEANUP_FAILED / WORKSPACE_OWNERSHIP_UNCERTAIN / typed blocker class)
- **[archive_only_evidence]** verification: pnpm exec vitest run src/utils/workspace-warp.test.ts src/tools/worktree/index-delete.test.ts (0) — GREEN: 105 tests pass after fail-closed implementation
- **[archive_only_evidence]** verification: pnpm run schemas:check && pnpm run typecheck && pnpm exec tsx scripts/check-test-isolation.ts && pnpm run lint && prettier --check (touched files) (0) — Schemas, typecheck, isolation, eslint over src/, and prettier on all touched files pass; 3 unrelated pre-existing prettier-drift files excluded and surfaced
- **[archive_only_evidence]** verification: pnpm exec vitest run src/utils/workspace-warp.test.ts src/tools/worktree/index-delete.test.ts src/tools/adv-worktree.test.ts (0) — Final regression pass across lookup, delete, drain, and tool-wrapper suites
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/utils/workspace-warp.test.ts src/tools/worktree/index-delete.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/utils/workspace-warp.test.ts src/tools/worktree/index-delete.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run schemas:check && pnpm run typecheck && pnpm exec tsx scripts/check-test-isolation.ts && pnpm run lint && prettier --check (touched files)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/utils/workspace-warp.test.ts src/tools/worktree/index-delete.test.ts src/tools/adv-worktree.test.ts
- **[archive_only_evidence]** decisions: Rephrased the law clause to '...or failed with reason; every state is nonblocking' instead of the old 'failed with reason and nonblocking marker' — Old phrasing attached the nonblocking marker only to the failed state; AC5 requires all five states (including activation-pending) to be nonblocking, so the new wording makes nonblocking a property of every enumerated state
- **[archive_only_evidence]** decisions: Extended the existing 'advance-workflow spec records archive visibility and overlap boundaries' asset test rather than adding a new test file — SC4 requires law, projection, and regression coverage to share one contract; the existing test already reads both spec.json and docs/specs/advance-workflow.md in one loop, so one assertion covers law and mirror atomically
- **[archive_only_evidence]** verification: pnpm exec vitest run src/workflow-noise-reduction-assets.test.ts (RED, before law edit) (1) — New five-state assertion failed against stale four-state law/mirror text — confirms regression coverage bites
- **[archive_only_evidence]** verification: node -e JSON.parse(.adv/specs/advance-workflow/spec.json) (0) — spec.json parses cleanly after edit
- **[archive_only_evidence]** verification: pnpm exec vitest run src/workflow-noise-reduction-assets.test.ts src/adv-autonomy-quality-assets.test.ts (0) — GREEN: 47/47 tests pass across both archive-visibility asset suites
- **[archive_only_evidence]** verification: pnpm exec prettier --check src/workflow-noise-reduction-assets.test.ts && pnpm exec eslint src/workflow-noise-reduction-assets.test.ts (0) — Format and lint clean on edited test file
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/workflow-noise-reduction-assets.test.ts (RED, before law edit)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: node -e JSON.parse(.adv/specs/advance-workflow/spec.json)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/workflow-noise-reduction-assets.test.ts src/adv-autonomy-quality-assets.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec prettier --check src/workflow-noise-reduction-assets.test.ts && pnpm exec eslint src/workflow-noise-reduction-assets.test.ts
- **[agenda]** follow_ups: [packet-defect] Orchestrator packet omitted TASK_SCOPE, DONE_WHEN, STOP_WHEN, and VERIFICATION anchors; proceeded with prompt-defined scope and bounded evidence collection only.
- **[agenda]** follow_ups: [packet-defect] SCOPE KEY and ATTEMPT number not provided; used derived scope_key 'tron:archive-visibility-spec' and attempt=1.
- **[archive_only_evidence]** findings: rq-archiveVisibility01.1 lives at .adv/specs/advance-workflow/spec.json:939-948 with human mirror at docs/specs/advance-workflow.md:815-823.
- **[archive_only_evidence]** findings: Spec then-clause enumerates deploy statuses: ran | not available | not needed | failed: <reason>; nonblocking.
- **[archive_only_evidence]** findings: Spec then-clause enumerates reflection statuses: completed | failed: <reason>; nonblocking.
- **[archive_only_evidence]** findings: Local deploy status enum has zero consumers in plugin/src TypeScript outside *.test.ts — prose-only protocol marker consumed by orchestrator agent when rendering Phase 8 archive report.
- **[archive_only_evidence]** findings: Voice-standard and command prose at docs/command-voice-standard.md:356,384 and .opencode/command/adv-archive.md:228,390-393,401 carry the canonical 5-variant phrase plus the orthogonal activation-pending variant.
- **[archive_only_evidence]** findings: Regression assertions to update if enum reworded: plugin/src/workflow-noise-reduction-assets.test.ts:225,237 and plugin/src/adv-autonomy-quality-assets.test.ts:251,301,319,322.
- **[archive_only_evidence]** findings: Runtime code change required: no — only spec/docs/voice-standard/command-prose plus matching test fixtures move together.
- **[archive_only_evidence]** risks: Six test assertions across two files are pinned to exact Local deploy phrases and the rq-archiveVisibility01 ID — silent drift manifests as asset-test failures rather than behavior breaks.
- **[archive_only_evidence]** risks: The 'ran; OpenCode activation pending restart' variant at .opencode/command/adv-archive.md:401 is not enumerated by rq-archiveVisibility01.1 — single-sided rewrite creates command/spec drift.
- **[unresolved_action]** open_questions: Should rq-archiveVisibility01.1 explicitly enumerate the activation-pending variant, or is the variant intentionally out-of-scope per rq-archiveVisibility01.3?
- **[unresolved_action]** open_questions: Is the spec text exact-phrase-pinned (current state) or should it tolerate equivalent phrasings so voice-standard refactors do not regress the test?
- **[agenda]** follow_ups: [packet-defect] Orchestrator packet omitted TASK_SCOPE, IN_SCOPE, OUT_OF_SCOPE, DONE_WHEN, STOP_WHEN, and VERIFICATION anchors; proceeded with prompt-defined SCOPE/TASK/EXPECTED OUTPUT and bounded read-only evidence collection.
- **[agenda]** follow_ups: [packet-defect] SCOPE KEY and ATTEMPT anchors not provided; used derived scope_key 'researcher:archive-subsystem-correctness' and attempt=1.
- **[agenda]** follow_ups: [design-note] Consider a future backlog item to replace the 6 exact-phrase deploy-status regex assertions with a single shared const/enum consumed by spec generation + tests, converting the vocabulary from heuristic (string match) to structural (schema). Out of scope for this change.
- **[agenda]** follow_ups: [tooling] lgrep semantic index timed out 3x this session (Voyage API/re-index); fell back to glob/grep/read per lgrep fallback policy. Recommend re-indexing before the next semantic-heavy pass.
- **[archive_only_evidence]** sources: Reachability proof engine (typed discriminated union): Release completion is decided by a total, discriminated ReleaseReachabilityProof union with 3 reachable proofs (local_merge|origin_default|pr_merged) and 6 unreachable proofs (local_unmerged|origin_unmerged|origin_push_unverified|pr_unmerged|pr_missing_merge_proof|blocked). Route-first (no_remote|direct|pr_* ) then proof-per-route. Structural, not heuristic.
- **[archive_only_evidence]** sources: Release gate structural enforcement: adv_gate_complete release path calls resolveReleaseReachability and refuses completion (RELEASE_REQUIRES_TRUNK_MERGE / CHANGE_BRANCH_NOT_REACHABLE*) unless a reachable proof exists. Canonical evidence string 'Phase 9 finalization shipped;' is structurally required (gate.ts:127), not prose-matched.
- **[archive_only_evidence]** sources: Recovery model — status repair invariants: Disk-projection status flip gated on 2 real invariants: all 7 gates done + archive bundle present on disk (findArchiveBundle). Requires precise completed/poisoned-workflow OR phase9_status.failed evidence + non-blank recoveryReason. Read-after-write verified (verifyStatusRepairReadAfterWrite). Never pushes/merges.
- **[archive_only_evidence]** sources: Recovery-consistency + projection-durability spec laws: Four coordinated MUST requirements make archive success gate on durable release-gate projection proof; recovery must revalidate the SAME origin/default-or-merged-PR proof; failed phase9 without proof fails closed with typed blocker; readback consistency (show archived, in-flight omits, archived includes once) is a spec invariant.
- **[archive_only_evidence]** sources: Idempotent retry path: Already-archived + bundle-present returns noOp success without repeating finalization/branch-delete/issue-close/cleanup; bundle-only status recovery re-verifies structural Phase 9 evidence before reconciling gate + phase9_status. Squash-merge-safe (changeTipSha threaded so detection survives branch deletion).
- **[archive_only_evidence]** sources: Deploy/activation reporting scope (this change's target): Command asset, voice templates, and 6 regression assertions already enumerate the 5-state Local deploy vocabulary including 'ran; OpenCode activation pending restart'. The durable spec law rq-archiveVisibility01.1 (spec.json:944) + human mirror (docs/specs/advance-workflow.md:823) enumerate only 4 states — confirmed one-sided command↔spec drift via grep: 'activation pending restart' has zero matches in spec.json and the mirror.
- **[archive_only_evidence]** architecture_assessment: The archive/release subsystem has a COHERENT structural-correctness model built on P33 (structural-before-heuristic). Its center is a total, typed ReleaseReachabilityProof discriminated union (git-finalize.ts:341-361) that is the single authority consumed identically by three surfaces: (1) forward archive finalization (finalizeRelease / verifyReleaseEvidenceFromMain, archive-gate.ts:544-668), (2) the release gate (gate.ts:269-333), and (3) recovery/retry (reconcileArchivedBundleRetry, adv_change_status_repair). This single-source design means direct-archive, PR-finalization, no_remote, recovery, and status projection cannot disagree about what 'reachable/shipped' means. Failure-mode coverage is strong: every unreachable proof maps to a typed blocker with remediation, recovery paths re-validate the SAME proof rather than trusting prior workflow state (rq-releaseFinalization01.10), and disk-projection recovery is gated on two real shipped invariants (7 gates done + bundle on disk) plus precise poisoned/completed-workflow evidence and read-after-write verification. Squash-merge + branch-deletion survivability is handled content-addressably via persisted changeTipSha (detectSquashMergeByTree). The spec law (rq-releaseFinalization01, rq-releaseProjectionDurability01, rq-archiveRecoveryConsistency01, rq-releaseRepairRecovery01, rq-archiveRetryIdempotence01) is a genuinely testable full-subsystem contract already. The scoped change (updateArchiveVisibilitySpec) targets one narrow, real drift: the 5th Local deploy status 'ran; OpenCode activation pending restart' is present in command/voice/test assets but absent from the durable rq-archiveVisibility01.1 requirement and its human mirror. This is prose-only alignment — zero runtime consumers of the deploy-status enum exist outside test fixtures (confirmed by adv-tron finding + grep). One structural weakness worth flagging: the 5-state deploy-status vocabulary is enforced only by exact-phrase regex assertions across two asset test files (6 pinned assertions), so it is string-brittle rather than schema-backed; any voice-standard reword regresses tests as string mismatch rather than behavior break.
- **[agenda]** follow_ups: [packet-defect] BRIEFING PACKET declared truncated/unavailable; proceeded with stated prompt scope and bounded ADV-tool + source evidence only.
- **[agenda]** follow_ups: rq-archiveVisibility01.1 open question: enumerate the activation-pending variant explicitly or scope it out per rq-archiveVisibility01.3 (design decision for orchestrator).
- **[archive_only_evidence]** sources: change.ts archive orchestration: rq-archiveOrdering01 idempotent bundle-exists retry path referenced in code with NO dedicated *.test.ts assertion (grep rq-archiveOrdering01 over *.test.ts = 0 hits).
- **[archive_only_evidence]** sources: archive-gate.ts recovery routing: All 3 Temporal interaction points (query/signal/poll) route completed-workflow errors through single recoverReleaseGateIfWorkflowCompleted → recoverReleaseGateViaDiskProjection path. Recovery-call visibility is already coherent, not a gap.
- **[archive_only_evidence]** sources: git-finalize dynamic-import audit: git-finalize.ts has zero dynamic imports; archive dynamic imports live in tool-layer change.ts/archive-gate.ts/recovery.ts (recovery-classification, _recovery-writers, service) — tool layer, not workflow-bundle-reachable. Boundary-guard risk is low.
- **[archive_only_evidence]** sources: Stale duplicate draft: Draft created 2026-07-07, all gates pending, Epic optimizeAdvPerformanceStructure shell, targets #106 archived-listing-timeout already addressed by shipped rq-archiveRetirement01 terminal-list work.
- **[archive_only_evidence]** sources: rq-archiveVisibility01 consumer audit (prior tron): Local deploy status enum is prose-only orchestrator marker with zero TS runtime consumers; 6 exact-phrase-pinned assertions across 2 asset test files; activation-pending variant (adv-archive.md:401) not enumerated by rq-archiveVisibility01.1 → single-sided reword = spec/command drift.
- **[archive_only_evidence]** sources: Release-finalization requirement spread: rq-releaseFinalization01 is the load-bearing release-proof law cited broadly; cross-spec consolidation is a doc-alignment opportunity, not a runtime gap.
- **[archive_only_evidence]** architecture_assessment: Archive subsystem is well-architected: typed ReleaseReachabilityProof as release authority, fail-closed audited disk-projection recovery routed uniformly through one path across all Temporal interaction points, and correct BEFORE-archive ordering of finalization+release-gate vs status transition (change.ts:2656-2659). The proposal's four flagged risks resolve unevenly against source: (1) rq-archiveOrdering01 deterministic coverage IS a real gap — the ordering/idempotent-retry invariant is referenced in production but has no dedicated test, covered only incidentally via rq-releaseProjectionDurability01; (2) recovery-call visibility is NOT a gap — routing is already single-path and coherent; (3) dynamic-import boundary risk is LOW — git-finalize.ts has no dynamic imports and archive dynamic imports are confined to the tool layer, not workflow-bundle-reachable; (4) cross-spec/prose drift (rq-archiveVisibility01 enum + activation-pending variant) is a real alignment opportunity with brittle exact-phrase test pins. Separately, diagnoseArchivedListingTimeout is a confirmed stale duplicate of shipped work.
- **[agenda]** follow_ups: [packet-defect] Orchestrator packet omitted formal SCOPE KEY, ATTEMPT, TASK_SCOPE/IN_SCOPE/OUT_OF_SCOPE, DONE_WHEN, STOP_WHEN, and VERIFICATION anchors; proceeded with the literal packet WORKING DIRECTORY, CHANGE, TASK, and EXPECTED_OUTPUT lines only
- **[agenda]** follow_ups: [packet-defect] Identity anchors inferred from prompt scope only; no canonical scope_key was provided in the packet; used tron:worktree-cleanup-diagnosis
- **[agenda]** follow_ups: no destructive operations were performed; read-only diagnosis only — no adv_worktree_delete, no adv_worktree_cleanup, no registry or branch mutations were made
- **[archive_only_evidence]** findings: Delete cascade order in advWorktreeDelete (index.ts:1925): registry lookup (1947) -> validateResolvedDeleteWorktreePath (1984) -> 3-condition integration gate (1997-2159) -> pre-hook uncommitted check (2164) -> isWorktreeInUse (2187) -> preDelete hooks (2204) -> post-hook re-check (2244) -> git worktree remove (2310) -> reapEmptyWorktreeParents (2322) -> worktreeDeletedSignal (2334)
- **[archive_only_evidence]** findings: isWorktreeInUse is Linux /proc-only, returns false on non-Linux or when /proc is unreadable; no fdesc/open-handle coverage; tests at in-use.test.ts cover non-Linux, exact-cwd, subdir-cwd, swallowed EACCES, but no fdesc test
- **[archive_only_evidence]** findings: opts.force bypasses UNCOMMITTED_WORK (2173) and HOOK_INTRODUCED_CHANGES (2255) but DOES NOT bypass the CWD-based in-use check at line 2187
- **[archive_only_evidence]** findings: MAX_PENDING_DELETE_ATTEMPTS=5 (index.ts:250); status cleanup uses forceAttempts:false (status.ts:462) so attempts>=5 items get retained without retry; manual tool defaults forceAttempts:true (adv-worktree.ts:2921) and re-attempts increment attempts past the cap (index-delete.test.ts:1218-1225 shows attempts:6 after one forced drain)
- **[archive_only_evidence]** findings: Triage returned 8 orphans: 6 terminal_cleanup_retained (attempts 5-7), 1 missing_from_temporal_unmerged (change/updateZlauncherTitles, 4 unmerged commits, on worktree-adhoc path), 1 missing_from_disk (change/fixDirectArchiveMerge, registry has entry no on-disk). wip_state lists 11 active worktrees showing the disk-missing one still as active
- **[archive_only_evidence]** findings: No structural guard prevents an agent from being asked to delete the worktree it currently occupies; only best-effort protection is isWorktreeInUse CWD check at index.ts:2187
- **[archive_only_evidence]** findings: call sites for advWorktreeCleanup: status.ts:452 with forceAttempts:false; change.ts:3013 archive with forceAttempts:false; manual tool default forceAttempts:true via executeWorktreeCleanup at adv-worktree.ts:2921
- **[archive_only_evidence]** findings: orphan classification at triage.ts:49-57: terminal_cleanup_retained, missing_from_disk, missing_from_temporal_unmerged, dirty_uncommitted_work, archived_not_cleaned, stale_head, missing_from_temporal, registry_missing_change_id
- **[archive_only_evidence]** findings: The 6 retained items with attempts 5-7 imply drainPastMax via force=true retried — past-cap increment is a known behavior at index.ts:510 (recordPendingDeleteFailure appends attempts + 1)
- **[archive_only_evidence]** findings: missing_from_disk allows safe registry entry removal; missing_from_temporal_unmerged requires manual branch review before any delete (orphan rejected at triage.ts:299)
- **[archive_only_evidence]** hotspots: plugin/src/tools/worktree/index.ts (3310 lines) — single mega-file housing create/delete/cleanup/symlink/copy/warp/portal logic; gate decisions, error classification, in-use probe, opencode cleanup, signal firing all inline
- **[archive_only_evidence]** hotspots: plugin/src/tools/worktree/in-use.ts — sole in-use detection; Linux /proc/CWD only with no fdesc/lsof coverage; the silent EACCES swallow at line 49 means an unreadable worktree silently treats as not-in-use
- **[archive_only_evidence]** risks: Best-effort CWD-only in-use check: an agent process with CWD elsewhere (e.g., tmux session, externally launched vim, IDE remote file open) but files open in the worktree registers as not-in-use; delete proceeds and the data could still be referenced (in-use.ts:21-53)
- **[archive_only_evidence]** risks: cleanupOpenCodeWorkspaceForWorktree (index.ts:1444) runs AFTER the in-use check; for a non-CWD-held worktree, the OpenCode workspace is silently deleted, leaving the agent without session context but without an obvious failure
- **[archive_only_evidence]** risks: force + non-registered branch deletion path (index.ts:2064-2091) bypasses the registry-anchored terminal-state safety: force+non-reg uses verifyNonAdvBranchIntegration (merged-only) instead of verifyMissingRegistryChangeBranchIntegration (terminal+merged); under force an agent can delete a branch whose change is still active
- **[archive_only_evidence]** risks: status.ts:452 forceAttempts:false means MAX_PENDING_DELETE_ATTEMPTS=5 acts as a silent cap; the 6 stale retained items will never be re-attempted through /adv-status; manual adv_worktree_cleanup is required and each retry increments attempts
- **[archive_only_evidence]** risks: change/updateZlauncherTitles orphan at worktree-adhoc (not the canonical $ADV_WORKTREE_HOME path); adv_worktree_resume with changeId may not relocate it without force; review of 4 unmerged commits required before any cleanup
- **[archive_only_evidence]** risks: In-use check is CWD-only and silent on EACCES (in-use.ts:48) — degraded graceful-fail-to-not-in-use means hostile or partly-broken systems treat worktrees as safely deletable even when they are not
- **[archive_only_evidence]** risks: orphan change/fixDirectArchiveMerge (registry present, no on-disk) is shown as active in wip_state but missing_from_disk in triage — surface inconsistency could mislead agents operating on stale snapshots
- **[unresolved_action]** open_questions: Does the user have evidence of concrete error messages from past worktree-deletion failures, or is this a forward-looking audit of the surface?
- **[unresolved_action]** open_questions: For each retained terminal_cleanup_retained item with attempts>=5, should the agent first attempt manual cwd-inspection and force-uncommitted reconciliation before retrying cleanup?
- **[unresolved_action]** open_questions: Should change/updateZlauncherTitles be resumed (adv_worktree_resume) for review before any cleanup pass, or abandoned via direct branch deletion with no ADV-owned state?
- **[unresolved_action]** open_questions: Which call site triggered the report (status auto-triggered vs manual user invocation), and did attempts increment past MAX during this run?
- **[unresolved_action]** open_questions: Are there any session/policy reasons isWorktreeInUse should also check OpenCode session workspace ownership, not just /proc/CWD?
- **[agenda]** follow_ups: lgrep_search_semantic timed out (8s) once; used symbol/grep/read + canonical git docs instead. Re-index may help future runs.
- **[agenda]** follow_ups: BRIEFING PACKET reported generated-but-truncated by the packet; treated as unavailable — scope/contract/affected-files reconstructed from adv_change_show contract (22 items) and source, which is authoritative here.
- **[agenda]** follow_ups: Design phase should verify whether change.archive-phase9.test.ts is already table-driven before adding a new parametrized route table (avoid duplicate seam).
- **[archive_only_evidence]** sources: git-finalize.ts ReleaseReachabilityProof + call sites: Single typed discriminated-union proof authority (local_merge|origin_default|pr_merged positive; fail-closed negatives). Already reused across 4 finalization/gate sites; mocked consistently in 3 test files. Existing structural release-proof seam — design must reuse, not fork.
- **[archive_only_evidence]** sources: Shared deletion authority (drainPendingDeletes): advWorktreeCleanup and advWorktreeDelete already route through one deletion authority + one manual-retry queue (drainPendingDeletes). AC4 'shared deletion authority' already satisfied structurally.

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
| OOS1 | out_of_scope | not_applicable |
| OOS2 | out_of_scope | not_applicable |

## Unresolved Actions

- verification_missing: No adv_run_test evidence found for reported command: pnpm vitest run src/tools/archive-helpers/git-finalize.test.ts -t "route × proof discriminants"
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/archive-helpers/git-finalize.test.ts src/tools/change.archive-phase9.test.ts src/tools/change.archive-repair.test.ts src/tools/change.status-repair.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec tsc --noEmit -p tsconfig.json
- Note the pre-existing prettier drift (3 files) when running full `pnpm run check` for release verification — it is outside this task's scope and may belong to concurrent task tk-f1f9465ad8b8 or an earlier checkpoint.
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/utils/workspace-warp.test.ts src/tools/worktree/index-delete.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/utils/workspace-warp.test.ts src/tools/worktree/index-delete.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm run schemas:check && pnpm run typecheck && pnpm exec tsx scripts/check-test-isolation.ts && pnpm run lint && prettier --check (touched files)
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/utils/workspace-warp.test.ts src/tools/worktree/index-delete.test.ts src/tools/adv-worktree.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/workflow-noise-reduction-assets.test.ts (RED, before law edit)
- verification_missing: No adv_run_test evidence found for reported command: node -e JSON.parse(.adv/specs/advance-workflow/spec.json)
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/workflow-noise-reduction-assets.test.ts src/adv-autonomy-quality-assets.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec prettier --check src/workflow-noise-reduction-assets.test.ts && pnpm exec eslint src/workflow-noise-reduction-assets.test.ts
- Should rq-archiveVisibility01.1 explicitly enumerate the activation-pending variant, or is the variant intentionally out-of-scope per rq-archiveVisibility01.3?
- Is the spec text exact-phrase-pinned (current state) or should it tolerate equivalent phrasings so voice-standard refactors do not regress the test?
- Does the user have evidence of concrete error messages from past worktree-deletion failures, or is this a forward-looking audit of the surface?
- For each retained terminal_cleanup_retained item with attempts>=5, should the agent first attempt manual cwd-inspection and force-uncommitted reconciliation before retrying cleanup?
- Should change/updateZlauncherTitles be resumed (adv_worktree_resume) for review before any cleanup pass, or abandoned via direct branch deletion with no ADV-owned state?
- Which call site triggered the report (status auto-triggered vs manual user invocation), and did attempts increment past MAX during this run?
- Are there any session/policy reasons isWorktreeInUse should also check OpenCode session workspace ownership, not just /proc/CWD?
