# Acceptance

Reviewed at: 2026-06-26T21:24:50.000Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| AC1 | acceptance_criterion | Given the GitHub reader fetches repository data, when deployments are present, then deployment status requests are bounded to a small current/latest subset and are not issued sequentially for all 30 deployments. | pass | github.test.ts asserts 30 deployments produce only DEFAULT_DEPLOYMENT_STATUS_LIMIT=6 status calls, not 30 sequential calls. |
| AC2 | acceptance_criterion | Given open PRs exist, when `/api/state` renders, then PR data is still available for merge-status lanes. | pass | github.test.ts asserts pulls data remains present: [{ number: 7 }]. Live /api/state returned merge/PR lanes without GitHub degradation. |
| AC3 | acceptance_criterion | Given workflow runs exist, when `/api/state` renders, then recent build data is still available for build-status lanes. | pass | github.test.ts asserts workflow_runs data remains present: [{ id: 8, status: "in_progress" }]. Dashboard suite passed. |
| AC4 | acceptance_criterion | Given current/latest deployments exist, when `/api/state` renders, then deployment status data is available for those bounded deployments. | pass | github.test.ts asserts bounded deployment_statuses for latest deployment IDs; concurrency test asserts max in-flight statuses > 1. |
| AC5 | acceptance_criterion | Given live dashboard `/api/state` is checked after service restart, then it returns HTTP 200 within 8 seconds and does not show `GITHUB_READ_TIMEOUT` for normal measured GitHub response timings. | pass | Live verification after restart: /api/state 200 within 8s; pokeedge degraded=[]; pokeedge-web degraded=[]; detail probes 200. |
| C1 | constraint | Read-only; no mutation controls. | respected | Only GitHub read implementation/tests changed; no mutation controls. |
| C2 | constraint | No secrets/raw state links. | respected | Existing GitHub token sanitization tests still pass; no raw state links added. |
| C3 | constraint | Do not reintroduce ADV workflow query fan-out. | respected | No ADV reader changes; dashboard suite still passes worker-free tests. |
| C4 | constraint | Prefer current status over exhaustive historical data. | respected | Implementation caps latest deployment statuses and prioritizes current endpoint data; exhaustive status fan-out removed. |

