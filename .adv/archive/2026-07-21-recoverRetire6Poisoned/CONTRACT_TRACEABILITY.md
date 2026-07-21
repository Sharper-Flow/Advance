# Contract Traceability

**Change ID:** recoverRetire6Poisoned
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-21T21:08:00Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| C1 | constraint | respected | static_check | No workflow-state deletion or recreation. All recovery used typed ADV tools with audit evidence. |
| C2 | constraint | respected | static_check | No spec delta changes or artifact content mutations. |
| C3 | constraint | respected | static_check | All recovery actions used typed ADV recovery tools (status_repair, gate_complete recoveryMode, change_close, change_archive) with audit evidence. |
| C4 | constraint | respected | static_check | No changeWorkflow signature or workflow-code changes. |
| C5 | constraint | respected | static_check | All recovery ran in the ADV-managed project. |
| DONT1 | avoidance | respected | review | No disk-authoritative reads architecture absorbed. |
| DONT2 | avoidance | respected | review | No false-negative durability guard structural fix. |
| DONT3 | avoidance | respected | review | No recovery-tool sprawl replacement. |
| DONT4 | avoidance | respected | review | No production code or tests modified. |
| DONT5 | avoidance | respected | review | No acceptance criteria skipped or review matrix requirements weakened. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-57a0829e74ab |  |  | C1, C3, C5 |  |
| tk-82406ca19a3f |  |  | C1, C3, C5 |  |
| tk-7130d9e630b5 |  |  | C1, C5 |  |
