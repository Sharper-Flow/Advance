# Acceptance

Reviewed at: 2026-07-29T23:47:48.721Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | For reviewers, I need contract items presented by purpose and outcome, so that full-set review is faster and more reliable. | pass | Review confirmed variant-aware briefing/review guidance. |
| SC2 | success_criterion | For ADV agents, I need each criterion’s context, required result, boundary, and proof route to be unambiguous, so that implementation and review stay aligned. | pass | Reviewer confirmed structured context/outcome rendering. |
| SC3 | success_criterion | For maintainers, I need existing acceptance contracts to remain readable and traceable, so that structured criteria do not disrupt active or historical work. | pass | Legacy projection/schema compatibility tests pass. |
| SC4 | success_criterion | For release and review workflows, I need warrants, evidence policies, and contract coverage preserved, so that readability does not weaken enforcement. | pass | Warrant and authority regressions pass. |
| AC1 | acceptance_criterion | Given an approved criterion classified as behavioral, evidence, spec-law, or constraint, when its agreement is minted, then the contract preserves a typed optional variant annotation while retaining canonical text and stable contract ID. | pass | Mint/schema tests; smoke pass. |
| AC2 | acceptance_criterion | Given a behavioral criterion uses structured language, when it is rendered for review or an agent briefing, then its context, trigger, required outcome, and follow-on boundaries are visibly distinguishable. | pass | Renderer tests and reviewer 21-test pass. |
| AC3 | acceptance_criterion | Given an existing flat-text contract, when it is read, rendered, or reviewed after the change, then it remains usable without manual rewrite and preserves its current effective contract content. | pass | Compatibility tests pass. |
| AC4 | acceptance_criterion | Given a criterion contains a valid bracketed warrant, when it is minted or represented in a structured variant, then its warrant is retained and validated through the current structural path. | pass | Warrant boundary tests pass. |
| AC5 | acceptance_criterion | Given structured input is malformed or unsupported, when minting or updating is attempted, then ADV returns a clear validation result and leaves the previously valid contract unchanged. | pass | Malformed-input atomic rejection tests pass. |
| AC6 | acceptance_criterion | Given a structured criterion is included in an agent briefing or reviewer-facing contract view, when the item is rendered, then its variant and canonical obligation are both visible without inventing a second authoritative representation. | pass | Briefing renderer tests pass. |
| AC7 | acceptance_criterion | Given criteria use any supported variant, when task coverage and review-matrix completeness are evaluated, then existing ID-based traceability and evidence-policy behavior remain unchanged. | pass | 25 authority invariant regressions pass. |
| AC8 | acceptance_criterion | Given the public change schema is generated after the change, when legacy contract data is validated, then existing valid contracts remain schema-compatible. | pass | Generated schema compatibility tests pass. |
| C1 | constraint | The variant annotation is additive and canonical text remains the compatibility anchor. | respected | Canonical text remains compatibility projection. |
| C2 | constraint | Syntax validity must not be treated as behavioral proof. | respected | Variant presentation has no acceptance authority. |
| C3 | constraint | Structured input validation must not silently discard warrants, weaken evidence requirements, or partially overwrite an existing valid contract. | respected | Mint rejects before persistence; warrants retained. |
| DONT1 | avoidance | Do not add Cucumber, step definitions, or a test-framework dependency. | respected | No Cucumber or test framework added. |
| DONT2 | avoidance | Do not silently strip or bypass warrants, evidence obligations, or contract IDs. | respected | Structural warrants and IDs preserved by regression tests. |
| DONT3 | avoidance | Do not require every criterion to use a behavioral scenario variant. | respected | Evidence/spec-law/constraint variants documented. |
| OOS1 | out_of_scope | Do not bulk-rewrite unrelated active changes solely to adopt the new style. | not_applicable | No unrelated active changes rewritten. |
| OOS2 | out_of_scope | Do not replace existing task traceability, review-matrix, or acceptance-gate mechanisms. | respected | Existing gate/review mechanisms retained; variant-blind tests pass. |

