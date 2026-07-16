# Contract Traceability

**Change ID:** autoRollStaleWorkerBundle
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-16T01:14:12.463Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | worker.lock V2 bundle_generation written on acquire + preserved by heartbeat; worker-lock/worker-heartbeat suites green. |
| AC2 | acceptance_criterion | pass | test | build:worker emits bundle-manifest.json (SHA-256 over worker.js+workflows.js) E2E; generation d04435fd. |
| AC3 | acceptance_criterion | pass | test | worker-roll.ts drift monitor rolls via first-class restartChild on manifest-generation mismatch; worker-roll suite green. |
| AC4 | acceptance_criterion | pass | test | Same-generation no-op via in-memory generation tracking; 'lagging lock stamp cannot trigger re-roll' regression green. |
| AC5 | acceptance_criterion | pass | test | AC5 lost-update race closed via single-writer heartbeat (updateWorkerLockBundleGeneration deleted); red-on-old/green-now interleave regression; crash counter untouched. |
| AC6 | acceptance_criterion | pass | test | Drift/roll wired OOP-only in plugin-init; in-process worker path unchanged. |
| AC7 | acceptance_criterion | pass | test | Roll test matrix green: drift/no-op/single-flight/crash-counter/grace ordering; 53/53 worker suites. |
| C1 | constraint | respected | static_check | workflows.ts diff vs trunk empty; zero defineUpdate; OOP-only; determinism preserved. |
| DONT1 | avoidance | respected | review | Manifest-generation trigger (not time-only, not worker.js-only); owner-self-roll only, no cross-session force-kill, no alive-owner reclaim. |
| OOS1 | out_of_scope | not_applicable | not_applicable | Postgres backend / in-process migration / test-server leak excluded as agreed. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-4e3ecad6ab2d | AC1 |  |  |  |
| tk-eba95155e667 | AC2, AC3 |  |  |  |
| tk-5db210a929c2 | AC5 |  | C1 |  |
| tk-3e6661d1a26d | AC3, AC4, AC6 |  |  |  |
| tk-9541df923723 |  | AC7, AC4, AC5 |  |  |
