# Contract Traceability

**Change ID:** fixDashboardTimeout
**Contract Version:** 1
**Rigor:** minimal
**Reviewed:** 2026-06-26T20:55:10.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | Live verification after service restart: GET / returned status=200 bytes=24285. |
| AC2 | acceptance_criterion | pass | test | Live verification after service restart: GET /api/state returned status=200 bytes=69383 within urllib timeout=8s. |
| AC3 | acceptance_criterion | pass | test | Live verification: /api/change/pokeedge/fixDeployDependency returned status=200 bytes=820 command='adv_change_show(changeId: "fixDeployDependency")'. |
| AC4 | acceptance_criterion | pass | test | RED/GREEN server regression and dashboard suite: bun test bin/lib/dashboard/server.test.ts passed 12; bun test bin/lib/dashboard bin/lib/live-status.test.ts passed 69. |
| AC5 | acceptance_criterion | pass | test | Existing source timeout tests plus new default budget test verify slow readers degrade within budget; live /api/state returned instead of timing out. |
| C1 | constraint | respected | static_check | No host/config change; service remains loopback at http://127.0.0.1:8765/. |
| C2 | constraint | respected | static_check | Changed only reader timeout constant and tests; no mutation controls/routes added. |
| C3 | constraint | respected | static_check | No secret display changes; existing sanitization tests in dashboard suite passed. |
| C4 | constraint | respected | static_check | No change to ADV reader fan-out; dashboard suite still passes worker-free tests from prior change. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-7bfdeda1a854 | AC2, AC5 | AC1, AC2, AC3, AC4, AC5 | C1, C2, C3, C4 |  |
