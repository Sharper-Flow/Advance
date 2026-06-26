# Contract Traceability

**Change ID:** prioritizeLiveGithubStatus
**Contract Version:** 1
**Rigor:** minimal
**Reviewed:** 2026-06-26T21:24:50.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | github.test.ts asserts 30 deployments produce only DEFAULT_DEPLOYMENT_STATUS_LIMIT=6 status calls, not 30 sequential calls. |
| AC2 | acceptance_criterion | pass | test | github.test.ts asserts pulls data remains present: [{ number: 7 }]. Live /api/state returned merge/PR lanes without GitHub degradation. |
| AC3 | acceptance_criterion | pass | test | github.test.ts asserts workflow_runs data remains present: [{ id: 8, status: "in_progress" }]. Dashboard suite passed. |
| AC4 | acceptance_criterion | pass | test | github.test.ts asserts bounded deployment_statuses for latest deployment IDs; concurrency test asserts max in-flight statuses > 1. |
| AC5 | acceptance_criterion | pass | test | Live verification after restart: /api/state 200 within 8s; pokeedge degraded=[]; pokeedge-web degraded=[]; detail probes 200. |
| C1 | constraint | respected | static_check | Only GitHub read implementation/tests changed; no mutation controls. |
| C2 | constraint | respected | static_check | Existing GitHub token sanitization tests still pass; no raw state links added. |
| C3 | constraint | respected | static_check | No ADV reader changes; dashboard suite still passes worker-free tests. |
| C4 | constraint | respected | static_check | Implementation caps latest deployment statuses and prioritizes current endpoint data; exhaustive status fan-out removed. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-c4708422d144 | AC1, AC2, AC3, AC4, AC5 | AC1, AC2, AC3, AC4, AC5 | C1, C2, C3, C4 |  |
