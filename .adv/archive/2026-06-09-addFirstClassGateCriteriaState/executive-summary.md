# Executive Summary: Add First-Class Gate Criteria State

## What Was Built

Implemented first-class gate criteria state for ADV, enabling structured queryable checklists per gate with persisted evaluation at completion time.

### Core Components

1. **Type System** (`plugin/src/types/gates.ts`)
   - `GateCriterionSchema`: Structured criterion with id, label, status, evidence, remediation
   - `CriterionDef`: Declarative definition with evaluator reference
   - `GATE_CRITERIA_DEFINITIONS`: Static map of 15 criteria across 7 gates

2. **Evaluation Engine** (`plugin/src/temporal/gate-readiness.ts`)
   - `CriterionEvaluator` type: Synchronous evaluator returning `CriterionEvaluation`
   - `CRITERION_EVALUATORS`: Map of 15 evaluator functions
   - `evaluateGateCriteria()`: Runs evaluators with error isolation, returns `GateCriterion[]`

3. **Workflow Integration** (`plugin/src/temporal/workflows.ts`, `change-state.ts`)
   - Wired `evaluateGateCriteria` into `completeGateWithReadiness` with try/catch
   - Persisted criteria in `state.gateCriteria[gateId]` via `applyGateCompletedToState`
   - Added `gateCriteria` field to `ChangeWorkflowState` (optional, no migration)

4. **Signal Enhancement** (`plugin/src/types/signals.ts`)
   - Added optional `criteria?: GateCriterion[]` to `GateCompletedSignalPayloadSchema`
   - Criteria piggyback on existing `gateCompletedSignal` (no new signals)

5. **Query Infrastructure** (`plugin/src/temporal/messages.ts`, `contracts.ts`)
   - `getGateCriteriaQuery`: Temporal query for persisted criteria
   - Query handler registered in workflows.ts, returns all or specific gate criteria

6. **Tooling** (`plugin/src/tools/gate.ts`)
   - `adv_gate_criteria`: New tool with query mode (returns persisted criteria) and evaluate mode (runs evaluators without persisting)
   - Enhanced `adv_gate_status`: Includes persisted `gateCriteria` in response

## Design Decisions

- **D1**: Criteria definitions are data; evaluators are functions — keeps definitions serializable, evaluators can be complex
- **D2**: Criteria are advisory, not blocking — evaluation runs parallel with `evaluateGateReadiness()`, failures logged but don't block
- **D3**: Criteria piggyback on existing signal — no new signal needed, reduces migration complexity
- **D4**: Workflow state stores criteria per gate — enables audit trail in `adv_gate_status`
- **D5**: Pre-flight evaluation is read-only — `evaluate: true` runs evaluators but doesn't persist
- **D6**: Criteria evaluation is error-isolated — wrapped in try/catch, evaluator errors → status: 'na', chain continues

## Acceptance Criteria Met

- ✅ AC1: `adv_gate_criteria` tool returns structured checklist for any gate
- ✅ AC2: Gate completion records criteria evaluation in signal payload
- ✅ AC3: All existing `evaluateGateReadiness()` checks map to criteria entries (15 criteria)
- ✅ AC4: No regression in existing gate completion flow (all changes additive/optional)
- ✅ AC5: Criteria definitions are declarative (data, not code)
- ✅ AC6: Pre-flight mode: evaluate criteria without completing gate

## Contract Compliance

All 8 contract items respected:
- **C1-C4** (constraints): Existing flow preserved, poisoned-history compatible, error-isolated, no new signals
- **DONT1-DONT4** (avoidances): Meaningful criteria for all gates, no migration required, advisory not blocking, not exposed in public schemas

## Impact

- **Files modified**: 8 (types/gates.ts, types/signals.ts, temporal/contracts.ts, temporal/gate-readiness.ts, temporal/change-state.ts, temporal/workflows.ts, temporal/messages.ts, tools/gate.ts)
- **Breaking changes**: None (all fields optional, backward compatible)
- **Migration required**: None (existing changes work without criteria)
- **Test coverage**: Inline TDD approach, all tasks checkpointed with verification

## Next Steps

- Release gate: Harden, archive, and ship the feature
- Future: Consider exposing criteria in public JSON schemas after stabilization
- Future: Add criteria-based pre-flight recommendations in gate completion flow