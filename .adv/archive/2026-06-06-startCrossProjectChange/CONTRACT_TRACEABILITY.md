# Contract Traceability

**Change ID:** startCrossProjectChange
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-06-06T21:17:00.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Review verdict READY. change-cross-project-create.test proves target_path create routes through temporal-required target store and returns _projectContext stateMode temporal; workflow-start path supplies Visibility search attrs. |
| SC2 | success_criterion | pass | review | store-temporal/index.test proves list/read reseed of active disk-only changes via normal getTemporalChange/reseedChangeFromDisk path; no one-off repair path added. |
| SC3 | success_criterion | pass | review | change-cross-project-create.test failure case proves target Temporal create failure returns error and source link is not written; store-temporal/changes.ts retains rollback on workflow start failure. |
| SC4 | success_criterion | pass | review | target-project routing uses withTargetPathStore temporal-required and ensureProjectTemporalQueue before createStore; no target workflow query is required for creation/status visibility. Tests prove worker-query-free target create path. |
| AC1 | acceptance_criterion | pass | test | src/tools/change-cross-project-create.test.ts: target_path creation calls withTargetPathStore with stateRequirement temporal-required and targetStore.changes.create. |
| AC2 | acceptance_criterion | pass | test | src/storage/store-temporal/changes.test.ts proves target create seed reaches ensureChangeWorkflowStarted; workflow-start.ts builds Temporal searchAttributes for every workflow start. check/test suites passed. |
| AC3 | acceptance_criterion | pass | test | src/tools/change-cross-project-create.test.ts asserts targetStore.changes.get is not called after target create; post-create target get/save patch removed. |
| AC4 | acceptance_criterion | pass | test | src/tools/change-cross-project-create.test.ts covers target create failure: error contains Temporal workflow start failure and sourceStore.changes.save is not called; temporal store rollback path remains covered in changes tests. |
| AC5 | acceptance_criterion | pass | test | src/storage/store-temporal/index.test.ts covers direct read reseed and list reseed of active disk-only changes; archived/closed records are not started/recreated. |
| AC6 | acceptance_criterion | pass | test | Design selected list/read reseed. src/storage/store-temporal/index.test.ts bounds the path through getTemporalChange/reseedChangeFromDisk; no startup scanner added. |
| AC7 | acceptance_criterion | pass | test | src/tools/change-cross-project-create.test.ts and cross-project-coordination.test.ts prove target_confirmed/confirmationEvidence routing and canonical target context use; target-project.test already covers canonical shard helper behavior. |
| AC8 | acceptance_criterion | pass | test | Spec rq-crossProjectCoordination01 updated. Relevant tests passed: 184 targeted tests plus pnpm run check. |
| C1 | constraint | respected | static_check | Post-create targetStore.changes.get was removed; test asserts it is not called. No source-process target workflow getState query is used for create. |
| C2 | constraint | respected | static_check | Active status reads remain Temporal-backed; disk is used only as reseed/projection fallback for missing workflows and terminal records, per store-temporal/index.ts tests. |
| C3 | constraint | respected | static_check | adv_change_create now exposes target_confirmed and confirmationEvidence and delegates trust gating to withTargetPathStore. Preflight blanks omit confirmationEvidence for contextual validation. |
| C4 | constraint | respected | static_check | Target project id/external root comes from withTargetPathStore context; cross-project coordination test proves target canonical store is used rather than caller shard. |
| C5 | constraint | respected | static_check | reseedChangeFromDisk returns archived/closed disk projections without ensureChangeWorkflowStarted; list test proves only active disk-only record starts. |
| C6 | constraint | respected | static_check | Correctness implemented structurally via typed metadata fields, workflow state contract, signal, preflight policy, spec law, and regression tests. |
| DONT1 | avoidance | respected | review | No multi-namespace or multi-Temporal-server code added; implementation reuses existing service/target store machinery. |
| DONT2 | avoidance | respected | review | No launcher behavior changed; visibility/status behavior is via existing target Temporal workflows and current status data. |
| DONT3 | avoidance | respected | review | Reconciliation uses generic list/read reseed for all active disk-only changes; no reworkRelatedCards-specific repair path added. |
| DONT4 | avoidance | respected | review | Implementation reuses withTargetPathStore, createStore, ensureChangeWorkflowStarted, and existing reseed helpers; no duplicate target-store/start machinery added. |
| DONT5 | avoidance | respected | review | Target create failure returns an error and does not write source links; temporal store create rollback preserves no active disk-only orphan semantics. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-873bd3762fab | AC1, AC2 | AC2 | C1, C6, DONT4, DONT5 |  |
| tk-dcdfbc164743 | AC1, AC2, AC3, AC4, AC7 | AC1, AC2, AC3, AC4, AC7 | C1, C3, C4, C6, DONT1, DONT2, DONT4, DONT5 |  |
| tk-44042f1cb172 | AC5, AC6 | AC5, AC6 | C2, C5, C6, DONT2, DONT3, DONT4 |  |
| tk-17a9028d9076 | AC8 | AC8 | C3, C4, C6, DONT4 |  |
| tk-e3d9e51d2cc1 |  | AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, SC1, SC2, SC3, SC4 | C1, C2, C3, C4, C5, C6, DONT1, DONT2, DONT3, DONT4, DONT5 |  |
