# Contract Traceability

**Change ID:** fixArchivedBranchFinalization
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-08-02T22:37:02.718Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Durable run tr_ms9gp6zx_cbb668d9 plus reviewer 208-test run validate cleaned-branch fresh proof. |
| SC2 | success_criterion | pass | review | Missing-tip cases remain fail-closed in focused finalization tests. |
| SC3 | success_criterion | pass | review | Persisted-tip proof path enables blocked archive retry after merge. |
| AC1 | acceptance_criterion | pass | test | Phase-9 persistence tests plus 40-hex schema regression pass. |
| AC2 | acceptance_criterion | pass | test | Absent no-remote branch with matching tip tree re-proves reachability. |
| AC3 | acceptance_criterion | pass | test | Missing or mismatched tip stays blocked. |
| AC4 | acceptance_criterion | pass | test | Branch-present, direct, and PR routes unchanged across 520 related tests. |
| AC5 | acceptance_criterion | pass | test | Regressions cover capture, recovery, failure, and schema validation. |
| AC6 | acceptance_criterion | pass | test | Reviewer traced fresh Git re-proof through resolveReleaseReachability. |
| C1 | constraint | respected | static_check | Fallback consumes only schema-validated persisted SHA. |
| C2 | constraint | respected | static_check | Resolved default remote branch remains proof authority. |
| C3 | constraint | respected | static_check | Branch-present finalization behavior unchanged. |
| DONT1 | avoidance | respected | review | No branch or worktree recreation. |
| DONT2 | avoidance | respected | review | No untyped historical proof. |
| DONT3 | avoidance | respected | review | Legacy archives without persisted SHA remain blocked. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-0166f71f4b44 | AC1, AC2, AC3, AC4, AC6 |  | C1, C2, DONT1, DONT2, DONT3 |  |
| tk-019e2e054cf2 |  | AC1, AC2, AC3, AC4, AC5, AC6, SC1, SC2, SC3 | C1, C2, DONT1, DONT2, DONT3 |  |
