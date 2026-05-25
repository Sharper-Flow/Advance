# Acceptance

Reviewed at: 2026-05-21T06:16:20.483Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | Define a workflow-step delegation matrix for ADV. | pass | Spec .adv/specs/delegation-defaults/spec.json defines machine-readable delegation_matrix and requirements; delegation-matrix tests passed. |
| SC2 | success_criterion | Make safe evidence gathering, scans, research, remediation, and noisy verification sub-agent-primary where full inline context is not required. | pass | Matrix classifies discovery/harden scan-heavy work for sub-agents and keeps hybrid where inline synthesis is required; reviewer approved. |
| SC3 | success_criterion | Keep main ADV responsible for lifecycle synthesis, state mutation, gate completion, human checkpoints, drift/scope-expansion decisions, doom-loop recovery, and archive safety. | pass | Inline boundaries in delegation_matrix keep ADV-owned state/gate/checkpoint/safety decisions inline; tests reject primary/phantom agents. |
| SC4 | success_criterion | Add spec and regression-test coverage so delegation defaults cannot drift across command docs, orchestrator guidance, and provider hints. | pass | Spec added plus delegation-matrix and phantom roster regression tests; pnpm run check, targeted tests, and build passed. |
| AC1 | acceptance_criterion | Matrix covers proposal, discovery, design, prep, apply, review, harden, archive, and reflection. | pass | delegation_matrix rows cover proposal, discovery, design, prep, apply, review, harden, archive, reflect; test asserts exact coverage. |
| AC2 | acceptance_criterion | Each row declares one default mode: inline_required, subagent_primary, or hybrid. | pass | delegation-matrix.test.ts validates mode enum and expected assignments from spec. |
| AC3 | acceptance_criterion | Each row names allowed sub-agents and inline-only safety boundaries. | pass | delegation_matrix declares allowed_subagents and inline_boundaries; tests validate agent existence and inline boundary coverage. |
| AC4 | acceptance_criterion | Discovery/prep wide scans become sub-agent-primary or are explicitly justified as inline-required/hybrid. | pass | Discovery is hybrid with adv-researcher/explore for wide scans; prep is inline_required/full, matching command contract and explicit justification. |
| AC5 | acceptance_criterion | Structured worker reports include evidence refs, scope/design/task impact, blockers, and recommended next action. | pass | Spec rq-delDefaults05 requires worker reports with evidence refs, impact, blockers, and next action; reviewer report confirmed existing structured reports satisfy it. |
| AC6 | acceptance_criterion | Tests validate matrix row coverage and prevent phantom/primary agents from being used as sub-agents. | pass | delegation-matrix.test.ts and phantom-subagent-roster.test.ts validate matrix coverage and reject phantom/primary agents; targeted vitest: 34 passed. |
| C1 | constraint | No phase-owner role agents. | respected | Allowed subagents exclude primary/phase-owner agents; phantom roster tests pin PRIMARIES and pass. |
| C2 | constraint | No sub-agent ownership of gates, slash-command dispatch, human checkpoints, cancellation approval, archive sign-off, drift/scope-expansion decisions, or ADV orchestration state mutation. | respected | Inline boundaries reserve gate completion, human checkpoints, scope/drift decisions, and state mutation for main ADV. |
| C3 | constraint | No weakening TDD evidence, P23 post-delegation scan, due-diligence requirements, or archive finalization safety. | respected | ADV_INSTRUCTIONS retains TDD/P23/due-diligence/archive safety; reviewer found no weakening. |
| C4 | constraint | Coordinate with refactorAdvPrompt where prompt surfaces overlap. | respected | Design and agreement note refactorAdvPrompt overlap; current branch may require trunk conflict handling before release. |
| DONT1 | avoidance | Do not duplicate matrix prose across command files. | respected | Matrix source moved into spec delegation_matrix; command files are not duplicated with matrix prose. |
| DONT2 | avoidance | Do not rely on heuristic inference as the sole authority for delegation correctness. | respected | Correctness enforced by spec JSON and tests, not heuristic-only prose. |
| DONT3 | avoidance | Do not make a step sub-agent-primary before its worker output schema is structured enough for safe orchestration. | respected | Only harden is subagent_primary and uses adv-reviewer/explore structured reports; other steps remain inline/hybrid. |

