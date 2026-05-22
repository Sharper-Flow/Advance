# Agreement

## Objectives

1. Add Temporal replay regression coverage for ADV `changeWorkflow` histories, including the observed `fixGateAutoWorktree` poison class.
2. Add workflow-evolution policy for command-producing changes: replay check plus `wf.patched`, Worker Versioning, or reset/recovery plan, with patch-deprecation notes.
3. Make `listWorktreesAcrossChanges` isolate per-change query failures and return healthy partial results.
4. Make `adv_wip_state` expose poisoned-workflow metadata optimized for automation, agent triage, and tooling while preserving human-readable warnings.
5. Reuse existing poisoned-history classifiers/probes for warning and recovery evidence.
6. Define audited recovery semantics for poisoned terminal/stale workflows; quarantine/read-only-first is default and destructive actions remain explicit-approval-gated.
7. Update `advance-workflow`, `backlog-coordination`, `worktree-lifecycle`, and `docs/temporal-recovery.md`.

## Acceptance Criteria

1. Replay verification fails when the current workflow bundle cannot replay captured/sanitized ADV `changeWorkflow` histories.
2. At least one fixture covers the observed `fixGateAutoWorktree` class: `[TMPRL1100] Nondeterminism error: UpsertWorkflowSearchAttributesMachine does not handle HistoryEvent(id: 182, ActivityTaskScheduled)`.
3. Workflow-code changes that add, remove, or reorder command-producing operations require `wf.patched`, Worker Versioning, or an explicit reset/recovery plan before archive; patch markers include a deprecation plan or documented rationale.
4. `listWorktreesAcrossChanges` isolates per-change query failures and returns healthy worktrees from other changes.
5. `adv_wip_state` exposes structured poisoned-workflow metadata optimized for automation, agent triage, and tooling while preserving human-readable warnings.
6. Existing poisoned terminal workflows are quarantined/read-only-first by default; destructive reset, terminate, or reseed is not automatic.
7. Any poisoned-history recovery records exact evidence such as `TMPRL1100`, `WorkflowTaskFailedCauseNonDeterministicError`, or `NonDeterministic` before recovery action.
8. Destructive poisoned-history actions require explicit user approval and audit evidence.
9. Existing poisoned-history classifiers/probes are reused; no duplicate regex-only classification path owns correctness.
10. Specs/docs state worker restart alone is not a repair for nondeterministic history mismatch.
11. Targeted tests plus `pnpm run check`, `pnpm run build`, and full `pnpm test` pass.

## Constraints

1. Preserve signal/query-only change workflow architecture; do not reintroduce `defineUpdate`.
2. Keep Temporal as the source of truth for live change state.
3. Make replay compatibility machine-verifiable; heuristic-only checks are insufficient.
4. Use existing poisoned-history classification/probe helpers where possible instead of duplicating classification logic.
5. Quarantine/read-only-first is the default recovery posture for already-poisoned terminal workflows.
6. Blocking replay checks apply to workflow-affecting changes under `plugin/src/temporal/**` and command-producing workflow helpers.
7. Current repo only.

## Avoidances

1. Do not rely on worker restart or repeated retries as `TMPRL1100` repair.
2. Do not hide healthy WIP because one workflow query fails.
3. Do not terminate, reset, reseed, or mutate poisoned workflows without exact evidence and explicit approval.
4. Do not add broad workflow-handler rewrites beyond the replay/poison-isolation scope.
5. Do not weaken archive, worktree cleanup, or backlog claim safety checks.
6. Do not make Warp or terminal navigation part of correctness.
7. Do not hand-edit ADV state files or Temporal database rows.

## Out of Scope

1. Replacing Temporal as ADV's durable state engine.
2. Manual Temporal database surgery.
3. Broad rewrite of all change workflow handlers.
4. Task-completion semantics owned by `fixCompletionSemantics` / `fixTaskCompletion`.
5. Archive release ordering owned by `fixArchiveReleaseOrdering`, except documented interaction.
6. Terminal/Warp workspace switching behavior.
7. External `spec-conformance` integration unless design proves it is required.

## Decisions

### User Decisions

- Recovery posture: user chose quarantine/read-only-first as the safest default for existing poisoned terminal workflows.
- Replay strictness: user approved blocking replay checks after tradeoff explanation.
- Warning shape: user chose to optimize poisoned WIP/worktree warning output for agents, tooling, automation, and triage.

### Agent Decisions (LBP)

- Use Temporal `Worker.runReplayHistory` / `runReplayHistories` for structural replay verification.
- Prefer `wf.patched` for command-producing workflow changes in the current per-session deployment model; defer Worker Versioning unless multi-worker fleets become relevant.
- Fixture must exercise the search-attribute/activity command-order mismatch, not only a trivial happy path.
- Fix per-workflow isolation inside `listWorktreesAcrossChanges`; `adv_wip_state` source-level `Promise.allSettled` alone is insufficient.
- Keep backlog active-change annotation Visibility-only; do not add per-workflow queries there without isolation.

## Deferred Questions

None.

## Sign-Off

Acceptance criteria approved by user reply `approve` on 2026-05-22. Discovery may persist this agreement, mint the contract, complete the discovery gate, and proceed to design.