# Contract Traceability

**Change ID:** fixArchiveTerminalDurability
**Contract Version:** 1
**Rigor:** strict
**Reviewed:** 2026-08-04T21:30:15.757Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | Guard removed on both routes (change.ts:4892 main, :4797 reconciliation); regression tests simulate recovery-writer-then-archive and assert the transition is requested on both routes; 229 tests in change.archive-phase9+change.test.ts. |
| AC2 | acceptance_criterion | pass | test | Terminal block awaits projectChangeState('terminal') before allHandlersFinished drain for archived AND closed (patch terminal-projection-v1); workflows.projection.itest.ts 4/4 asserts the Activity completes before workflow completion. |
| AC3 | acceptance_criterion | pass | test | Natural completion: condition wakes on terminal status, projection awaited, allHandlersFinished drained, return. No terminate()/cancel() added on archive path; replay + itest green. |
| AC4 | acceptance_criterion | pass | test | proveArchiveWorkflowTransition requires writer-attributable evidence: workflow-Activity schemaVersion:2 envelope carrying archived (handlers roll back unless that write succeeded) or terminal execution status; fails closed ARCHIVE_WORKFLOW_PROOF_FAILED/AMBIGUOUS. Regression tests: liveness-only RUNNING refused; stale plain-JSON poison refused; signal acceptance alone never succeeds. |
| AC5 | acceptance_criterion | pass | test | Terminal describe accepted as idempotent proof; WorkflowNotFoundError classified ARCHIVE_WORKFLOW_PROOF_AMBIGUOUS via classifyMutationRecoveryDecision, never success; recovery routes (audited disk proof, _recoveryMutation) exempt from proof by design. |
| AC6 | acceptance_criterion | pass | test | listSummary aligned with list/get via loadArchiveForActiveShadow:true; new regression in store-temporal/index.test.ts asserts list, summary, and show agree on terminal status with merged bundle + stale draft disk projection; 234-test storage sweep green. |
| AC7 | acceptance_criterion | pass | test | Hardcoded terminalFromWorkflow:0 literal removed from renderTerminalHistory; real counter path in readProjectionChangeList retained and typed; phantom fromCache field removed entirely; hydration-stat tests updated. |
| AC8 | acceptance_criterion | pass | test | verifyArchivedNoWorkflowProof requires shippedTerminalProof + disk archived + default-branch reachability + bundle sha256; convergence via coordinateChangeMutation single authority; positive and negative tests in change.workflow-terminate.test.ts (262-test sweep); absence of evidence never completes a workflow (not-found stays AMBIGUOUS). |
| AC9 | acceptance_criterion | pass | test | Bundle evidence evaluated before the stale-disk veto (reconcile-terminal-workflows.ts:161-172); typed skip reasons (still_active/no_archive_evidence) recorded and surfaced in doctor output and plugin-init diagnostics; 52 tests green. |
| AC10 | acceptance_criterion | pass | test | Caller fails closed on recovered_unverified with RELEASE_GATE_PROJECTION_COMMITTED_UNVERIFIED, commit evidence, and remediation; gate never materialized done on that path; archive-gate.test.ts 53 tests. |
| AC11 | acceptance_criterion | pass | test | Five-site audit table in ENGINEER_REPORT: gateCompleted UNSAFE and fixed via gate-completed-projection-v1 patch with awaited projection; four sites justified SAFE with per-site evidence; projection itest covers the fixed site. |
| AC12 | acceptance_criterion | pass | test | Both patches guarded by wf.patched op-name-vN constants; new legacy + current replay fixtures replay cleanly against the current bundle; replay-determinism 17/17, workflow-evolution-guard 17/17. |
| AC13 | acceptance_criterion | pass | test | workflows.projection.itest.ts drives archive signals to workflow completion and asserts post-completion projection/read parity (retention-expiry shape); phase9-fails-after-bundle retry scenario in change.archive-phase9.test.ts; full sweep 13 files / 496 tests green post-rebase. |
| C1 | constraint | respected | static_check | No defineUpdate handlers added anywhere in workflow-reachable code; change remains signal-only; workflow-bundle-boundary test green. |
| C2 | constraint | respected | static_check | workflow-bundle-boundary.test.ts 8/8: workflows.ts transitive import graph does not reach storage/, tools/, tool-registry.ts, plugin-init.ts, or node:*; no new imports introduced (existing proxied Activity reused). |
| C3 | constraint | respected | static_check | All new awaited workflow calls patch-guarded (terminal-projection-v1, gate-completed-projection-v1); replay fixtures prove pre-patch histories replay without nondeterminism. |
| C4 | constraint | respected | static_check | Temporal integration coverage lives in .itest.ts routed through with-test-env; no direct TestWorkflowEnvironment construction added. |
| C5 | constraint | respected | static_check | build:worker run before every OOP itest verification and rebuilt post-rebase (generation 79249ee6f119). |
| C6 | constraint | respected | static_check | AC13 e2e drives real Temporal workflows via with-test-env plus failure-injection scenarios at the tool seam; not unit-only; 496-test sweep. |
| C7 | constraint | respected | static_check | Repair requires the full proof chain (shippedTerminalProof + disk archived + default-branch reachability + readable bundle); not-found alone never admits; negative test proves refusal without default-branch bundle. |
| C8 | constraint | respected | static_check | Idempotency re-grounded per-side-effect: Route B reuses the existing bundle and skips cleanup while still requesting the transition; tests assert no duplicate bundle write and no double branch delete. |
| C9 | constraint | respected | static_check | rq-archiveTerminalDurability01 added to .adv/specs/advance-workflow/spec.json with 6 scenarios, plus rq-releaseProjectionDurability01.4 and rq-terminalProjectionTruth01.3; version 1.43.2 to 1.44.0; schemas:check clean; spec.test.ts 23/23. |
| DONT1 | avoidance | respected | review | No retention increase and no Temporal archival enabled; durability achieved via Activity-written external projection, per design. |
| DONT2 | avoidance | respected | review | The statusAlreadyArchived projection-read gate was removed, not reintroduced; transition requested unconditionally on both routes; no projection read gates any workflow transition in the new code. |
| DONT3 | avoidance | respected | review | Terminal durability is workflow-owned: the terminal block awaits the projection Activity before completion; caller-side proof is verification of that durable write, not a substitute for it. |
| DONT4 | avoidance | respected | review | Repair and reconciliation act only on positive evidence (bundle on default branch + archived disk + exact not-found); absence of evidence skips with typed reason; no workflow is completed on absence. |
| DONT5 | avoidance | respected | review | Unverifiable postconditions fail closed everywhere: archive proof typed codes, release-gate committed-unverified code, gate-completed projection logged warning; no silent success stamping. |
| DONT6 | avoidance | respected | review | Natural completion only; no terminate()/cancel() on the archive path; drain preserved via allHandlersFinished. |
| DONT7 | avoidance | respected | review | Proof requires durable artifacts (Activity envelope or terminal status) after bounded retry; bare WorkflowNotFoundError classified AMBIGUOUS, never proof; single immediate read never accepted. |
| DONT8 | avoidance | respected | review | Both patches follow the op-name-vN convention with legacy fallbacks; replay-determinism fixtures cover pre-patch histories; evolution guard green. |
| DONT9 | avoidance | respected | review | All work scoped to the advance repo; no target_path or foreign-project mutation; tests use temp dirs; pokeedge-web untouched. |
| DONT10 | avoidance | respected | review | Root causes repaired (guard removal, workflow-owned durable terminal write); boundedRetry used only inside proof verification, never as a substitute for the repair; no compatibility shims added. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-8006dc702eef | AC2, AC3 |  | C1, C2, C3, DONT3, DONT6, DONT8 |  |
| tk-120f57410315 | AC1 |  | C8, DONT2, DONT10 |  |
| tk-81c29ff70bad | AC4, AC5 |  | DONT4, DONT5, DONT7 |  |
| tk-a7c9c8ef5765 |  | AC12 | C3, C4, C5, DONT8 |  |
| tk-07388b7154aa | AC6, AC7 |  | DONT5 |  |
| tk-9bb98ad94749 | AC8 |  | C7, DONT4, DONT9 |  |
| tk-2934f2b6116d | AC9 |  | C7, DONT4 |  |
| tk-d6e11bef3f03 | AC10 |  | DONT5 |  |
| tk-b0854a8560b0 | AC11 |  | C3, DONT3 |  |
| tk-315663b1d433 |  | AC13 | C4, C5, C6, DONT9 |  |
| tk-b612bfcb06e2 |  |  | C9 |  |
