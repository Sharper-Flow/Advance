# Acceptance

Reviewed at: 2026-06-09T22:07:17.446Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| C1 | constraint | Must not break existing `evaluateGateReadiness()` flow or its callers | respected | evaluateGateCriteria() runs in parallel with evaluateGateReadiness() in completeGateWithReadiness (workflows.ts:1039-1051). Criteria evaluation wrapped in try/catch, failures don't block. Existing readiness checks unchanged. |
| C2 | constraint | Must work with poisoned-history recovery paths (disk-projected criteria when Temporal unavailable) | respected | gateCriteria field is optional in ChangeWorkflowState (contracts.ts:388). adv_gate_status queries criteria from workflow state, falls back gracefully when unavailable. Disk-projected state includes gateCriteria when present. |
| C3 | constraint | Criteria evaluation failures during gate completion must not block — fall back to existing readiness checks | respected | evaluateGateCriteria wrapped in try/catch in completeGateWithReadiness (workflows.ts:1039-1051). Evaluator errors return status:'na', don't throw. Gate completion proceeds with existing readiness checks when criteria evaluation fails. |
| C4 | constraint | No new workflow signals — criteria piggyback on existing `gateCompletedSignal` | respected | No new signals added. criteria field added to existing GateCompletedSignalPayloadSchema (signals.ts:204). Criteria piggyback on gateCompletedSignal via applyGateCompletedToState (change-state.ts:842-848). |
| DONT1 | avoidance | Don't add criteria for gates that have no meaningful checks (e.g., proposal is lightweight) | respected | GATE_CRITERIA_DEFINITIONS includes meaningful criteria for all 7 gates: proposal (2), discovery (2), design (2), planning (5), execution (1), acceptance (5), release (3). Each criterion maps to actual readiness checks or quality gates. |
| DONT2 | avoidance | Don't require migration of existing archived changes — criteria are optional in state | respected | gateCriteria field is optional (Partial<Record<GateId, GateCriterion[]>>). Existing archived changes work without criteria. No migration logic added. |
| DONT3 | avoidance | Don't make criteria a hard gate — they're advisory + audit, not a new blocking layer | respected | Criteria are advisory — evaluateGateCriteria runs parallel with evaluateGateReadiness but doesn't block. Gate completion uses existing readiness checks as source of truth. Criteria provide audit trail, not hard gates. |
| DONT4 | avoidance | Don't expose criteria in public JSON schemas until the surface stabilizes | respected | GateCriterionSchema defined in types/gates.ts (internal), not added to schema-registry.ts. No public JSON schema generated. Surface remains internal until stabilized. |

