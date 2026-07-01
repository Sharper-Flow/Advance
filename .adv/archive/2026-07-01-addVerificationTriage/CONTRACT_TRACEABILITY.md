# Contract Traceability

**Change ID:** addVerificationTriage
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-01T22:05:31.460Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Structured verification triage docs/schema reduce raw-output digestion: adv-apply Verification Triage Result, adv-verification-triage-bundle schema, reviewer READY. |
| SC2 | success_criterion | pass | review | Schema enforces error_class, confidence, evidence_basis, recommended_next_action; route predicates tested in subagent-reports.test.ts. |
| SC3 | success_criterion | pass | review | Worker packet forbids editing, ADV state mutation, gate completion, final user-facing conclusions; bundle is orchestrator-submitted evidence only. |
| SC4 | success_criterion | pass | review | route_adv_engineer predicate and suggested_handoff schema implemented; main ADV validation ownership documented in adv-apply. |
| AC1 | acceptance_criterion | pass | test | local_verify and ci_check phases plus command/ci_check targets implemented; asset tests passed. |
| AC2 | acceptance_criterion | pass | test | VerificationTriageBundle schema includes status, targets, bounded evidence, error_class, confidence, evidence_basis, recommended_next_action; tests passed. |
| AC3 | acceptance_criterion | pass | test | adv-apply packet rules forbid edit/state/gate/scope/user-facing authority; change-state stores bundle sidecar only; tests passed. |
| AC4 | acceptance_criterion | pass | test | route_adv_engineer requires SEMANTIC, no scope risk, high/medium confidence, handoff; main ADV owns actual adv-engineer packet. |
| AC5 | acceptance_criterion | pass | test | TRANSIENT/ENVIRONMENTAL evidence policy documented; unsupported flake invalid; UNKNOWN routing-only; tests passed. |
| AC6 | acceptance_criterion | pass | test | Existing Verify-Only Burst remains general with packet contract; no new spawnable agent added; delegation-matrix tests passed. |
| C1 | constraint | respected | static_check | Specs and command docs state bundle/worker output is evidence, not authority. |
| C2 | constraint | respected | static_check | Command docs preserve main ADV gate/scope/state/release/user-facing ownership. |
| C3 | constraint | respected | static_check | Target/finding evidence schemas require source references; command docs require logs/check metadata/test evidence. |
| C4 | constraint | respected | static_check | local_verify command targets and ci_check repo/check/head_sha targets both implemented. |
| C5 | constraint | respected | static_check | TRANSIENT, ENVIRONMENTAL, FATAL, SEMANTIC, UNKNOWN evidence semantics specified in spec and adv-apply. |
| DONT1 | avoidance | respected | review | No worker release/acceptance/scope/cancellation authority introduced; reviewer READY. |
| DONT2 | avoidance | respected | review | No polling loops added; ci_check consumes existing failure evidence only. |
| DONT3 | avoidance | respected | review | Unsupported flake claims explicitly invalid; transient requires rerun/infra evidence. |
| DONT4 | avoidance | respected | review | Worker packet forbids code edits and ADV mutation; worker does not call adv_subagent_report_submit. |
| DONT5 | avoidance | respected | review | No adv-verifier spawnable agent introduced; existing general Verify-Only Burst upgraded structurally. |
| OOS1 | out_of_scope | not_applicable | not_applicable | No branch protection, GitHub Actions policy, or CI provider config changes made. |
| OOS2 | out_of_scope | not_applicable | not_applicable | Passive CI waiting not replaced; triage handles observed failure evidence only. |
| OOS3 | out_of_scope | not_applicable | not_applicable | adv_run_test internals unchanged. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-54a15dd9f500 | AC2, AC3, AC5, C1, C2, C3, C5 | AC2, AC5 | DONT1, DONT3, DONT4, DONT5, OOS3 |  |
| tk-720c39d86e88 | AC2, AC3, AC5, C1, C2, C3, C5 | AC2, AC3, AC5 | DONT1, DONT2, DONT3, DONT4, OOS3 |  |
| tk-0a6e437d486d | AC1, AC2, AC3, AC5, AC6, C1, C2, C3, C4, C5 | AC1, AC2, AC3, AC5, AC6 | DONT1, DONT2, DONT3, DONT4, DONT5, OOS1, OOS2, OOS3 |  |
| tk-50b5e796c35a | AC1, AC2, AC3, AC4, AC5, AC6, SC1, SC2, SC3, SC4, C1, C2, C3, C4, C5 | AC1, AC3, AC4, AC6 | DONT1, DONT2, DONT3, DONT4, DONT5, OOS1, OOS2, OOS3 |  |
| tk-433339992033 |  | SC1, SC2, SC3, SC4, AC1, AC2, AC3, AC4, AC5, AC6, C1, C2, C3, C4, C5, DONT1, DONT2, DONT3, DONT4, DONT5 | OOS1, OOS2, OOS3 |  |
