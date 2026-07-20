# Contract Traceability

**Change ID:** fixTemporalQueryRecovery
**Contract Version:** 1
**Rigor:** strict
**Reviewed:** 2026-07-19T20:35:00Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | temporal/diagnostics.ts exports typed ServiceDiagnostic + WorkflowDiagnostic; workflow-axis failure triggers zero STSL reconnects (single-flight narrow policy preserved). |
| SC2 | success_criterion | pass | review | diagnostics.ts classification covers no-poller, query-not-registered, query-rejected, workflow-not-found, deadline, resource exhaustion, permission, poisoned-history, generic wrapped — each returns deterministic typed class with nested cause. |
| SC3 | success_criterion | pass | review | storage/store-temporal/gates.ts:105-134 threads one TemporalReadContext through primary+fallback; checks isTemporalReadExpired before fallback; throws typed degraded error on expiry. SC3 budget contract enforced. |
| SC4 | success_criterion | pass | review | tools/_adapters.ts:107-145 fireSignal SC4 guard throws TemporalMutationIneligibleError for mutation-ineligible classes. Storage paths wired: changes.ts (save/update/create/close/etc), tasks.ts (update/add/cancel/reclassify), wisdom.ts (add), spec-deltas.ts (add/modify), gates.ts (complete/reopenFrom), workflow-start.ts (workflow-start), index.ts (worktree migration). |
| SC5 | success_criterion | pass | review | STSL replacement remains single-flight; workflow-local failure alone never satisfies reconnect trigger. diagnostics corroborated shared-channel evidence required. |
| SC6 | success_criterion | pass | review | mutation-safety.ts classifyMutationOutcome returns confirmed/outcome_unknown_readback_unavailable/failed_before_ack. shared.ts classifyTemporalReadFailure accepts optional signalError and returns typed outcome. fireGuardedSignal in changes.ts enforces SC6 at production call sites. |
| SC7 | success_criterion | pass | review | mutation-safety.ts preserves WORKFLOW_TERMINATE_SHIPPED_GATES list + WorkflowRunDescriptionPin interface; existing adv_change_workflow_terminate tool safeguards unchanged (18 termination tool tests pass). |
| C1 | constraint | respected | static_check | Diff scoped to plugin behavior. No host lifecycle / config changes. |
| C2 | constraint | respected | static_check | adv_change_workflow_terminate tool unchanged; archive-purge safety boundaries preserved. 18 termination tool tests green. |
| C3 | constraint | respected | static_check | read-context.ts uses SDK Connection.withDeadline + withAbortSignal; no Promise.race as RPC timeout authority in production (test fixtures fall back when Connection absent). |
| C4 | constraint | respected | static_check | Healthy same-project workflows unaffected; target-path routing preserved. Existing tests pass. |
| C5 | constraint | respected | static_check | No Temporal Reset code added. |
| OOS1 | out_of_scope | missing | not_applicable |  |
| OOS2 | out_of_scope | missing | not_applicable |  |
| OOS3 | out_of_scope | missing | not_applicable |  |
| OOS4 | out_of_scope | missing | not_applicable |  |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-5e7de0b321de | SC1, SC2, SC4, SC5 |  | C1, C2, C4, C5 |  |
| tk-972870c164f3 | SC3 |  | C1, C3, C4, C5 |  |
| tk-190cfde65e2b | SC4, SC6, SC7 |  | C1, C2, C3, C5 |  |
| tk-a5815949288d |  | SC1, SC2, SC3, SC4, SC5, SC6, SC7 | C1, C2, C3, C4, C5 |  |
