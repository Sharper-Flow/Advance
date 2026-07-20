# Acceptance

Reviewed at: 2026-07-17T23:36:00.000Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | Every planned task has an explicit proof target and evidence route. | pass | Independent acceptance review READY; task evidence plan is persisted and resolver-backed. |
| SC2 | success_criterion | Agents can use a non-test route without creating fake tests when rationale and review support it. | pass | Review route now requires bounded rationale and conclusion; reviewer verified task-create gap fix. |
| SC3 | success_criterion | Uncertain logic-bearing work may use structured review proof; uncertainty cannot silently erase evidence. | pass | Resolver and readiness integration tests cover structured review proof for uncertain logic-bearing work. |
| SC4 | success_criterion | New policy prevents avoidable local test debt without creating a repo-wide cleanup obligation. | pass | Reviewer guidance/spec updates require safe local cleanup without repository-wide obligation. |
| AC1 | acceptance_criterion | Given a planned task, when its evidence is prepared, then it records a proof target and an approved evidence route before completion. | pass | Task classifier, prep readiness, completion, and task-tool tests passed; full suite passed post-remediation. |
| AC2 | acceptance_criterion | Given work where an automated test adds no meaningful regression value, when a non-test route is selected, then a bounded rationale and review conclusion are recorded. | pass | Task-tool review-route acceptance/rejection tests pass; rationale and review conclusion are structurally validated. |
| AC3 | acceptance_criterion | Given logic-bearing work with uncertain risk, when test applicability is unclear, then structured review proof is an allowed route and its conclusion is recorded. | pass | Resolver/readiness tests cover permitted structured review proof and rejected unsupported routes. |
| AC4 | acceptance_criterion | Given a clearly flaky, tautological, permanently skipped, or implementation-coupled test in the directly touched subsystem, when the change reaches review, then the issue is remediated when safe and local; broader cleanup remains out of scope. | pass | Spec/command asset tests pass for reviewer-owned safe local cleanup guidance. |
| AC5 | acceptance_criterion | Given advisory quality signals such as test count, coverage, assertion density, mock surface, or flake indicators, when evidence is evaluated, then none independently completes or blocks a task or gate. | pass | Gate-readiness tests and resolver partition retain advisory quality signals outside completion authority. |
| AC6 | acceptance_criterion | Given an existing in-flight task, when policy changes apply, then valid historical evidence remains readable and compatibility behavior is explicit. | pass | Legacy normalization and additive completion-proof tests passed. |
| AC7 | acceptance_criterion | Given a meaningful behavior-critical change, when its evidence route is assessed, then the policy retains behavior-focused regression proof rather than granting an unsupported exemption. | pass | Behavior-critical not_applicable route rejection is covered by resolver and prep-readiness tests. |
| C1 | constraint | Do not introduce numerical test, coverage, or assertion quotas. | respected | Spec and code review found no numeric quota logic. |
| C2 | constraint | Do not require universal red/green evidence for every task. | respected | Existing evidence-policy alternatives remain available; no universal red/green rule added. |
| C3 | constraint | Do not add a dependency unless later discovery establishes a concrete unsupported need. | respected | No dependency or lockfile addition in change diff. |
| C4 | constraint | Keep completion and gate authority structural; heuristic signals remain advisory. | respected | Pure resolver and typed schemas own compatibility; heuristic signals remain advisory. |
| C5 | constraint | Preserve readable, explicit compatibility behavior for valid in-flight and historical evidence. | respected | Legacy provenance and additive proof records preserve historical readability. |
| DONT1 | avoidance | Do not create a bulk cleanup obligation for PokeEdge or PokeEdge Web. | respected | No PokeEdge/PokeEdge Web cleanup changes included. |
| DONT2 | avoidance | Do not duplicate worker-cap work owned by `addAdvanceTestCap`. | respected | No worker-cap changes included. |
| DONT3 | avoidance | Do not duplicate suite-isolation work owned by `fixFullSuiteStability`. | respected | No suite-isolation changes included. |
| DONT4 | avoidance | Do not create a second evidence-policy system parallel to the existing task and contract model. | respected | Implementation extends existing task/contract model rather than a parallel policy store. |
| DONT5 | avoidance | Do not use test counts, coverage, assertion density, mock surface, or flake indicators as independent correctness authority. | respected | Review confirms test-quality signals remain advisory and do not independently complete or block gates. |
| OOS1 | out_of_scope | Bulk deletion, rewriting, or quarantine of existing consumer-repository tests. | not_applicable | No consumer-repository test rewrite included. |
| OOS2 | out_of_scope | Worker-cap policy and full-suite isolation remediation. | not_applicable | No worker-cap or full-suite isolation remediation included. |
| OOS3 | out_of_scope | Selecting a numeric CI duration, coverage, assertion-count, or test-count target. | not_applicable | No numeric CI/test/coverage target introduced. |
