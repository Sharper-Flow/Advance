# Acceptance

Reviewed at: 2026-07-01T22:05:31.460Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | **SC1:** Main ADV spends less decision-context on raw local/CI verification output because triage output is structured and bounded. | pass | Structured verification triage docs/schema reduce raw-output digestion: adv-apply Verification Triage Result, adv-verification-triage-bundle schema, reviewer READY. |
| SC2 | success_criterion | **SC2:** Verification failures are classified consistently enough for main ADV to choose retry, engineer handoff, user escalation, or no-op. | pass | Schema enforces error_class, confidence, evidence_basis, recommended_next_action; route predicates tested in subagent-reports.test.ts. |
| SC3 | success_criterion | **SC3:** Cheap workers remain evidence collectors only; main ADV keeps all authority boundaries. | pass | Worker packet forbids editing, ADV state mutation, gate completion, final user-facing conclusions; bundle is orchestrator-submitted evidence only. |
| SC4 | success_criterion | **SC4:** Fixable in-scope failures can flow from triage to `adv-engineer` through a scoped handoff. | pass | route_adv_engineer predicate and suggested_handoff schema implemented; main ADV validation ownership documented in adv-apply. |
| AC1 | acceptance_criterion | **AC1:** Local verification bursts and CI/check-run failures both have a defined triage path. | pass | local_verify and ci_check phases plus command/ci_check targets implemented; asset tests passed. |
| AC2 | acceptance_criterion | **AC2:** Triage output is machine-readable, not prose-only, and includes status, command/check identity, bounded evidence, classification, confidence/evidence basis, and recommended next ADV action. | pass | VerificationTriageBundle schema includes status, targets, bounded evidence, error_class, confidence, evidence_basis, recommended_next_action; tests passed. |
| AC3 | acceptance_criterion | **AC3:** Triage worker/job cannot complete gates, mutate ADV state, change scope, edit code, or publish final user-facing conclusions. | pass | adv-apply packet rules forbid edit/state/gate/scope/user-facing authority; change-state stores bundle sidecar only; tests passed. |
| AC4 | acceptance_criterion | **AC4:** Main ADV owns any `adv-engineer` remediation handoff and only routes fixes after validating in-scope classification. | pass | route_adv_engineer requires SEMANTIC, no scope risk, high/medium confidence, handoff; main ADV owns actual adv-engineer packet. |
| AC5 | acceptance_criterion | **AC5:** Transient/flaky/environmental labels require an evidence policy defined in design; unsupported “flake” claims are invalid. | pass | TRANSIENT/ENVIRONMENTAL evidence policy documented; unsupported flake invalid; UNKNOWN routing-only; tests passed. |
| AC6 | acceptance_criterion | **AC6:** Existing verify-burst/operational delegation behavior is upgraded or explicitly superseded; no phantom worker route is introduced. | pass | Existing Verify-Only Burst remains general with packet contract; no new spawnable agent added; delegation-matrix tests passed. |
| C1 | constraint | **C1:** Worker output is evidence, not authority. | respected | Specs and command docs state bundle/worker output is evidence, not authority. |
| C2 | constraint | **C2:** Main ADV owns gate completion, scope decisions, ADV state mutation, release/acceptance authority, and user-facing synthesis. | respected | Command docs preserve main ADV gate/scope/state/release/user-facing ownership. |
| C3 | constraint | **C3:** Verification claims must be source-backed by logs, command output, check-run metadata, or test evidence. | respected | Target/finding evidence schemas require source references; command docs require logs/check metadata/test evidence. |
| C4 | constraint | **C4:** First implementation must cover both local verification bursts and CI/check-run failures. | respected | local_verify command targets and ci_check repo/check/head_sha targets both implemented. |
| C5 | constraint | **C5:** Design must decide transient/flaky/environmental evidence policy before those labels drive routing. | respected | TRANSIENT, ENVIRONMENTAL, FATAL, SEMANTIC, UNKNOWN evidence semantics specified in spec and adv-apply. |
| DONT1 | avoidance | **DONT1:** Do not let cheap workers decide release readiness, acceptance, scope drift, or cancellation. | respected | No worker release/acceptance/scope/cancellation authority introduced; reviewer READY. |
| DONT2 | avoidance | **DONT2:** Do not create unbounded polling loops in normal ADV context. | respected | No polling loops added; ci_check consumes existing failure evidence only. |
| DONT3 | avoidance | **DONT3:** Do not hide red verification behind generic retry or “flake” labels without evidence. | respected | Unsupported flake claims explicitly invalid; transient requires rerun/infra evidence. |
| DONT4 | avoidance | **DONT4:** Do not make triage worker/job silently edit code or mutate ADV state. | respected | Worker packet forbids code edits and ADV mutation; worker does not call adv_subagent_report_submit. |
| DONT5 | avoidance | **DONT5:** Do not introduce a phantom worker route without shipped agent assets or explicit use of an existing worker. | respected | No adv-verifier spawnable agent introduced; existing general Verify-Only Burst upgraded structurally. |
| OOS1 | out_of_scope | **OOS1:** Branch protection, GitHub Actions policy, and CI provider configuration changes. | not_applicable | No branch protection, GitHub Actions policy, or CI provider config changes made. |
| OOS2 | out_of_scope | **OOS2:** Replacing passive CI waiting unless design finds consolidation with `addCiWaitAgent` is the cleanest path. | not_applicable | Passive CI waiting not replaced; triage handles observed failure evidence only. |
| OOS3 | out_of_scope | **OOS3:** Changing `adv_run_test` internals unless design proves result shape changes are required for triage. | not_applicable | adv_run_test internals unchanged. |

