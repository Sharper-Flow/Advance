# Contract Traceability

**Change ID:** addDelegationMatrix
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-05-22T07:29:53.051Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | delegation-matrix.test.ts validates 9 workflow-step matrix entries; independent reviewer confirmed count |
| SC2 | success_criterion | pass | review | adv-review.md and adv-harden.md remediation routing aligned to spec; adv-instructions-assets.test.ts enforces alignment |
| SC3 | success_criterion | pass | review | ADV_INSTRUCTIONS.md explicitly distinguishes source plane from runtime field plane; field agents not required to inspect repo-local spec |
| AC1 | acceptance_criterion | pass | test | delegation-matrix.test.ts asserts exactly 9 entries; spec.json inspected by reviewer — 9 entries, no utility-command rows |
| AC2 | acceptance_criterion | pass | test | delegation-matrix.test.ts validates mode, gate_affinity, inline_boundaries, allowed_subagents per entry |
| AC3 | acceptance_criterion | pass | test | delegation-matrix.test.ts asserts delegable rows have delegated_substeps and allowed_subagents |
| AC4 | acceptance_criterion | pass | test | Command files updated to route through matrix-aligned sub-agents; no field-agent spec lookup required |
| AC5 | acceptance_criterion | pass | test | phantom-subagent-roster.test.ts fails on phantom or primary agents in sub-agent routing |
| AC6 | acceptance_criterion | pass | test | delegation-matrix.test.ts fails if command contracts contradict inline-required or hybrid classifications |
| AC7 | acceptance_criterion | pass | test | 193 focused tests pass; pnpm run check (typecheck, lint, format) passes clean |
| C1 | constraint | respected | static_check | Matrix lives in .adv/specs/delegation-defaults/spec.json as spec law |
| C2 | constraint | respected | static_check | Two-plane model maintained: source spec + deployed runtime guidance distinct |
| C3 | constraint | respected | static_check | delegation-matrix.test.ts rejects utility-command entries in matrix |
| C4 | constraint | respected | static_check | No broad runtime/schema refactor performed; only alignment changes |
| C5 | constraint | respected | static_check | Minimal test hardening: concrete-gap tests added for review/harden remediation; no speculative expansion |
| C6 | constraint | respected | static_check | Task-level delegation_hint/delegate_preferred clarified in prose only; no schema refactor |
| DONT1 | avoidance | respected | review | No downstream runtime spec lookup dependency introduced |
| DONT2 | avoidance | respected | review | No broad task-metadata schema changes |
| DONT3 | avoidance | respected | review | No utility-command matrix entries added |
| DONT4 | avoidance | respected | review | No ad-hoc remediation workers outside matrix-declared sub-agents |
| DONT5 | avoidance | respected | review | No speculative test expansion beyond concrete-gap coverage |
| DONT6 | avoidance | respected | review | No changes to core ADV gate machinery or Temporal workflows |
| OOS1 | out_of_scope | not_applicable | not_applicable | Runtime delegation dispatcher not touched |
| OOS2 | out_of_scope | not_applicable | not_applicable | Plugin tool schema not changed |
| OOS3 | out_of_scope | not_applicable | not_applicable | No new sub-agent profiles created |
| OOS4 | out_of_scope | not_applicable | not_applicable | No CI/CD pipeline changes |
| OOS5 | out_of_scope | not_applicable | not_applicable | No external dependency additions |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-2e48a195c243 | SC1, SC3, AC1, AC2, AC3, C1 | AC1, AC2, AC3, AC6 | C2, C3, C4, DONT1, DONT2, DONT3, DONT6, OOS1, OOS3, OOS4 |  |
| tk-14161adacc2e | SC2, AC4, C5 | AC4, AC5, AC6 | C2, C3, C4, DONT1, DONT2, DONT4, DONT5, DONT6, OOS1, OOS2, OOS3, OOS4, OOS5 |  |
| tk-eff8128f2c46 | SC2, AC4, C5, C6 | AC4, AC5, AC7 | C2, C3, C4, DONT1, DONT2, DONT4, DONT5, DONT6, OOS1, OOS2, OOS3, OOS4, OOS5 |  |
| tk-9be1d89990c5 |  | SC1, SC2, SC3, AC1, AC2, AC3, AC4, AC5, AC6, AC7, C1, C2, C3, C4, C5, C6 | DONT1, DONT2, DONT3, DONT4, DONT5, DONT6, OOS1, OOS2, OOS3, OOS4, OOS5 |  |
