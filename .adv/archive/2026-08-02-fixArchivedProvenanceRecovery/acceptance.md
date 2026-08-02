# Acceptance

Reviewed at: 2026-08-02T21:37:56.717Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | Required worker provenance blocks every release-completion route until valid. | pass | All required-provenance routes block when missing. |
| SC2 | success_criterion | Valid provenance permits normal and recovery release completion. | pass | Valid and not-applicable provenance routes pass. |
| SC3 | success_criterion | Existing archived pending-release records receive an audited typed recovery path. | pass | Terminal recovery is proof-bound and idempotent. |
| AC1 | acceptance_criterion | **AC1:** Release-pending archive entry rejects undeclared or invalid required worker provenance before terminal projection. | pass | Release-pending preflight blocks missing provenance. |
| AC2 | acceptance_criterion | **AC2:** Recovery/projection/shipped-rescue cannot write `release:done` without the same valid provenance required by normal completion. | pass | Recovery/rescue writers share provenance enforcement. |
| AC3 | acceptance_criterion | **AC3:** Git proof never substitutes for required worker-bundle provenance. | pass | Shipped rescue requires provenance plus Git proof. |
| AC4 | acceptance_criterion | **AC4:** `not_applicable` with rationale and `required` with valid replay/build proof complete successfully. | pass | Required-valid and not-applicable cases pass. |
| AC5 | acceptance_criterion | **AC5:** Typed archived release-pending recovery validates immutable proof and provenance without reopening scope. | pass | Archived pending recovery validates immutable proof. |
| AC6 | acceptance_criterion | **AC6:** Specs and regressions cover all release-completion routes. | pass | 232 targeted and 179 verification route tests pass; specs/schema updated. |
| C1 | constraint | Preserve replay-safe workflow gate behavior. | respected | Replay-safe normal workflow enforcement preserved. |
| C2 | constraint | Use durable projection state only for recovery evaluation. | respected | Recovery evaluates durable projection state only. |
| DONT1 | avoidance | Do not bypass or weaken release readiness. | respected | No release-readiness bypass. |
| DONT2 | avoidance | Do not manually edit archive bundles or workflow history. | respected | No archive bundle or workflow-history edits. |

