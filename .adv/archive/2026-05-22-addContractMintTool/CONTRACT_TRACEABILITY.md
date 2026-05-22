# Contract Traceability

**Change ID:** addContractMintTool
**Contract Version:** 1
**Rigor:** minimal
**Reviewed:** 2026-05-22T03:01:00.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | Deterministic parser shipped in plugin/src/validator/contract-mint.ts; verified by tk-a9a5bc372ab8 (RED/GREEN passed 4 tests). |
| AC2 | acceptance_criterion | pass | test | adv_contract_mint with dry-run/force/target_path/poisoned-history mode in plugin/src/tools/contract.ts; verified by tk-ba27ebec5f34/tk-d61000bf66c0/tk-ab71cbc8f19e. |
| AC3 | acceptance_criterion | pass | test | adv_contract_review_matrix_set with signal + recovery in plugin/src/tools/contract.ts; verified by tk-ba27ebec5f34. |
| AC4 | acceptance_criterion | pass | test | compatibilityReason argument in adv_gate_complete acceptance gate in plugin/src/tools/gate.ts; verified by tk-c836b7229790 (19 tests passed). |
| AC5 | acceptance_criterion | pass | test | Re-import/re-seed preservation in plugin/src/storage/store-temporal/index.ts + workflow-start.ts; verified by tk-e5ce9e836a9e (14 tests passed). |
| AC6 | acceptance_criterion | pass | test | DISCOVERY_CONTRACT_MISSING readiness blocker in plugin/src/temporal/gate-readiness.ts; verified by tk-29ac117f6fb9 (11 tests passed). |
| AC7 | acceptance_criterion | pass | test | Task contract_refs referential validation in plugin/src/validator/contract.ts (CONTRACT_UNKNOWN_REF + CONTRACT_AC_UNCOVERED). |
| AC8 | acceptance_criterion | pass | test | Executive summary confirms 89-test focused remediation suite + pnpm run check + pnpm run build green. |
| C1 | constraint | respected | static_check | Healthy-path contract signal preserved; recovery is opt-in via recoveryMode. |
| C2 | constraint | respected | static_check | Recovery writes via saveRecoveredContract/saveRecoveredReviewMatrix helpers only. |
| C3 | constraint | respected | static_check | No Temporal DB surgery; probe + disk projection only. |
| DONT1 | avoidance | respected | review | recoveryMode + non-empty recoveryEvidence required for every recovery operation. |
| DONT2 | avoidance | respected | review | missing-workflow errors do not authorize recovery (covered by negative test). |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-a9a5bc372ab8 |  |  |  |  |
| tk-e5ce9e836a9e |  |  |  |  |
| tk-ba27ebec5f34 |  |  |  |  |
| tk-d61000bf66c0 |  |  |  |  |
| tk-c836b7229790 |  |  |  |  |
| tk-0720eb1ee73c |  |  |  |  |
| tk-b0d86593170f |  |  |  |  |
| tk-29ac117f6fb9 |  |  |  |  |
| tk-ab71cbc8f19e |  |  |  |  |
| tk-fb9f0b4cf858 |  |  |  |  |
| tk-8828d8595c7c |  |  |  |  |
