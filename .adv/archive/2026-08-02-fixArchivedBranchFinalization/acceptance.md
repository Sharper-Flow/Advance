# Acceptance

Reviewed at: 2026-08-02T22:37:02.718Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | **SC1:** A cleaned-up, merged change reaches `release: done` and archived terminal state after one signed retry with fresh Git proof. | pass | Durable run tr_ms9gp6zx_cbb668d9 plus reviewer 208-test run validate cleaned-branch fresh proof. |
| SC2 | success_criterion | **SC2:** A legacy archive without a persisted tip SHA remains pending/blocked and never reports release success. | pass | Missing-tip cases remain fail-closed in focused finalization tests. |
| SC3 | success_criterion | **SC3:** `fixAcceptanceRecovery` finalizes successfully after this repair merges. | pass | Persisted-tip proof path enables blocked archive retry after merge. |
| AC1 | acceptance_criterion | **AC1:** Archive dispatch persists a schema-valid 40-hex `changeTipSha` before cleanup removes the branch. | pass | Phase-9 persistence tests plus 40-hex schema regression pass. |
| AC2 | acceptance_criterion | **AC2:** When `change/<id>` is absent, `no_remote` re-proves reachability via the persisted SHA’s tree on the current default branch. | pass | Absent no-remote branch with matching tip tree re-proves reachability. |
| AC3 | acceptance_criterion | **AC3:** A missing SHA or unmatched tree returns the existing reachability block and does not complete release. | pass | Missing or mismatched tip stays blocked. |
| AC4 | acceptance_criterion | **AC4:** Existing branch-present, direct, and PR paths retain their current outcomes. | pass | Branch-present, direct, and PR routes unchanged across 520 related tests. |
| AC5 | acceptance_criterion | **AC5:** Regression tests cover SHA capture, cleaned-branch success, and missing-SHA failure. | pass | Regressions cover capture, recovery, failure, and schema validation. |
| AC6 | acceptance_criterion | **AC6:** Retry re-derives proof from Git and does not trust prior phase-9 success. | pass | Reviewer traced fresh Git re-proof through resolveReleaseReachability. |
| C1 | constraint | The fallback accepts only the persisted, schema-validated SHA. | respected | Fallback consumes only schema-validated persisted SHA. |
| C2 | constraint | Re-proof must use the resolved current default remote branch. | respected | Resolved default remote branch remains proof authority. |
| C3 | constraint | Existing branch-present finalization behavior stays unchanged. | respected | Branch-present finalization behavior unchanged. |
| DONT1 | avoidance | Do not recreate deleted branches or worktrees. | respected | No branch or worktree recreation. |
| DONT2 | avoidance | Do not infer proof from untyped historical data. | respected | No untyped historical proof. |
| DONT3 | avoidance | Do not extend fallback proof to legacy archives without `changeTipSha`. | respected | Legacy archives without persisted SHA remain blocked. |

