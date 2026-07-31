# Contract Traceability

**Change ID:** hardenExecutionDiagnosis
**Contract Version:** 1
**Rigor:** strict
**Reviewed:** 2026-07-31T15:57:41-04:00

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | tk-406bc88846f4; typed attribution schema and focused tests passed; final reviewer and scanner traced evidence fields. |
| AC2 | acceptance_criterion | pass | test | tk-406bc88846f4; classification schema guards and negative tests pass. |
| AC3 | acceptance_criterion | pass | test | CONTRACT_CONFLICT non-retry invariants validated by task schema tests. |
| AC4 | acceptance_criterion | pass | test | Delegation routing command/spec regressions pass in 307-test command asset suite. |
| AC5 | acceptance_criterion | pass | test | Typed state machine and runtime consumer verified by 182 focused tests plus 72 boundary tests; reviewer attempt 5 approved. |
| AC6 | acceptance_criterion | pass | test | Verifier attribution schema, consumer rendering, and asset tests passed; independent review approved. |
| AC7 | acceptance_criterion | pass | test | adv-apply conflict-free and within enforced budget; 307 command/asset tests pass. |
| AC8 | acceptance_criterion | pass | test | New fields remain optional; schema parity, archive-through/change-state compatibility tests pass. |
| C1 | constraint | respected | static_check | All implementation and verification occurred in ADV worktree; no trunk writes. Change has no visual surface, so Preview URL is not applicable. |
| C2 | constraint | respected | static_check | Assertions retained or strengthened; no skipped tests or unsupported baseline classification. |
| C3 | constraint | respected | static_check | Human checkpoints and one-retry semantics preserved; command checkpoint regressions pass. |
| C4 | constraint | respected | static_check | Zod schemas and typed task/report mutation paths own persisted authority; no heuristic state transition. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-406bc88846f4 | AC1, AC2, AC3 |  | C2, C4 |  |
| tk-570509ffe024 | AC4, AC5 |  | C3, C4 |  |
| tk-8f12c1c80a6e | AC6 |  | C4 |  |
| tk-fb6767c9ac8b | AC7 |  | C3, C4 |  |
| tk-a58ef9fbab65 |  | AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8 | C1, C2, C3, C4 |  |
