# Contract Traceability

**Change ID:** fixShippedWorkflowTermination
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-20T21:35:08.155Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | AC9 regression fixture at change.workflow-terminate.test.ts:1305+ reproduces fixWorkflowReliabilityDefects-shaped state (draft live + 7 gates done + phase9 done + bundle terminal + RUNNING describe no poison) and proves dryRun qualifies it + execution terminates exact pin + converges reads. Targeted suite 80/80 (tr_mrtqhqf3_c028b19f). |
| SC2 | success_criterion | pass | review | RUNNING-without-poison AND without shipped-terminal proof refuses (change.ts:4901-4921); unshipped gates refuse before describe (change.ts:4632-4644); unknown status refuses (change.ts:4890-4898). Tests: refuses RUNNING without poison AND without proof; refuses change without shipped acceptance/release gate proof; refuses when run status cannot be classified. |
| SC3 | success_criterion | pass | review | convergeTerminalAuthority writes status+lifecycleState=archived atomically; readback proves showStatus=archived, showLifecycleState=archived, inFlightCount=0, archivedCount=1 (change.ts:240-270; change.workflow-terminate.test.ts:930-1002 positive convergence test). |
| SC4 | success_criterion | pass | review | Existing poisoned-history path preserved (change.ts:4736-4748); archive-purge semantics unchanged; status-repair unchanged. All poison/archive-purge/status-repair tests in targeted suite (4 files, 80 tests) pass. |
| AC1 | acceptance_criterion | pass | test | change.ts:4584-4602 refuses approvedByUser !== true and blank approvalEvidence before any read/mutation. Tests: rejects approvedByUser !== true; rejects blank approvalEvidence (change.workflow-terminate.test.ts:185-222). |
| AC2 | acceptance_criterion | pass | test | Eligibility classification at change.ts:4932-4934 routes via wedgedEvidence (poisoned_history) vs shippedTerminalProof (shipped_terminal). Tests: refuses RUNNING without poison AND without proof; dryRun preserves eligibilityClass=poisoned_history for poisoned runs. |
| AC3 | acceptance_criterion | pass | test | computeShippedTerminalProof at change.ts:4721-4726 requires all 7 disk gates done + phase9 done + schema-valid bundle with matching embedded change.id. Refusal codes: PROOF_NO_BUNDLE, PROOF_BUNDLE_ID_MISMATCH, PROOF_MISSING_GATES, PROOF_MISSING_PHASE9, PROOF_INVALID_DISK_PROJECTION, PROOF_INVALID_BUNDLE. Tests: refuses PROOF_BUNDLE_ID_MISMATCH; refuses no-bundle; refuses describe-throws-not-found + proof fails (disk-backed IDEMPOTENT_BUT_PROOF_MISSING). Blocker 1 fix at change.ts:4750-4778. |
| AC4 | acceptance_criterion | pass | test | Pre-mutation describe at change.ts:4686 pins runId via workflowRunPinFromDescription. dryRun at change.ts:4936-4957 returns eligibilityClass, runId, runStatus, proof components without termination or refresh. Pinned handle at change.ts:4961-4966 binds (workflowId, runId). Tests: dryRun returns structured pin assessment; terminates exact pinned run. |
| AC5 | acceptance_criterion | pass | test | Refusals: unknown status (change.ts:4890-4898); missing runId (change.ts:4922-4930); unshipped gates (change.ts:4632-4644); IDEMPOTENT_BUT_PROOF_MISSING for terminal-status without proof (change.ts:4821-4839) and describe-throws-not-found without proof (change.ts:4760-4778). RUNNING alone never authorizes. Tests cover each refusal path. |
| AC6 | acceptance_criterion | pass | test | Non-idempotent terminate failure returns before cache refresh or projection mutation (change.ts:4983-4992). Convergence failures route through formatConvergeFailure with typed partialRecovery shape (change.ts:319+). Tests: terminate failure returns structured error before projection mutation; readback failure returns typed partialRecovery. |
| AC7 | acceptance_criterion | pass | test | convergeTerminalAuthority at change.ts:200+ writes status=archived + lifecycleState=archived, readback verifies showStatus=archived + showLifecycleState=archived + inFlightCount=0 + archivedCount=1. Idempotent completed/not-found routes through convergence when proof valid (change.ts:4770-4815, 4842-4887). Tests: converges when describe throws not-found (proof valid); converges when pinned terminate already completed. |
| AC8 | acceptance_criterion | pass | test | Successor check #1 pre-write (change.ts:210+) and #2 post-readback (change.ts:272-309) return typed successorRace / lateSuccessorRace. Non-completed error from check #2 returns typed readbackFailed partial-recovery (change.ts:289-309). Tests: successor #1 race; successor #2 late race; successor #2 describe failure surfaces typed partial-recovery. |
| AC9 | acceptance_criterion | pass | test | AC9 regression fixture at change.workflow-terminate.test.ts:1305+ reproduces fixWorkflowReliabilityDefects state end-to-end: live store says draft, all 7 gates done, phase 9 done, archive inventory/bundle terminal, describe returns RUNNING without poison. Dry-run qualifies, execution terminates exact pin, converges reads. |
| AC10 | acceptance_criterion | pass | test | Targeted suite (4 files, 80 tests) includes existing poison-qualified termination tests, archived-change routing, archive-purge tests (change.archive-purge.test.ts), status-repair tests (change.status-repair.test.ts), exact-pin failure tests. All pass. |
| C1 | constraint | respected | static_check | Operator-only approval gates enforced first (change.ts:4584-4602). approvalEvidence required, audited in authorization.evidence passed to convergeTerminalAuthority (change.ts:4780-4786). |
| C2 | constraint | respected | static_check | Implementation uses only describe() and terminate() on Temporal handles. No ResetWorkflow, no ResealWorkflow, no history rewrite APIs invoked. |
| C3 | constraint | respected | static_check | Shipped-terminal path preserves archive bundle (no rm/mkdir on archive paths in the termination flow). includeDiskBundle escalation only on adv_archive_purge (unchanged). |
| C4 | constraint | respected | static_check | computeShippedTerminalProof parses structural state: gates object, phase9_status.status, archive bundle change.json with embedded change.id. No title/age/branch-name/status-string/free-text heuristics used. |
| C5 | constraint | respected | static_check | Implementation only modifies change.status and change.lifecycleState on the converging projection. Accepted-delta immutable projection safeguards in archive.ts unchanged; delta_add/modify paths untouched. |
| C6 | constraint | respected | static_check | Worktree-resumed: adv_worktree_resume changeId:fixShippedWorkflowTermination returned path /home/jon/.local/share/opencode/worktree/bdf259aa162ae192af5b18899ccdc653b085528d/change/fixShippedWorkflowTermination. All edits and commits in worktree, not trunk. Trunk-write firewall respected. |
| DONT1 | avoidance | respected | review | poisonedDescriptionEvidence predicate unchanged. Reviewer's required_main_agent_actions: Do not revisit poisoned-history eligibility semantics except regression — respected. |
| DONT2 | avoidance | respected | review | RUNNING/PAUSED + user approval alone refuses at change.ts:4901-4921 (shippedTerminalProof must be valid). Tests: refuses RUNNING without poisoned-history describe evidence. |
| DONT3 | avoidance | respected | review | computeShippedTerminalProof parses embedded change.id from bundle's change.json (shipped-terminal-proof.ts). Bundle directory naming alone is insufficient — PROOF_BUNDLE_ID_MISMATCH test proves refusal when suffix matches but embedded id differs. |
| DONT4 | avoidance | respected | review | Success path requires convergeTerminalAuthority → readback verification before reporting converged (change.ts:5020+). Readback failure returns typed partialRecovery (change.ts:264-270). Tests: readback failure returns typed partialRecovery. |
| DONT5 | avoidance | respected | review | fixPoisonedRecovery not modified by this change. Diff stat: only change.ts and change.workflow-terminate.test.ts touched in commits 03eca5dd and 07a346d5. |
| OOS1 | out_of_scope | not_applicable | not_applicable | General archive enumeration performance is owned by fixArchivedBranchCleanup; no enumeration code touched here. |
| OOS2 | out_of_scope | not_applicable | not_applicable | Legacy design-validation report tolerance owned by makeLegacyDesignValidation; no design-validation paths touched here. |
| OOS3 | out_of_scope | not_applicable | not_applicable | This change is single-change recovery only. Bulk repair lives in adv_archive_repair action=reconcile (unchanged). |
| OOS4 | out_of_scope | not_applicable | not_applicable | No new workflow reset or history-inspection tooling introduced. Uses existing describe/terminate APIs only. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-3328ce76ab02 | AC6, AC7 |  |  |  |
| tk-2aac78a57f2d | AC2, AC4, AC5 |  | DONT1, DONT2 |  |
| tk-3b6e07bc6414 | AC3 |  | C4 |  |
| tk-a24b4c7d19bb | AC6, AC7, AC8 |  | DONT4 |  |
| tk-0317bb560640 | AC7 |  | C5 |  |
| tk-ab2c2aeffdf9 | AC9 |  |  |  |
| tk-a3473f96d634 |  | AC1, AC10 | DONT1 |  |
| tk-b4310459ca01 |  |  | C1, C4 |  |
| tk-a69549fd7f70 | AC8 |  |  |  |
