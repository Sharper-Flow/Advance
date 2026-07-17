# Archive: Add typed orchestration API

**Change ID:** addTypedOrchestrationApi
**Archived:** 2026-07-16T18:40:30.149Z
**Created:** 2026-07-15T19:01:56.924Z

## Tasks Completed

- ✅ Implement canonical PhasePlan derivation and legacy directive adapter
  > Task checkpoint completed
- ✅ Expose PhasePlan through typed query and current ADV read projection
  > Task checkpoint completed
- ✅ Build table-driven plan, directive, mapping, and consumer parity coverage
  > Task checkpoint completed
- ✅ Implement structural full-machine migration proof and routing-only cutover receipt
  > Task checkpoint completed
- ✅ Reconcile authoritative PhasePlan spec law and record migration measurements
  > Task checkpoint completed
- ✅ Verify PhasePlan contract, replay safety, and full integration evidence
  > Task checkpoint completed

## Specs Modified


## Wisdom Accumulated

- **[gotcha]** ChangeWorkflowState.status uses the narrow ChangeStatus union ("draft"|"archived"|"closed"), not Change.status's wider union ("active", ...). Synthetic ChangeWorkflowState fixtures must use "draft" for active changes — "active" fails tsc --noEmit even though vitest runs fine. Separately: with all 7 gate keys present, phase-plan derivation is total (cannot throw); to exercise degraded-plan consumer wiring, either module-mock deriveDirectiveSafe to undefined (gate-status, which also runs getIncompleteGates over the gates) or use real missing-key gates only where the consumer path is optional-chain safe (status-enrich's fallbackNextGate).
