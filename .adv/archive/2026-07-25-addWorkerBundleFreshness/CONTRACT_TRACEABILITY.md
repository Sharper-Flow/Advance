# Contract Traceability

**Change ID:** addWorkerBundleFreshness
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-25T18:50:08.229Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | gate-readiness.test.ts AC1: required + missing/failing provenance -> WORKER_BUNDLE_PROVENANCE_MISSING blocker. tr_ms0my3kg, tr_ms0pzw3p. |
| AC2 | acceptance_criterion | pass | test | gate-readiness.test.ts AC2: required + valid provenance (source_sha + passing build_worker/replay_determinism runs) -> pass. |
| AC3 | acceptance_criterion | pass | test | gate-readiness.test.ts AC3: not_applicable (typed rationale) -> skipped; rationale-free -> WORKER_BUNDLE_PROVENANCE_NOT_APPLICABLE_RATIONALE_REQUIRED. |
| AC4 | acceptance_criterion | pass | test | typed worker_bundle_impact field (set via adv_change_set_worker_bundle_impact); absent -> WORKER_BUNDLE_PROVENANCE_DECLARATION_REQUIRED (no heuristic bypass). |
| AC5 | acceptance_criterion | pass | test | evaluateWorkerBundleProvenance invoked from evaluateGateReadiness (hard readiness, blocking) under enforceWorkerBundleProvenance; NOT CRITERION_EVALUATORS. |
| C1 | constraint | respected | static_check | Gate evaluator reads workflow state only (testRuns/workerBundleProvenance/worker_bundle_impact); no async filesystem/runtime probes. |
| C2 | constraint | respected | static_check | Applicability is typed (worker_bundle_impact field), not a path heuristic; authority = typed declaration. |
| C3 | constraint | respected | static_check | Evidence is durable (testRuns via adv_run_test + provenance receipt via signal); no caller-trusted boolean. |
| C4 | constraint | respected | static_check | No regression: pnpm run check clean; 48 workflow itests green; existing release-gate tests pass; wf.patched preserves old-history behavior. |
| DONT1 | avoidance | respected | review | No runtime/filesystem probes from evaluator (state-only). |
| DONT2 | avoidance | respected | review | No path-heuristic authority; typed declaration only. |
| DONT3 | avoidance | respected | review | No claim of post-deploy freshness; rq-workerBundleReleaseProvenance01.5 affirms out-of-scope. |
| OOS1 | out_of_scope | missing | not_applicable |  |
| OOS2 | out_of_scope | missing | not_applicable |  |
| OOS3 | out_of_scope | missing | not_applicable |  |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-50e16e7530b0 |  |  | C1, C2, DONT2, DONT3 |  |
| tk-b462f7475ec6 |  | AC4 | C1, C3, DONT1 |  |
| tk-409ae138e9ba |  | AC2 | C1, C4 |  |
| tk-6cccd5c24647 |  | AC1, AC2, AC3, AC5 | C1, C2, DONT1, DONT2, DONT3 |  |
| tk-917239b20fa0 |  |  | C2, C3, DONT2 |  |
| tk-4386e3fa9090 |  | AC1, AC2, AC3, AC4, AC5 | C1, C4 |  |
