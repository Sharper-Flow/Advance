# Acceptance

Reviewed at: 2026-07-26T05:18:09.203Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| AC1 | acceptance_criterion | Given an archived change with deltas, an existing bundle, and direct-push reachability on the default branch, when archive retry runs, then projection verification receives a concrete released commit SHA and the retry returns `success: true` with `noOp: true` when the manifest matches. | pass | tr_ms1cihqj_af1d1ce0: direct no-worktree archived retry regression passes within 236-test focused suite. |
| AC2 | acceptance_criterion | Given the equivalent PR route, when archive retry runs, then projection verification continues using the merged PR commit SHA. | pass | tr_ms1cihqj_af1d1ce0: PR reachability and merge-SHA compatibility tests pass. |
| AC3 | acceptance_criterion | Given no provable released commit or a mismatching projection, when retry runs, then it returns a typed blocking failure and does not report success. | pass | tr_ms1cihqj_af1d1ce0: missing PR merge SHA and projection-failure cases remain fail-closed. |
| AC4 | acceptance_criterion | Targeted archive tests and repository static checks pass. | pass | tr_ms1cihqj_af1d1ce0 passes 236 focused tests; tr_ms1cjmt9_a1bba352 passes pnpm run check. |
| C1 | constraint | Do not weaken `verifyProjectionAtGitCommit`. | respected | `verifyProjectionAtGitCommit` unchanged; both callers still require its positive result. Reviewer verdict READY. |
| C2 | constraint | Do not infer release from status alone. | respected | Released SHA is required on typed reachable proof and populated by branch/remote/PR evidence, never status alone. |
| C3 | constraint | Do not rewrite archive bundles or specs during retry. | respected | Archived retry reads manifest and verifies git commit; no archive bundle/spec write added. |
| DONT1 | avoidance | No route-name string heuristics. | respected | Independent acceptance reviewer READY: consumer uses typed `releasedCommitSha` directly, without route-name strings. |
| DONT2 | avoidance | No fabricated merge SHA. | respected | Independent acceptance reviewer READY: SHA comes from exact local HEAD, verified remote SHA, or PR merge OID; missing PR SHA blocks. |
| DONT3 | avoidance | No manual projection mutation. | respected | Independent acceptance reviewer READY: no manual projection mutation; historical reconciliation remained separate and no-op. |

