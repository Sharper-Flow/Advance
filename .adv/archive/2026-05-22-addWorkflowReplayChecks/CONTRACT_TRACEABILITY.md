# Contract Traceability

**Change ID:** addWorkflowReplayChecks
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-05-22T13:52:00.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | Replay determinism test uses Worker.runReplayHistory against committed histories; RED reproduced TMPRL1100 before compatibility patch; targeted and full tests passed. |
| AC2 | acceptance_criterion | pass | test | Committed fixGateAutoWorktree fixture metadata records incidentEventId 182, eventType EVENT_TYPE_ACTIVITY_TASK_SCHEDULED, TMPRL1100 cover string; replay test asserts metadata. |
| AC3 | acceptance_criterion | pass | test | workflows.ts defines DISCOVERY_CONTRACT_READINESS_PATCH='discovery-contract-readiness-v1' with rationale/deprecation comment and uses wf.patched for legacy discovery histories; specs/docs record workflow versioning rule. |
| AC4 | acceptance_criterion | pass | test | listWorktreesAcrossChanges returns structured records/warnings/poisonedWorkflows and catches per-change query failures; state-session-lifecycle test verifies healthy worktree remains visible with poisoned peer. |
| AC5 | acceptance_criterion | pass | test | adv_wip_state exposes poisoned_workflows while preserving warnings; backlog tests verify structured metadata and healthy worktrees remain visible. |
| AC6 | acceptance_criterion | pass | test | Poison detection paths only return metadata/warnings; docs/specs require quarantine/read-only-first and forbid automatic terminate/reset/reseed/archive/delete actions. |
| AC7 | acceptance_criterion | pass | test | workflowPoisonedDescriptionEvidence extracts bounded exact evidence including TMPRL1100/NonDeterministic markers; worktree and recovery-probe tests assert evidence capture. |
| AC8 | acceptance_criterion | pass | test | No destructive poison recovery action was added; docs require explicit user approval/audit before destructive action; existing destructive ADV tools remain approval-gated. |
| AC9 | acceptance_criterion | pass | test | worktree state imports shared recovery-probe and recovery-classification helpers; no local regex-only owner in state path; recovery-probe tests cover marker behavior. |
| AC10 | acceptance_criterion | pass | test | advance-workflow spec and docs/temporal-recovery.md state worker restart is not a TMPRL1100/nondeterminism repair; restart only after compatibility understood. |
| AC11 | acceptance_criterion | pass | test | Post-remediation verification passed: targeted replay/backlog/worktree/recovery/gate/signal/spec-citation tests; pnpm run check; pnpm run build; full pnpm test; strict change validation. |
| C1 | constraint | respected | static_check | changeWorkflow remains signal/query-only; no defineUpdate introduced; workflow tests and full suite passed. |
| C2 | constraint | respected | static_check | Temporal remains live state source; change adds replay checks/read-path resilience, not alternate state authority. |
| C3 | constraint | respected | static_check | Replay compatibility is machine-verified by Worker.runReplayHistory test, not heuristic-only inference. |
| C4 | constraint | respected | static_check | Poisoned workflow classification reuses recovery-probe and temporal recovery-classification helpers. |
| C5 | constraint | respected | static_check | Docs/specs and implementation keep poisoned terminal workflows in read-only metadata/quarantine posture by default. |
| C6 | constraint | respected | static_check | Workflow-affecting change in temporal/ is covered by replay fixture test and compatibility patch policy/spec. |
| C7 | constraint | respected | static_check | All changed files are within current Advance repo; cross-repo review found no target_repo/target_path work. |
| DONT1 | avoidance | respected | review | No worker restart/retry is used as TMPRL1100 repair; docs explicitly reject restart-only repair. |
| DONT2 | avoidance | respected | review | Worktree and WIP tests verify healthy WIP remains visible when a workflow query is poisoned. |
| DONT3 | avoidance | respected | review | Implementation records poison metadata only; no terminate/reset/reseed/mutate path added without evidence/approval. |
| DONT4 | avoidance | respected | review | Only targeted replay compatibility, worktree/WIP read resilience, specs/docs, and small review remediation were changed; no broad workflow-handler rewrite. |
| DONT5 | avoidance | respected | review | Archive, worktree cleanup, and backlog claim safety checks were not weakened; read-path changes are additive and partial-result preserving. |
| DONT6 | avoidance | respected | review | No terminal/Warp navigation behavior was made part of correctness. |
| DONT7 | avoidance | respected | review | No ADV state files or Temporal DB rows were manually edited; mutations used source edits and ADV tools only. |
| OOS1 | out_of_scope | not_applicable | not_applicable | Temporal replacement was not implemented or proposed in code changes. |
| OOS2 | out_of_scope | not_applicable | not_applicable | No manual Temporal database surgery performed. |
| OOS3 | out_of_scope | not_applicable | not_applicable | No broad rewrite of all change workflow handlers; patch is targeted. |
| OOS4 | out_of_scope | not_applicable | not_applicable | Task-completion semantics were not changed beyond tests/checkpoint evidence. |
| OOS5 | out_of_scope | not_applicable | not_applicable | Archive release ordering was not modified except docs noting interaction. |
| OOS6 | out_of_scope | not_applicable | not_applicable | Terminal/Warp workspace switching was not changed. |
| OOS7 | out_of_scope | not_applicable | not_applicable | External spec-conformance integration was not added; design did not require it. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-56d8f209d83d | AC1, AC2, AC3 | AC1, AC2 | C1, C2, C3, C6, DONT1, DONT4, OOS1, OOS2, OOS3 |  |
| tk-72eeff9ac71d | AC4, AC7, AC9 | AC4, AC7, AC9 | C1, C2, C3, C4, C5, DONT2, DONT3, DONT5, DONT7, OOS1, OOS3, OOS5 |  |
| tk-a27db2c7eec7 | AC5 | AC4, AC5 | C1, C3, C4, C5, DONT2, DONT5, OOS1, OOS5 |  |
| tk-071cf657a9c3 | AC3, AC6, AC8, AC10 | AC3, AC6, AC8, AC10 | C1, C2, C3, C5, C6, C7, DONT1, DONT3, DONT4, DONT5, DONT6, DONT7, OOS1, OOS2, OOS3, OOS4, OOS5, OOS6, OOS7 |  |
| tk-f0ccf048b11a | AC11 | AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC9, AC10, AC11 | C1, C2, C3, C4, C5, C6, C7, DONT1, DONT2, DONT3, DONT4, DONT5, DONT6, DONT7, OOS1, OOS2, OOS3, OOS4, OOS5, OOS6, OOS7 |  |
