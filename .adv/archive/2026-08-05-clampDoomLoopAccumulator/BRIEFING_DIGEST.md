# Archive Briefing Digest

**Change ID:** clampDoomLoopAccumulator
**Title:** Clamp doom loop accumulator
**Status:** archived
**Generated:** 2026-08-05T00:17:41.063Z

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

Showing 8 of 8 durable facts.

- **[report_follow_up]** follow_ups: Add a dedicated 4+-blocked-report replay fixture + classification outcome=self_healed (mirrors makeLegacyDesignValidation) so the self-heal property is regression-protected, not just incidentally covered by addArchiveScaleRegression.
- **[report_follow_up]** follow_ups: Confirm after implementation that clamping the attempts window does not collide with the strategy_label dedup loop (change-state.ts:2030-2039) — labels must remain distinct within the bounded window.
- **[report_follow_up]** follow_ups: Operator note: self-heal requires a replay trigger on the bricked resolveAdvPersistenceRecovery execution (a read/query or worker redeploy). If the execution is wedged and never schedules a task, it will not heal until replay occurs.
- **[research_citation]** sources: Temporal TS SDK — patched()/deprecatePatch semantics (determinism is about command branching): patched() exists to branch to new/old ACTIVITY COMMAND sequences so the command/event sequence stays aligned with history. Its entire purpose is preserving the command sequence. The canonical example swaps one activity command for another. Confirms determinism enforcement targets the command sequence, not in-memory variable values. (Context7 /temporalio/sdk-typescript -> packages/workflow/src/workflow.ts (patched))
- **[research_citation]** sources: Temporal TS SDK — DeterminismViolationError surface (forbidden modules, WeakRef/GC, Date/Math.random overrides): The SDK sandbox enforces determinism by blocking non-deterministic primitives (fs/network imports, WeakRef/FinalizationRegistry due to non-deterministic GC, replacing Date.now/Math.random with deterministic versions). No mechanism records or validates the VALUES of plain in-memory workflow variables. (Context7 /temporalio/sdk-typescript -> packages/workflow/src/global-overrides.ts)
- **[research_citation]** sources: ADV changeWorkflow main-loop condition (command-gating predicate): The workflow's sole blocking condition gates ONLY on state.status (archived/closed) and history-length (shouldContinueAsNew). It NEVER reads error_recovery.retry_count or attempts.length. The reducer does not mutate state.status, so clamping cannot change which branch (Complete vs continueAsNew) the workflow takes. (plugin/src/temporal/workflows.ts:2221-2225)
- **[research_citation]** sources.omitted: 8 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: The proposed clamp is a PURE IN-MEMORY STATE-DERIVATION change. applySubagentReportSubmittedToState runs inside signalMutation->signalAsync and only mutates the workflow state object; it emits no Temporal commands (no activity/timer/continueAsNew/child-workflow). Temporal replay determinism validates the COMMAND/EVENT sequence (TMPRL1100 = command-machine mismatch such as 'No command scheduled for event' / 'Activity machine does not handle this event'), NOT the values of in-memory variables. No command-gating logic reads error_recovery.retry_count or attempts.length: the main-loop condition (workflows.ts:2221) gates only on state.status and history length, and the reducer never mutates state.status; the derive functions that do read attempts.length feed only query handlers (getTaskRunSummaryQuery), which are not part of command history. The per-signal command footprint (one UpsertWorkflowSearchAttributes, gated on a config flag) is invariant, and the ADV search-attribute set carries no retry-derived value, so even the upsert payload is unchanged. Existing pattern: ADV rebuilds durable state by replaying signal history through reducers (signalMutation). Reference pattern: Temporal TS SDK determinism model — replay validates commands, not variable values; patched()/versioning exist only to preserve the command sequence when command-emitting branches change. Deviation: NONE. The fix is replay-safe by construction and self-heals already-poisoned workflows on next replay because the unchanged history (4+ subagentReportSubmitted signals) re-derives valid (clamped) state. IMPORTANT CAVEAT: the pure replay test (Worker.runReplayHistory) proves no COMMAND divergence but does NOT itself assert the derived state passes the read-path Zod schema (the read-path rejection happens in the tool layer, outside replay). So a complete self-heal proof requires BOTH a replay-determinism assertion AND a reducer-level assertion that 4+ reports yield ErrorRecoverySchema-valid state.

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
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| C4 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |
| DONT4 | avoidance | respected |

## Unresolved Actions

None
