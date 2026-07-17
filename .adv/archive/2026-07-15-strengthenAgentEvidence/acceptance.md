# Acceptance

Reviewed at: 2026-07-15T20:25:09.745Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| AC1 | acceptance_criterion | For a completed task whose `evidence_policy` is `test`, `static_check`, `review`, or `artifact_reference`, an unresolved `verification_missing` or `verification_mismatch` condition produces a typed acceptance-readiness blocker. The blocker clears only through a typed disposition or matching durable evidence. | pass | Typed readiness coverage plus final full suite (334 files/5,033 tests) prove unresolved proof-policy verification conditions block readiness. |
| AC2 | acceptance_criterion | A task with `source_citation`, `source_audit`, `rubric_review`, `stakeholder_acceptance`, `design_proof`, or `not_applicable` evidence policy remains non-blocking unless another existing rule blocks it. Existing in-flight changes have an explicit compatibility path; no silent grandfathering. | pass | Readiness policy tests preserve warn-first behavior for source/review/non-proof evidence policies. |
| AC3 | acceptance_criterion | On non-terminal `WorkflowNotFound` during typed researcher/validator report submission, the tool writes one deduplicated, authorized disk projection when recovery evidence permits; when it cannot, it returns a typed actionable failure and does not re-signal the same unreachable workflow. | pass | Recovery writer 23/23 durable test and 136-test independent review prove authorized idempotent recovery from authoritative archive projection. |
| AC4 | acceptance_criterion | For an `adv-researcher` report with sources, the engineer briefing packet renders at most 3 stable-order `research_citation` facts plus a deterministic omission marker when sources exceed the bound. It adds no adoption/usage telemetry. | pass | Briefing citation coverage included in prior structural suite; final full suite passed after remediation. |
| AC5 | acceptance_criterion | Packet-contract asset tests prove identity anchors remain strict and `TASK_SCOPE`, `IN_SCOPE`, `OUT_OF_SCOPE`, `DONE_WHEN`, `STOP_WHEN`, and `VERIFICATION` remain warn-first. | pass | Packet-contract asset coverage verified strict identity anchors and warn-first remaining anchors. |
| AC6 | acceptance_criterion | Before release, `fixChangeListTimeouts` is accepted/released and its bounded complete-or-explicitly-degraded terminal-read tests pass; this change adds no duplicate resolver/deadline implementation. | pass | fixChangeListTimeouts is archived; bounded read evidence remains covered by its archived acceptance/release proof. |
| SC1 | success_criterion | Acceptance cannot report full verification when required durable proof is absent. | pass | Independent acceptance reviewer READY; proof-policy enforcement reviewed and full suite passed. |
| SC2 | success_criterion | Unreachable report persistence has one deterministic recovery route or one typed failure route. | pass | Reviewer confirmed one authorized recovery route; archive-race fix preserves terminal projection and fails closed. |
| SC3 | success_criterion | Engineers receive bounded, typed research citations as implementation context without packet/adoption telemetry. | pass | Reviewer confirmed bounded research citation rendering and no telemetry. |
| SC4 | success_criterion | Existing valid non-code and source-based workflows do not regress. | pass | Full suite 334 files/5,033 tests and focused policy coverage preserve valid non-code workflows. |
| SC5 | success_criterion | Bounded archived-inclusive reads have a single owning implementation and tested release proof. | pass | Archived fixChangeListTimeouts provides bounded archived-inclusive read release proof; no duplicate resolver added. |
| C1 | constraint | No telemetry surfaces: no counters, dashboards, status metrics, adoption analytics, or tracking-only persistence. | respected | Reviewer and scoped diff found no telemetry surfaces; changes are validation/recovery only. |
| C2 | constraint | Use Zod schemas, typed state, deterministic validators, and tests; do not infer correctness from prose or missing counters. | respected | Zod/typed state plus deterministic regression tests and typed degraded validation response. |
| C3 | constraint | Preserve gate sequence, user approvals, and workflow-bundle boundaries. | respected | Gate sequence and approvals preserved; no workflow-bundle changes. |
| C4 | constraint | Keep report recovery idempotent, authorized, and secret-safe. | respected | Recovery loads authoritative bundle, deduplicates, and fails closed on invalid carriers. |
| C5 | constraint | Keep rendered research citations bounded and stable-order. | respected | Citation rendering remains bounded by existing tested packet behavior. |
| C6 | constraint | Keep public schema changes additive and regenerate/check schemas when required. | respected | pnpm run check passed; no public schema regression reported. |
| DONT1 | avoidance | No global hardening of warn-first packet anchors. | respected | No global hardening of warn-first packet anchors. |
| DONT2 | avoidance | No duplicate change-list deadline/resolver implementation. | respected | No duplicate change-list deadline/resolver implementation; validation uses existing local timeout helper. |
| DONT3 | avoidance | No hard block at report submission; readiness enforcement occurs at the appropriate gate. | respected | Report submission remains advisory; enforcement stays at readiness gates. |
| DONT4 | avoidance | No unbounded citation rendering or packet bloat. | respected | Bounded citation policy remains intact; no packet bloat added. |
| DONT5 | avoidance | No telemetry disguised as enforcement state. | respected | No telemetry disguised as enforcement state; reviewer confirmed. |

