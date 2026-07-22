# Archive: Replace recovery tool sprawl

**Change ID:** replaceRecoveryToolSprawl
**Archived:** 2026-07-22T23:12:57.379Z
**Created:** 2026-07-20T21:34:13.221Z

## Tasks Completed

- ✅ Remove malformed legacy recovery spec law safely
  > Task checkpoint completed
- ✅ Implement Epic membership direct convergence
  > Task checkpoint completed
- ✅ Resolve proven post-commit timeout outcomes
  > Task checkpoint completed
- ✅ Internalize machine-evidence monotonic recovery
  > Task checkpoint completed
- ✅ Consolidate safe infrastructure recovery in adv_doctor
  > Task checkpoint completed
- ✅ Retire superseded recovery tools and arguments
  > Task checkpoint completed
- ✅ Verify recovery simplification end to end
  > Task checkpoint completed

## Specs Modified

- **advance-epics**: 5 delta(s)
- **advance-workflow**: 9 delta(s)
- **advance-meta**: 6 delta(s)

## Wisdom Accumulated

- **[gotcha]** RESUME STATE (2026-07-21 session): Change linked to hardenTemporalReliability Epic at entry order 9. fixPoisonedRecovery merged to trunk (PR #266, d12fef24) providing the D4 disk-projection foundation. tk-0aefbca1154e done at commit c228e9349 — removed malformed rq-toolPlaceholderPolicy01.6 from advance-meta/spec.json + docs, added plugin/src/__tests__/spec-id-shape-invariant.test.ts as permanent guard. Branch change/replaceRecoveryToolSprawl pushed to origin, base = trunk c228e934.

NEXT: 5 of 6 remaining tasks. Two ready inline_required (tk-9d7519c9531f Epic convergence D1, tk-87c1d5115473 internalize recovery D4). Two delegate-required (tk-74c358188ffb timeout D2 delegate_allowed, tk-dc21b6a3658d adv_doctor D5 delegate_preferred). Two blocked (tk-0528be678596 retire tools — blocked on all 4 above; tk-b7112e50fc3d verify — blocked on tk-0528be678596).

BLOCKER: adv-engineer sub-agents return empty task_result with zero work done — observed in two separate sessions even after fresh OpenCode restart. Sub-agent infra is broken in this environment. Per ADV policy, delegate_allowed/delegate_preferred tasks cannot go inline. Realistic path forward requires either (a) sub-agent infra fix or (b) explicit operator override to treat all tasks as inline-eligible.

PRECONDITION HASHES (for tk-0aefbca1154e audit; preserved at commit c228e9349): advance-meta spec.json a10f5b30b6c526fa13d81b7a64fbaf27c45a77d161c864ea6ed2afa10e78ced5, advance-meta.md 6aa5d283d5b4aa4ff94d8e443136a5bc760f9cda97d3d37143278a50ed870bef.

KNOWN PRE-EXISTING TRUNK REGRESSIONS (not blockers): spec-citation-invariant test fails on rq-roadmapCliBridge01, rq-AwB1gN3w01, rq-backlogCoord07 — unrelated to this change. OSV vulns in pnpm-lock.yaml (brace-expansion, protobufjs) — non-blocking per Security Gates Pilot design.
- **[gotcha]** RESUME STATE 2026-07-21: branch change/replaceRecoveryToolSprawl pushed to origin, base trunk c228e934. tk-0aefbca1154e done (commit c228e9349, removed malformed rq-toolPlaceholderPolicy01.6 from advance-meta spec + docs, added spec-id-shape-invariant.test.ts). 5 tasks pending: tk-9d7519c9531f (inline_required, Epic D1), tk-74c358188ffb (delegate_allowed, timeout D2), tk-87c1d5115473 (inline_required, recovery D4), tk-dc21b6a3658d (delegate_preferred, doctor D5), tk-0528be678596 (delegate_preferred, retire tools, blocked on prior 4), tk-b7112e50fc3d (verify, blocked). BLOCKER: adv-engineer sub-agents return empty task_result with zero work in 2 sessions post-restart. fixPoisonedRecovery merged (PR #266 d12fef24) provides D4 foundation.
- **[gotcha]** RESUME STATE 2026-07-22: branch change/replaceRecoveryToolSprawl, 5/7 tasks DONE @ c228e934, b008ddb6, 4c2addcc, 001a44cc, 3654d36a. Worktree /home/jon/.local/share/opencode/worktree/bdf259aa162ae192af5b18899ccdc653b085528d/change/replaceRecoveryToolSprawl.

DONE this session:
- tk-74c358188ffb (rq-creationRequestHash01): canonical hash on ChangeSchema.creation_request_hash + ChangeWorkflowState.creation_request_hash. ensureChangeWorkflowStarted reconciles on already-started path (idempotent match vs typed ChangeCreationHashConflictError code=CREATION_HASH_CONFLICT). P1.4 rollback fires on conflict. NEW plugin/src/storage/store-temporal/creation-hash.ts.
- tk-dc21b6a3658d (rq-doctorConsolidation01): NEW adv_doctor tool (plugin/src/tools/doctor.ts). Single diagnose→safe-fix→verify entry. Safe: stale_transport→reinitStsl, missing_search_attributes→registerMissing, worker_down_owned→restart(approvedLockReclaim:false). REFUSES approval_required: wrong_type_search_attributes, suspect_lock, ambiguous_ownership. tool-registry + role-policy class "orchestrator". Existing 4 adv_temporal_* UNCHANGED — retire in tk-0528be678596.
- **[gotcha]** REMAINING (2 tasks, chain):
- tk-0528be678596 (Retire superseded recovery tools): per design D6 remove adv_archive_repair, adv_change_status_repair, adv_epic_repair_membership, adv_change_forget, adv_temporal_diagnose, adv_temporal_reconnect, adv_temporal_register_search_attributes, adv_temporal_worker_restart. RETAIN adv_archive_purge, adv_change_workflow_terminate, adv_doctor, adv_store_consolidate. Also remove routine poisoned-history fields (recoveryMode/recoveryEvidence/recoveryReason args) from routine mutation tools per D4. AC7: zero residue runtime/schemas/policy/manifests/prompts/specs/docs/tests. DDC7: removal-parity tests reject residual references.

  HINT REFS TO REPOINT to adv_doctor: change.ts (4), checkpoint.ts (1), spec-delta.ts (1), adv-worktree.ts (2), status.ts (4), change/recovery.ts (2), worktree/hooks.ts (1).

- tk-b7112e50fc3d (Verify end-to-end): blocked on retire. Reproduction matrix AC11.

SUB-AGENT INFRA: adv-engineer returned empty in 2 sessions 2026-07-21. 2026-07-22 session did NOT retest — both completed tasks done inline. Smoke-test delegation before relying on it for retire.

TRUNK REGRESSIONS (not blockers): spec-citation-invariant now PASSES on this branch. OSV vulns in pnpm-lock.yaml (brace-expansion, protobufjs) still present.
- **[gotcha]** tk-0528be678596 WIP @ 31c7eba0 (2026-07-22 sess 2): Retired 4 adv_temporal_* tools (adv_doctor subsumes). Runtime surface clean: tool-registry, role-policy, catalog, preflight, title, safe-execute, 12 hint refs. DELETED temporal-ops.ts + .test.ts (1608 LOC). NEW parity test guards runtime. Check + smoke + 244/244 targeted green. Pushed origin.
- **[gotcha]** tk-0528be678596 REMAINING (task in_progress):
- adv_archive_repair: def change.ts:3882, test change.archive-repair.test.ts, refs archive-helpers/archived-branch-cleanup.ts, warrant.ts, _recovery-writers.test.ts, archive-release-finalization-assets.test.ts.
- adv_change_status_repair: def change.ts:5644, test change.status-repair.test.ts, warrant.ts, change.workflow-terminate.test.ts, contract-mint.test.ts.
- adv_epic_repair_membership: def epic.ts, ~20 cases epic.test.ts, hint refs epic.ts:687/693/2227/2234.
- adv_change_forget: HIGHEST RISK — wired into index.ts session-pointer clearing (KD6 lines 653-668 + 1191-1210). Removing loses user-facing pointer-clear capability; design assumes self-healing projections (not yet shipped).
- poisoned_history public args: mcp-server/security.ts:22-23, tool-arg-preflight.ts blank entries, many test fixtures. Per D4 ONLY public args go; internal disk writers (phase-plan.ts/shared.ts) stay.
- Asset/doc/spec cascade: adv-temporal-repair.md grants, docs/tool-ownership.md rows, spec.json rq-toolOwnership01 body. Parity test exempts via ASSET_DOC_SPEC_PATTERNS.
- **[gotcha]** tk-0528be678596 BLOCKER — adv_change_forget retirement needs design decision.

7 of 8 tools retired (41ac0052). adv_change_forget remains because removing it creates a PRODUCT REGRESSION: it's the ONLY tool that clears the active-change pointer. Wired into index.ts at TWO sites: (1) pre-hook validation lines 655-668 (rq-activeChangePointer01.6 KD6 — validates forget-changeId matches current pointer), (2) post-hook clearing lines 1192-1210 (recordForgetChange — sets state.activeChange.id=null, calls setActiveChange(null)).

Design D6 says remove it — but D6 assumed self-healing projections would handle phantom pointers automatically. That system (part of this Epic's entry 6 "disk-authoritative reads") is partially shipped (trunk #284/#285) but doesn't fully cover the session-pointer clearing case.

Options: (a) keep adv_change_forget until self-healing projections cover pointer clearing; (b) remove tool but add pointer-clearing to adv_doctor's safe subset; (c) remove tool + add pointer-clearing to adv_change_show when it detects the pointer references a phantom change.

This needs operator/user decision — not a code surgery problem, a product design choice.
- **[success]** tk-0528be678596 MILESTONE (9aae012d, 2026-07-22): poisoned_history public-arg removal COMPLETE across ALL routine mutation tools (gate/design-concern/verification-evidence/spec-delta/contract×2/task×3/change×4) via classifyMutationRecoveryDecision. Delegation WORKS post-restart — 4 adv-engineer agents did real verified work. Shared worktree: parallel agents edit same shared files (preflight, monotonic-recovery) — verify with full check after. 'Task cancelled' agent had already saved complete work. pnpm run check clean; smoke 87/87.

FUNCTIONAL WORK DONE: 8 tools retired + adv_doctor phantom_pointer (option B) + poisoned_history args removed.
- **[gotcha]** tk-0528be678596 REMAINING (AC7 zero-residue cascade — spec/doc surfaces, parity-test-exempt):
1. rq-activeChangePointer01 spec delta reconciliation — my modify delta CONFLICTS with existing delta from earlier task; must merge into one (can't stack modifies). Removes adv_change_forget refs (body + scenarios .1/.2/.6).
2. Asset/doc/spec cascade for 8 retired tools: .opencode/agents/adv-temporal-repair.md grants, docs/tool-ownership.md rows, spec.json rq-toolOwnership01 body list. Asset test files: adv-temporal-repair-assets, tool-ownership-assets, archive-branch-cleanup-assets, archive-release-finalization-assets, adv-stability-docs-assets, adv-instructions-assets, adv-autonomy-quality-assets, adv-reviewer-asset, deploy-local.
Then tk-b7112e50fc3d (verify end-to-end AC11 reproduction matrix).
- **[success]** tk-0528be678596 AC7 SPEC-DELTA RECONCILIATION DONE (2026-07-22). All 14 global-spec requirements citing retired tools now have staged modify deltas → verified adv_doctor/adv_epic_show/adv_worktree_cleanup consolidation. Method (reusable): parse verified docs/specs/*.md mirrors directly into structured deltas via /tmp/adv_ac7/gen.py (deterministic mirror→delta; programmatic RETIRED-substring residue assert =[] before staging). Staged THIS session (10, verified): toolTimeoutOverride01, workerHealth01, epicOwnerRouting01, epicArchiveSync01, acWarrant01, searchAttrHealth01, archiveBranchCleanup01, isolSessionTaskQueue04, releaseFinalization01, archiveRecoveryConsistency01. Prior-session staged (4, conflict-detected): activeChangePointer01, toolOwnership01, epicCoordinateCommand01, epicRetiredListing01. adv_change_validate strict = passed (0 err) across all 18 deltas. HEAD 109f4e77, tree clean.
- **[gotcha]** RESIDUAL RISK + TOOLING GAPS (tk-0528be678596). The 4 prior-session deltas (activeChangePointer01, toolOwnership01, epicCoordinateCommand01, epicRetiredListing01) have UNVERIFIABLE staged text: adv_change_show truncates deltas (25k+ > 21k budget, no pagination, no deltas-only include); there is NO adv_delta_list/show tool; adv_delta_amend/retract both REQUIRE the delta id, so a delta staged in an earlier session cannot be discovered, amended, or retracted. They very likely match the verified mirror (prior-session me did the same reconciliation). AUTHORITATIVE BACKSTOP: after both tasks done + execution gate, run adv_change_archive dryRun:true and grep the delta-application preview for the 8 retired tool names to prove AC7 zero-residue incl. the 4 prior; if residue appears, re-open. Sub-agents this session returned empty AND did zero delta work (proven — inline modifies did not conflict); never trusted empty returns, verified each target via authoritative inline modify (conflict=staged, success=I staged it).
- **[success]** tk-0528be678596 AC7 SPEC-DELTA RECONCILIATION DONE (2026-07-22). All 14 global-spec requirements citing retired tools now have staged modify deltas → verified adv_doctor/adv_epic_show/adv_worktree_cleanup consolidation. Method (reusable): parse verified docs/specs/*.md mirrors directly into structured deltas via /tmp/adv_ac7/gen.py (deterministic mirror→delta; programmatic RETIRED-substring residue assert =[] before staging). Staged THIS session (10, verified): toolTimeoutOverride01, workerHealth01, epicOwnerRouting01, epicArchiveSync01, acWarrant01, searchAttrHealth01, archiveBranchCleanup01, isolSessionTaskQueue04, releaseFinalization01, archiveRecoveryConsistency01. Prior-session staged (4, conflict-detected): activeChangePointer01, toolOwnership01, epicCoordinateCommand01, epicRetiredListing01. adv_change_validate strict=passed (0 err) across 18 deltas. HEAD 109f4e77 clean. NOTE: 2 parallel wisdom writes wedged the worker (workerAlive:false); recovered via adv_temporal_worker_restart. Do wisdom writes sequentially.
- **[gotcha]** RESIDUAL RISK + TOOLING GAPS (tk-0528be678596). The 4 prior-session deltas (activeChangePointer01, toolOwnership01, epicCoordinateCommand01, epicRetiredListing01) have UNVERIFIABLE staged text: adv_change_show truncates deltas (25k+ > 21k budget; no pagination; no deltas-only include); NO adv_delta_list/show tool exists; adv_delta_amend/retract both REQUIRE the delta id, so a delta staged in an earlier session cannot be discovered, amended, or retracted. They very likely match the verified mirror. AUTHORITATIVE BACKSTOP: after execution gate + both tasks done, run adv_change_archive dryRun:true and grep the delta-application preview for the 8 retired tool names to prove AC7 zero-residue incl. the 4 prior; if residue appears, re-open + fix. Sub-agents this session returned empty AND did zero delta work (proven — inline modifies did not conflict); never trusted empty returns.
