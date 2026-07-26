# Contract Traceability

**Change ID:** fixDirectArchiveRetry
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-26T05:18:09.203Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | tr_ms1cihqj_af1d1ce0: direct no-worktree archived retry regression passes within 236-test focused suite. |
| AC2 | acceptance_criterion | pass | test | tr_ms1cihqj_af1d1ce0: PR reachability and merge-SHA compatibility tests pass. |
| AC3 | acceptance_criterion | pass | test | tr_ms1cihqj_af1d1ce0: missing PR merge SHA and projection-failure cases remain fail-closed. |
| AC4 | acceptance_criterion | pass | test | tr_ms1cihqj_af1d1ce0 passes 236 focused tests; tr_ms1cjmt9_a1bba352 passes pnpm run check. |
| C1 | constraint | respected | static_check | `verifyProjectionAtGitCommit` unchanged; both callers still require its positive result. Reviewer verdict READY. |
| C2 | constraint | respected | static_check | Released SHA is required on typed reachable proof and populated by branch/remote/PR evidence, never status alone. |
| C3 | constraint | respected | static_check | Archived retry reads manifest and verifies git commit; no archive bundle/spec write added. |
| DONT1 | avoidance | respected | review | Independent acceptance reviewer READY: consumer uses typed `releasedCommitSha` directly, without route-name strings. |
| DONT2 | avoidance | respected | review | Independent acceptance reviewer READY: SHA comes from exact local HEAD, verified remote SHA, or PR merge OID; missing PR SHA blocks. |
| DONT3 | avoidance | respected | review | Independent acceptance reviewer READY: no manual projection mutation; historical reconciliation remained separate and no-op. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-ee9b2b8ece08 | AC1, AC2, AC3 | AC1, AC2, AC3, AC4 | C1, C2, C3, DONT1, DONT2, DONT3 |  |
