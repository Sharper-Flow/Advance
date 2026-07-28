# Contract Traceability

**Change ID:** preventRedeployWorkflow
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-28T00:48:00.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Both deploy surfaces (self-roll worker-roll.ts:154-196, bounce deploy-local.sh:1421-1432) now gate on replay verification before swapping worker bundles. 5 unit tests prove block-on-fail and pass-allows-roll. ADV_FORCE_DEPLOY override tested in both paths. |
| SC2 | success_criterion | pass | review | Self-roll monitor (worker-roll.ts:checkAndRoll) carries the verifyCandidateBundle gate. deploy-local.sh:1362,1370 skips self-roll workers, confirming self-roll is the dominant path. The gate is in the self-roll code path, not just the bounce. |
| AC1 | acceptance_criterion | pass | test | Unit test 'verification failure blocks the roll' (worker-roll.test.ts): mock returns {passed:false} → restartChild NOT called, result is {rolled:false, reason:roll_failed, error matches /replay verification/i}. Run tr_ms3xrxps_16a8ae0a. |
| AC2 | acceptance_criterion | pass | test | deploy-local.sh:1421-1432 inserts verification gate before SIGTERM loop. Bash syntax valid (tr_ms3xrkyk_be496655). Gate returns 1 on failure, preventing bounce. Verifier output now visible (review fix e1f4cc30). |
| AC3 | acceptance_criterion | pass | test | ADV_FORCE_DEPLOY=1 tested in unit test (worker-roll.test.ts): override set → verifyCandidateBundle NOT called, restartChild IS called. Bash gate checks ADV_FORCE_DEPLOY at deploy-local.sh:1421. Both paths log risk statement. |
| AC4 | acceptance_criterion | pass | test | plugin/package.json has verify:worker-bundle script. .github/workflows/ci.yml has 'Verify candidate worker bundle' step after build:worker. Script exits 0 against built bundle (tr_ms3x89m1_754f9749). |
| AC5 | acceptance_criterion | pass | test | bounce_grace_seconds changed from 2 to 6 (deploy-local.sh:1362). SDK TEMPORAL_WORKER_SHUTDOWN_GRACE_MS=5000 (worker.ts:29). 6s > 5s grace. Probe at :1432 now fires after drain completes. |
| AC6 | acceptance_criterion | pass | test | deploy-local.sh:1433 prints [ADV:RESIDUAL_RISK] line before every bounce: 'Fixture corpus is advance-repo-only; cross-project workflow shapes may not be represented.' |
| AC7 | acceptance_criterion | pass | test | worker-deployment-readiness.ts:17 topology is singleton_replace_in_place (unpinned). File NOT touched by any implementation commit (git diff confirmed). Readiness returns ready:false. |
| C1 | constraint | respected | static_check | No Worker.create call site modified. No buildId/useVersioning/deploymentOptions added. worker-deployment-readiness.ts untouched. git diff confirms zero changes to worker versioning config. |
| C2 | constraint | respected | static_check | workflows.ts NOT touched by any implementation commit (git diff trunk..HEAD -- workflows.ts is empty for my commits). The change only touches deployment plumbing. |
| C3 | constraint | respected | static_check | Release-path provenance gate (adv_change_set_worker_bundle_impact, adv_worker_bundle_provenance_record) NOT modified. change.ts diff is trunk drift, not my commits. |
| C4 | constraint | respected | static_check | Both gates return non-zero/block on verification failure. ADV_FORCE_DEPLOY override requires explicit env var set + logs risk statement. No silent no-op path exists. |
| DONT1 | avoidance | respected | review | No drain machinery built. SDK SIGTERM drain (shutdownGraceTime=5s) used as-is. bounce_grace_seconds changed to accommodate existing drain, not replace it. |
| DONT2 | avoidance | respected | review | verifyCommittedReplayFixtures imported from existing module (replay-verification.ts:144). No reimplementation. Worker-deployment-readiness.ts not modified. Evolution guard not touched. |
| DONT3 | avoidance | respected | review | No new fixtures added. Existing 10-fixture corpus used as-is. Residual risk documented in deploy output (AC6). |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-1d825d9ffd5f | AC4 | AC7 | DONT2 |  |
| tk-13996d4e854a | AC1, AC3 | SC1, SC2 | C2, C4, DONT2 |  |
| tk-d1e48bb474fd | AC2, AC3, AC5, AC6 | SC1 | C4, DONT1 |  |
| tk-6b1d3ce7db5e | AC2, AC3, AC5, AC6 | SC1 | C4, DONT1 |  |
| tk-6b5e7b629da3 |  | AC7, C1, C2, C3 | DONT2, DONT3 |  |
