# Contract Traceability

**Change ID:** exposeBundleImpactTool
**Contract Version:** 1
**Rigor:** minimal
**Reviewed:** 2026-07-28T00:24:04.303Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | change.ts diff shows target_path/target_confirmed/confirmationEvidence added via targetPathSchema.shape spread; test 'schema exposes target_path / target_confirmed / confirmationEvidence' passes. |
| SC2 | success_criterion | pass | review | Cross-project test 'routes through withTargetPathStore and uses the TARGET project store/handle' passes; mock verifies mutation:true, stateRequirement:'temporal-required', all three trust fields forwarded. |
| SC3 | success_criterion | pass | review | Existing same-project tests (7) pass unchanged; no-target_path path invokes runSetImpact(store) directly. |
| SC4 | success_criterion | pass | review | Cross-project test verifies fireSignalAndRefresh fires against targetStore, save happens on targetStore not sessionStore, _projectContext attached to response. |
| SC5 | success_criterion | pass | review | Test 'schema exposes target_path / target_confirmed / confirmationEvidence' verifies args has the three keys and they are optional (omittable). |
| SC6 | success_criterion | pass | review | pnpm run check (typecheck, lint, format:check, schemas:check, generate:manifests:check, test-isolation, lockfile-policy) all green on edited regions. |
| AC1 | acceptance_criterion | pass | test | Schema in change.ts uses targetPathSchema.shape.target_path/target_confirmed/confirmationEvidence with canonical descriptions inherited from the shared targetPathSchema. |
| AC2 | acceptance_criterion | pass | test | Execute signature destructures { changeId, kind, rationale, target_path, target_confirmed, confirmationEvidence }; withTargetPathStore wrapper invokes runSetImpact via { store, target_path } pattern. |
| AC3 | acceptance_criterion | pass | test | Trust gate lives in resolveTargetProject (target-project.ts:164-168); when target_path is untrusted and target_confirmed absent, throws TargetProjectError. Test 'untrusted target_path without target_confirmed' verifies this surfaces via the outer catch. |
| AC4 | acceptance_criterion | pass | test | projectId resolution now reads projectContext?.projectId ?? (await getProjectId(activeStore.paths.root)) — matches adv_change_close pattern (L2870-L2872). |
| AC5 | acceptance_criterion | pass | test | All 7 existing tests in change.worker-bundle.test.ts pass unchanged (10/10 total includes 3 new). |
| AC6 | acceptance_criterion | pass | test | Cross-project test 'routes through withTargetPathStore and uses the TARGET project store/handle' verifies target store save, target workflow handle, _projectContext in response. |
| AC7 | acceptance_criterion | pass | test | Schema exposure test verifies args has target_path/target_confirmed/confirmationEvidence. Catalog readback post-deploy will surface the keys in adv_tool_catalog output; deferred to release verification. |
| AC8 | acceptance_criterion | pass | test | Test 'untrusted target_path without target_confirmed' asserts save NOT called (0 invocations), fireSignalAndRefresh NOT called (0 invocations), structured error returned. |
| C1 | constraint | respected | static_check | diff vs HEAD shows pure addition of targetPathSchema.shape spread + inner function refactor + withTargetPathStore wrapper; pattern matches adv_change_close verbatim. |
| C2 | constraint | respected | static_check | kind/rationale semantics unchanged; only schema additions and execute routing. No payload change to workerBundleImpactSetSignal. |
| C3 | constraint | respected | static_check | workerBundleImpactSetSignal import and signature unchanged in change.ts and temporal/messages.ts. |
| C4 | constraint | respected | static_check | No spec deltas defined on this change (verified). |
| C5 | constraint | respected | static_check | Existing same-project test fixtures unchanged; createMockStore and activeChange helpers reused as-is. |
| DONT1 | avoidance | respected | review | No provenance schema change; workerBundleProvenanceRecordedSignal and provenance recording path untouched. |
| DONT2 | avoidance | respected | review | Only adv_change_set_worker_bundle_impact modified; adv_change_update_issues and adv_conformance untouched. |
| DONT3 | avoidance | respected | review | Existing test fixture shape preserved; 3 new tests added in same describe block without modifying existing tests. |
| DONT4 | avoidance | respected | review | withTargetPathStore wrapper's resolveTargetProject owns the trust gate; outer try/catch only formats the error. No bypass path introduced. |
| OOS1 | out_of_scope | not_applicable | not_applicable | P25 related-scan deferred to separate change; documented in design.md Out of Scope. |
| OOS2 | out_of_scope | not_applicable | not_applicable | No provenance authority flow change. |
| OOS3 | out_of_scope | not_applicable | not_applicable | pinBuildkitImage re-verification noted as operator follow-up; this change does not touch pokeedge-web. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-4514aa0e2642 | SC1, SC2, SC3, SC4, SC5, SC6 | AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8 | C1, C2, C3, C4, C5 |  |
