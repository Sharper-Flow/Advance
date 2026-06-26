# Acceptance

Reviewed at: 2026-06-26T20:55:10.000Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| AC1 | acceptance_criterion | Given the dashboard service is running, when `GET /` is requested, then it returns HTTP 200. | pass | Live verification after service restart: GET / returned status=200 bytes=24285. |
| AC2 | acceptance_criterion | Given the dashboard service is running, when `GET /api/state` is requested, then it returns HTTP 200 within 8 seconds. | pass | Live verification after service restart: GET /api/state returned status=200 bytes=69383 within urllib timeout=8s. |
| AC3 | acceptance_criterion | Given `/api/state` returns at least one visible change, when `GET /api/change/{projectId}/{changeId}` is requested for one visible change, then it returns HTTP 200 within 8 seconds. | pass | Live verification: /api/change/pokeedge/fixDeployDependency returned status=200 bytes=820 command='adv_change_show(changeId: "fixDeployDependency")'. |
| AC4 | acceptance_criterion | Given targeted dashboard tests run, when they complete, then the timeout regression is covered and tests pass. | pass | RED/GREEN server regression and dashboard suite: bun test bin/lib/dashboard/server.test.ts passed 12; bun test bin/lib/dashboard bin/lib/live-status.test.ts passed 69. |
| AC5 | acceptance_criterion | Given the fix is applied, when source reads are slow/unavailable, then affected source(s) degrade rather than blocking the whole `/api/state` response. | pass | Existing source timeout tests plus new default budget test verify slow readers degrade within budget; live /api/state returned instead of timing out. |
| C1 | constraint | Local-only dashboard. | respected | No host/config change; service remains loopback at http://127.0.0.1:8765/. |
| C2 | constraint | Read-only; no mutation controls. | respected | Changed only reader timeout constant and tests; no mutation controls/routes added. |
| C3 | constraint | No secrets or raw ADV state-file links. | respected | No secret display changes; existing sanitization tests in dashboard suite passed. |
| C4 | constraint | Do not reintroduce routine per-change workflow query fan-out. | respected | No change to ADV reader fan-out; dashboard suite still passes worker-free tests from prior change. |

