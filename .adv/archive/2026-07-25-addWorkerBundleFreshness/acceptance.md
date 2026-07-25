# Acceptance

Reviewed at: 2026-07-25T18:50:08.229Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| AC1 | acceptance_criterion | **AC1:** A change declared `worker_bundle_impact: required` is BLOCKED at the release gate when durable evidence (adv_run_test runs) for `build:worker` + replay-determinism is missing or failing. | pass | gate-readiness.test.ts AC1: required + missing/failing provenance -> WORKER_BUNDLE_PROVENANCE_MISSING blocker. tr_ms0my3kg, tr_ms0pzw3p. |
| AC2 | acceptance_criterion | **AC2:** A change declared `worker_bundle_impact: required` with green build:worker + replay-determinism evidence PASSES the release gate. | pass | gate-readiness.test.ts AC2: required + valid provenance (source_sha + passing build_worker/replay_determinism runs) -> pass. |
| AC3 | acceptance_criterion | **AC3:** A change declared `worker_bundle_impact: not_applicable` (with rationale) is NOT blocked by the freshness/replay gate (skipped). | pass | gate-readiness.test.ts AC3: not_applicable (typed rationale) -> skipped; rationale-free -> WORKER_BUNDLE_PROVENANCE_NOT_APPLICABLE_RATIONALE_REQUIRED. |
| AC4 | acceptance_criterion | **AC4:** `worker_bundle_impact` is a typed field on the change (set at planning), not derived from path heuristics; the gate reads it structurally. | pass | typed worker_bundle_impact field (set via adv_change_set_worker_bundle_impact); absent -> WORKER_BUNDLE_PROVENANCE_DECLARATION_REQUIRED (no heuristic bypass). |
| AC5 | acceptance_criterion | **AC5:** The check lives in `evaluateGateReadiness` (hard readiness), NOT the advisory `CRITERION_EVALUATORS` (which is synchronous/deterministic/advisory and cannot probe evidence). | pass | evaluateWorkerBundleProvenance invoked from evaluateGateReadiness (hard readiness, blocking) under enforceWorkerBundleProvenance; NOT CRITERION_EVALUATORS. |
| C1 | constraint | **C1:** Gate check is state-only/deterministic (reads workflow state + durable test-run records); no async filesystem/runtime probes. | respected | Gate evaluator reads workflow state only (testRuns/workerBundleProvenance/worker_bundle_impact); no async filesystem/runtime probes. |
| C2 | constraint | **C2:** Applicability is typed/declared, not a path heuristic. | respected | Applicability is typed (worker_bundle_impact field), not a path heuristic; authority = typed declaration. |
| C3 | constraint | **C3:** Evidence is durable (adv_run_test runs bound to the change), not a caller-trusted boolean. | respected | Evidence is durable (testRuns via adv_run_test + provenance receipt via signal); no caller-trusted boolean. |
| C4 | constraint | **C4:** No regression of existing release-gate checks (obligations, routing, verification evidence, etc.). | respected | No regression: pnpm run check clean; 48 workflow itests green; existing release-gate tests pass; wf.patched preserves old-history behavior. |
| DONT1 | avoidance | **DONT1:** MUST NOT probe the live filesystem/runtime from the gate evaluator (breaks determinism). | respected | No runtime/filesystem probes from evaluator (state-only). |
| DONT2 | avoidance | **DONT2:** MUST NOT use a path heuristic as the release authority for applicability. | respected | No path-heuristic authority; typed declaration only. |
| DONT3 | avoidance | **DONT3:** MUST NOT claim archive-time evidence proves the operator deployed + restarted (that's post-deploy/runtime — out of scope). | respected | No claim of post-deploy freshness; rq-workerBundleReleaseProvenance01.5 affirms out-of-scope. |
| OOS1 | out_of_scope | **OOS1:** Post-deploy / post-restart health check (deployed build-identity == loaded plugin generation == worker generation). Separate lifecycle (runtime), tracked as a follow-up. | missing |  |
| OOS2 | out_of_scope | **OOS2:** Replaying production histories (needs credentials/retention/privacy design). | missing |  |
| OOS3 | out_of_scope | **OOS3:** CI pipeline integration to auto-record evidence (this change consumes adv_run_test evidence already produced during execution). | missing |  |

