# Contract Traceability

**Change ID:** fixWorkerBundleProvenanceGate
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-08-03T21:52:00.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | WorkerBundleProvenanceSchema authored beside WorkerBundleImpactSchema and workerBundleProvenance declared optional on ChangeSchema (types/changes.ts). Load-bearing: TEMPORAL_OWNED_PROJECTION_FIELDS is typed satisfies readonly (keyof Change)[] and will not compile without it. RED tr_msdng1mb_694708d0 3 of 7 failing, GREEN tr_msdnh2y2_629c97b8 7/7. adv-reviewer READY, report fixWorkerBundleProvenanceGate|tk-853702694f84|adv-reviewer|1, confirming shape fidelity against contracts.ts:751-757. |
| AC2 | acceptance_criterion | pass | test | Both worker_bundle_impact and workerBundleProvenance added to mapTemporalChangeStateToChange and TEMPORAL_OWNED_PROJECTION_FIELDS in store-temporal/shared.ts; both layers required because projectTemporalStateOntoLatest merges mapper output filtered through the allowlist. RED tr_msdnrcq2_9f948857 failed all four assertions reproducing the defect; GREEN tr_msdnsjke_e5820a09 4/4. |
| AC3 | acceptance_criterion | pass | test | storage/worker-bundle.archive-roundtrip.test.ts persists a required-impact Change with matching passing build_worker and replay_determinism runs via real saveChange, reloads via loadChange, and asserts evaluateWorkerBundleProvenanceForChange returns exactly { ok: true, blockers: [] }. This is rq-workerBundleReleaseProvenance01.2, the passing path that had never been reachable. Verified tr_msdrk83s_adf3f6b4. |
| AC4 | acceptance_criterion | pass | test | Missing-receipt and blank-source_sha blocking branches asserted with specific blocker codes in gate-readiness.test.ts, not mere falsiness. Independent scanner RED-verified the guards by reverting production code and observing specific failure messages. |
| AC5 | acceptance_criterion | pass | test | Unresolvable run IDs block with WORKER_BUNDLE_PROVENANCE_MISSING naming the unresolved run; failing runs with exitCode !== 0 block with WORKER_BUNDLE_PROVENANCE_FAILING. Both asserted in gate-readiness.test.ts. Scanner confirmed the typed-evidence contract is pinned by a matches-runs-by-typed-evidence_kind-not-command-substring test. |
| AC6 | acceptance_criterion | pass | test | not_applicable without rationale blocks; undeclared impact blocks and is not bypassed by worker-bundle path hints, asserted at gate-readiness.test.ts:2478-2495. Security scanner independently confirmed the evaluator reads state.worker_bundle_impact and introduces no file or path inspection. |
| AC7 | acceptance_criterion | pass | test | Pre-generate schemas:check failed with stale change.schema.json, proving regeneration was required. Diff is exactly one file, +26/-0, containing only the new optional property. Determinism verified: two consecutive generate runs produced identical SHA-256 ccf1dc84bcf83450. Post-generate schemas:check passed tr_msdnwc8x_9b512706. adv-reviewer READY on diff scope, shape fidelity, absence of hand-editing, and registry correctness. |
| AC8 | acceptance_criterion | pass | test | Full suite tr_msdppwn2_616813b1 exit 0 with zero failures at VITEST_MAX_WORKERS=4. Combined schemas:check plus pnpm run check tr_msdps3n3_643b2d46 exit 0, 0 errors, prettier clean, agent manifests matching, test-isolation, frontmatter, and lockfile policy checks passing; only 4 pre-existing no-explicit-any warnings in untouched files. Post-split re-verification tr_msdrk83s_adf3f6b4 190/190. |
| C1 | constraint | respected | static_check | No fail-open introduced. Independent security scanner confirmed all six blocking branches remain reachable and blocking: undeclared impact 1027-1036, not_applicable without rationale 1043-1052, missing receipt 1055-1065, blank source_sha 1068-1077, unresolved or wrongly typed run IDs 1080-1106, and nonzero or null run exits 1109-1128. The only behavioral change is the intended one. Separately disclosed and NOT silently absorbed: the gate's positive evidence is forgeable via caller-chosen evidence_kind, a pre-existing weakness in files this change does not touch, documented in the agreement and split to a follow-up change by operator direction. |
| C2 | constraint | respected | static_check | Run validation untouched. The evaluator still requires runId match, evidence_kind match, and exitCode === 0 for both build_worker and replay_determinism. test_runs already projected correctly before this change, so run validation works end to end without modification. |
| C3 | constraint | respected | static_check | No path heuristics introduced. Applicability remains exclusively the typed declaration; regression test at gate-readiness.test.ts:2478-2495 asserts affectedPaths cannot bypass the declaration. Security scanner independently verified the evaluator introduces no file or path inspection. |
| C4 | constraint | respected | static_check | Existing blocker codes and reason shapes preserved; a dedicated assertion in archive-gate.test.ts pins the structured readinessBlockers payload consumed by archive-gate.ts. Return-type widening on the projection path was additive. Schema change is additive-optional, preserving replay safety for histories predating it, which matters because types/changes.ts is inside the worker-bundle import closure. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-853702694f84 | AC1 |  | C4 |  |
| tk-0f7410ffe9b7 | AC2 |  | C1, C2, C4 |  |
| tk-e314f51294f0 | AC7 |  | C4 |  |
| tk-cbff6085c204 | AC3 | AC2, AC3 | C1, C4 |  |
| tk-214f5645a3ab | AC4, AC5, AC6, AC8 | AC1, AC4, AC5, AC6, AC7, AC8 | C1, C2, C3, C4 |  |
