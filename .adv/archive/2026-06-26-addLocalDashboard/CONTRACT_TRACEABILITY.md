# Contract Traceability

**Change ID:** addLocalDashboard
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-06-25T23:28:07Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Preview proof at http://127.0.0.1:18767 returned GET / 200 and /api/state 200 with project_ids [advance, toolbox], refresh_seconds 45. Tests: bin dashboard targeted tr_mqu4puld_79f896f3; full bin tr_mqu4q832_26a6da2a. |
| SC2 | success_criterion | pass | review | GitHub/ADV sources and lanes implemented in server/correlation/attention; full bin tests passed tr_mqu4q832_26a6da2a. Preview API returned two project cards with degraded source counts isolated per project. |
| SC3 | success_criterion | pass | review | correlation.test covers structural branch/SHA/evidence links and unknown/ambiguous unlinked lane; targeted tests passed tr_mqu4puld_79f896f3. |
| SC4 | success_criterion | pass | review | server.test covers thrown reader failures and bounded reader stalls; targeted tests passed tr_mqu4puld_79f896f3. |
| AC1 | acceptance_criterion | pass | test | Preview proof returned schema_version 1, project_count 2, project_ids [advance, toolbox]. server.test 'composes projects independently' passed in tr_mqu4puld_79f896f3. |
| AC2 | acceptance_criterion | pass | test | correlation.test verifies branch and SHA evidence strings; server.test verifies deployment.ref and ops.environment+completion_signal evidence. Targeted tests passed tr_mqu4puld_79f896f3. |
| AC3 | acceptance_criterion | pass | test | correlation.test verifies no structural match and ambiguous structural match are unlinked; attention tests verify unlinked lane. Full bin tests passed tr_mqu4q832_26a6da2a. |
| AC4 | acceptance_criterion | pass | test | server.test 'keeps GitHub deployment status and ADV ops evidence separately visible' verifies deployment source_states.github_deployment=failure and ops status=success remain separate. Passed tr_mqu4puld_79f896f3. |
| AC5 | acceptance_criterion | pass | test | server.test covers thrown ADV/GitHub failures, no secret leakage, and GITHUB_READ_TIMEOUT without blocking toolbox project. github.test covers auth/rate-limit degraded results. Tests passed tr_mqu4puld_79f896f3 and tr_mqu4q832_26a6da2a. |
| AC6 | acceptance_criterion | pass | test | server.test verifies POST /api/state returns 405 allow GET. ui.test verifies no mutation controls. Full bin tests passed tr_mqu4q832_26a6da2a. |
| AC7 | acceptance_criterion | pass | test | config tests enforce 30–60s refresh; ui renders lastSuccessfulRefreshAt on failed refresh and degraded source last_success_at when supplied; preview API returned refresh_seconds 45. Targeted tests passed tr_mqu4puld_79f896f3. |
| C1 | constraint | respected | static_check | parseDashboardConfig requires explicit projects and no discovery magic; README config example has two explicit projects. Full bin tests passed tr_mqu4q832_26a6da2a. |
| C2 | constraint | respected | static_check | GitHub client token provider uses GITHUB_TOKEN or gh auth token locally; no OAuth app or hosted auth. github tests passed in tr_mqu4puld_79f896f3. |
| C3 | constraint | respected | static_check | correlation output includes evidence strings for branch, sha, deployment ref, and ops environment/completion signal. Tests passed tr_mqu4puld_79f896f3. |
| C4 | constraint | respected | static_check | correlation.test covers no match and ambiguous structural match as unlinked reasons. Full bin tests passed tr_mqu4q832_26a6da2a. |
| C5 | constraint | respected | static_check | GitHub ETag/rate-limit tests, per-source degradation tests, and bounded reader stall test passed. Evidence: tr_mqu4puld_79f896f3. |
| C6 | constraint | respected | static_check | server.test verifies GitHub deployment failure and ADV ops success remain separately visible. Passed tr_mqu4puld_79f896f3. |
| DONT1 | avoidance | respected | review | Only GET / and GET /api/state routes; POST returns 405. No ADV/GitHub mutation client calls. Tests passed tr_mqu4puld_79f896f3. |
| DONT2 | avoidance | respected | review | ui.test forbids rerun, approve, merge, deploy, cancel, archive controls; server rejects non-GET. Full bin tests passed tr_mqu4q832_26a6da2a. |
| DONT3 | avoidance | respected | review | Implementation uses GitHub REST deployments only; no Vercel/Fly/Render/cloud provider dependencies. Diff review and tests passed. |
| DONT4 | avoidance | respected | review | Local Bun.serve CLI; default host 127.0.0.1 and non-loopback requires explicit --allow-network-host. server.test passed tr_mqu4puld_79f896f3. |
| DONT5 | avoidance | respected | review | Unlinked lane tests cover unmatched and ambiguous activity. Full bin tests passed tr_mqu4q832_26a6da2a. |
| DONT6 | avoidance | respected | review | sanitizeDashboardState redacts token-like strings and secret keys; GitHub/server tests assert no token leak from degraded or thrown errors; final dashboard state is sanitized. Tests passed tr_mqu4puld_79f896f3. |
| OOS1 | out_of_scope | respected | not_applicable | No provider-specific deployment integration; GitHub deployments only. Review diff and full bin tests passed. |
| OOS2 | out_of_scope | respected | not_applicable | No mutation routes or controls; server 405 for POST; ui no-control test passed tr_mqu4puld_79f896f3. |
| OOS3 | out_of_scope | respected | not_applicable | No dashboard database or historical audit store added; state generated from current ADV/GitHub reads. Diff review and tests passed. |
| OOS4 | out_of_scope | respected | not_applicable | Dashboard reads GitHub/ADV sources and preserves them; it does not replace GitHub Actions, deployments, ADV gates, or ops evidence. Tests verify source separation. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-e028d2492893 | AC1, AC5, AC7, C1 | AC1, AC5, AC7 | DONT6, OOS3 |  |
| tk-36f317d03cfc | SC2, AC5, AC7, C2, C5 | AC5, AC7, DONT6 | DONT1, DONT2, DONT3, DONT6, OOS1, OOS2, OOS4 |  |
| tk-49659d940909 | SC2, SC4, AC1, AC2, AC4, AC5, C3, C5, C6 | AC1, AC2, AC4, AC5 | DONT1, DONT4, DONT6, OOS4 |  |
| tk-a7cd3ac6367b | SC1, SC3, AC2, AC3, AC4, C3, C4, C6 | AC2, AC3, AC4 | DONT5, DONT6 |  |
| tk-07993da8f12c | SC1, SC2, SC4, AC1, AC5, AC6, AC7 | AC1, AC5, AC6, AC7 | DONT1, DONT2, DONT6, OOS2, OOS3 |  |
| tk-15d5e16e4468 | SC1, SC2, SC3, AC1, AC2, AC3, AC4, AC6, AC7 | AC1, AC2, AC3, AC4, AC6, AC7 | C3, C4, C6, DONT1, DONT2, DONT5, DONT6, OOS2 |  |
| tk-3f53def60733 | AC1, AC6, AC7, C1, C2 | AC1, AC6, AC7 | DONT1, DONT2, DONT3, DONT4, DONT6, OOS1, OOS2, OOS3 |  |
| tk-5115eda9e14c |  | SC1, SC2, SC3, SC4, AC1, AC2, AC3, AC4, AC5, AC6, AC7, C1, C2, C3, C4, C5, C6, DONT1, DONT2, DONT3, DONT4, DONT5, DONT6 | OOS1, OOS2, OOS3, OOS4 |  |
