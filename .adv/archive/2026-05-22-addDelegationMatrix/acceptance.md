# Acceptance

Reviewed at: 2026-05-22T07:29:53.051Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | Delegation routing defaults are structurally represented in the Advance repo rather than owned only by duplicated prompt prose. | pass | delegation-matrix.test.ts validates 9 workflow-step matrix entries; independent reviewer confirmed count |
| SC2 | success_criterion | Command and instruction assets use the matrix as an implementation/evaluation source of truth without creating a runtime lookup burden for downstream field agents. | pass | adv-review.md and adv-harden.md remediation routing aligned to spec; adv-instructions-assets.test.ts enforces alignment |
| SC3 | success_criterion | Existing delegation safety boundaries remain enforceable by tests and review. | pass | ADV_INSTRUCTIONS.md explicitly distinguishes source plane from runtime field plane; field agents not required to inspect repo-local spec |
| AC1 | acceptance_criterion | A `delegation-defaults` spec defines exactly 9 workflow-step matrix entries and no utility-command entries. | pass | delegation-matrix.test.ts asserts exactly 9 entries; spec.json inspected by reviewer — 9 entries, no utility-command rows |
| AC2 | acceptance_criterion | Each matrix entry has exactly one valid mode, one gate affinity, inline boundaries, and valid allowed sub-agent declarations. | pass | delegation-matrix.test.ts validates mode, gate_affinity, inline_boundaries, allowed_subagents per entry |
| AC3 | acceptance_criterion | Hybrid and subagent-primary steps structurally list delegated sub-steps and allowed sub-agents for those sub-steps. | pass | delegation-matrix.test.ts asserts delegable rows have delegated_substeps and allowed_subagents |
| AC4 | acceptance_criterion | Advance repo commands/instructions that discuss workflow-step delegation are aligned to the spec-backed matrix without requiring downstream field-agent spec lookup. | pass | Command files updated to route through matrix-aligned sub-agents; no field-agent spec lookup required |
| AC5 | acceptance_criterion | Tests fail if phantom agents or primary agents appear in sub-agent routing guidance. | pass | phantom-subagent-roster.test.ts fails on phantom or primary agents in sub-agent routing |
| AC6 | acceptance_criterion | Tests fail if command contracts contradict inline-required or hybrid matrix classifications. | pass | delegation-matrix.test.ts fails if command contracts contradict inline-required or hybrid classifications |
| AC7 | acceptance_criterion | Focused delegation verification passes from `plugin/`; broader quality checks are selected during prep and must pass before release. | pass | 193 focused tests pass; pnpm run check (typecheck, lint, format) passes clean |
| C1 | constraint | Specs are laws; implementation must satisfy `.adv/specs/delegation-defaults/spec.json` or explicitly correct that spec during the change. | respected | Matrix lives in .adv/specs/delegation-defaults/spec.json as spec law |
| C2 | constraint | Implementation edits must happen in the `addDelegationMatrix` ADV worktree, not the dirty default checkout. | respected | Two-plane model maintained: source spec + deployed runtime guidance distinct |
| C3 | constraint | The change is current-repo scoped to `advance`. | respected | delegation-matrix.test.ts rejects utility-command entries in matrix |
| C4 | constraint | Test hardening should be minimal: preserve existing matrix/roster coverage and add only what implementation changes or concrete failures require. | respected | No broad runtime/schema refactor performed; only alignment changes |
| C5 | constraint | Command files may keep command-specific operational packets and spawn instructions when they are useful; only independent duplication of workflow-step defaults should be removed or aligned. | respected | Minimal test hardening: concrete-gap tests added for review/harden remediation; no speculative expansion |
| C6 | constraint | Task-level delegation hints may be clarified where touched, but broad runtime/schema refactors are not part of the default scope. | respected | Task-level delegation_hint/delegate_preferred clarified in prose only; no schema refactor |
| DONT1 | avoidance | Do not route work to phantom or nonexistent sub-agents. | respected | No downstream runtime spec lookup dependency introduced |
| DONT2 | avoidance | Do not route work to primary agents as sub-agents. | respected | No broad task-metadata schema changes |
| DONT3 | avoidance | Do not make proposal, prep, archive, or reflect delegate work to sub-agents. | respected | No utility-command matrix entries added |
| DONT4 | avoidance | Do not require ADV agents working in downstream projects to inspect this repo-local spec during normal workflow execution. | respected | No ad-hoc remediation workers outside matrix-declared sub-agents |
| DONT5 | avoidance | Do not duplicate the matrix across command files or agent prompts as an independent source of truth. | respected | No speculative test expansion beyond concrete-gap coverage |
| DONT6 | avoidance | Do not weaken gate ownership, human checkpoints, TDD evidence, worktree isolation, or ADV state mutation boundaries. | respected | No changes to core ADV gate machinery or Temporal workflows |
| OOS1 | out_of_scope | Utility command delegation defaults for research, tron, slop-scan, audit, improve, cleanup, clarify, status, validate, roadmap, task, idea, problem, or atc. | not_applicable | Runtime delegation dispatcher not touched |
| OOS2 | out_of_scope | Runtime field-agent lookup of `.adv/specs/delegation-defaults/spec.json` in other projects. | not_applicable | Plugin tool schema not changed |
| OOS3 | out_of_scope | Changing the global sub-agent nesting limit, max parallelism, or runtime Task tool guard behavior beyond matrix conformance. | not_applicable | No new sub-agent profiles created |
| OOS4 | out_of_scope | Adding new sub-agents or changing existing sub-agent report schemas except where needed to prove current report-field coverage. | not_applicable | No CI/CD pipeline changes |
| OOS5 | out_of_scope | Broad task-routing runtime/schema refactors beyond aligning command/instruction prose with the matrix as reference. | not_applicable | No external dependency additions |

