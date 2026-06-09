# Contract Traceability

**Change ID:** addFirstClassGateCriteriaState
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-06-09T22:07:17.446Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| C1 | constraint | respected | static_check | evaluateGateCriteria() runs in parallel with evaluateGateReadiness() in completeGateWithReadiness (workflows.ts:1039-1051). Criteria evaluation wrapped in try/catch, failures don't block. Existing readiness checks unchanged. |
| C2 | constraint | respected | static_check | gateCriteria field is optional in ChangeWorkflowState (contracts.ts:388). adv_gate_status queries criteria from workflow state, falls back gracefully when unavailable. Disk-projected state includes gateCriteria when present. |
| C3 | constraint | respected | static_check | evaluateGateCriteria wrapped in try/catch in completeGateWithReadiness (workflows.ts:1039-1051). Evaluator errors return status:'na', don't throw. Gate completion proceeds with existing readiness checks when criteria evaluation fails. |
| C4 | constraint | respected | static_check | No new signals added. criteria field added to existing GateCompletedSignalPayloadSchema (signals.ts:204). Criteria piggyback on gateCompletedSignal via applyGateCompletedToState (change-state.ts:842-848). |
| DONT1 | avoidance | respected | review | GATE_CRITERIA_DEFINITIONS includes meaningful criteria for all 7 gates: proposal (2), discovery (2), design (2), planning (5), execution (1), acceptance (5), release (3). Each criterion maps to actual readiness checks or quality gates. |
| DONT2 | avoidance | respected | review | gateCriteria field is optional (Partial<Record<GateId, GateCriterion[]>>). Existing archived changes work without criteria. No migration logic added. |
| DONT3 | avoidance | respected | review | Criteria are advisory — evaluateGateCriteria runs parallel with evaluateGateReadiness but doesn't block. Gate completion uses existing readiness checks as source of truth. Criteria provide audit trail, not hard gates. |
| DONT4 | avoidance | respected | review | GateCriterionSchema defined in types/gates.ts (internal), not added to schema-registry.ts. No public JSON schema generated. Surface remains internal until stabilized. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-dd1ede4cdca2 | DONT1 |  | DONT4 |  |
| tk-71b504f2aa15 | C4 |  |  |  |
| tk-7a47c9ee91da |  |  |  | Cancelled — duplicate of tk-71b504f2aa15 |
| tk-4ae6539ec34d | C2 |  | DONT2 |  |
| tk-403a7b21bd34 | C3 |  | C1 |  |
| tk-2a9535ee3a5c | C1, C3 |  |  |  |
| tk-0b70ac55eff2 |  |  | DONT3 |  |
| tk-5fa5925e9274 |  |  |  | Cancelled — duplicate of tk-a37c2ccd27ec |
| tk-a37c2ccd27ec |  |  | C2 |  |
| tk-36a645fec109 |  |  |  | Cancelled — duplicate of tk-c4e522c71e6d |
| tk-c4e522c71e6d |  |  | C2 |  |
