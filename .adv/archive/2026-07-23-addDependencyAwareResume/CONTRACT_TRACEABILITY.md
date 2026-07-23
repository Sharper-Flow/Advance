# Contract Traceability

**Change ID:** addDependencyAwareResume
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-23T06:55:10.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Live projection call, status, and CLI tests pass. |
| SC2 | success_criterion | pass | review | D3 integration covers all edge ingresses. |
| SC3 | success_criterion | pass | review | Create/promote-only enforcement is pinned. |
| SC4 | success_criterion | pass | review | Cross-Epic redirect tests pass. |
| SC5 | success_criterion | pass | review | Legacy no-edge corpus parses with defaults. |
| AC1 | acceptance_criterion | pass | test | Schema/default and legacy parse tests pass. |
| AC2 | acceptance_criterion | pass | test | Iterative closed-path cycle and scale tests pass. |
| AC3 | acceptance_criterion | pass | test | Behavioral ingress validation tests pass. |
| AC4 | acceptance_criterion | pass | test | Typed nonterminal blocks pass. |
| AC5 | acceptance_criterion | pass | test | Active paths remain free of dependency-shift gate blocks. |
| AC6 | acceptance_criterion | pass | test | Current-session tool call returns typed projection within budget. |
| AC7 | acceptance_criterion | pass | test | Cross-Epic redirects verified. |
| AC8 | acceptance_criterion | pass | test | Pure kernel and read-only tool behavior verified. |
| AC9 | acceptance_criterion | pass | test | Status and command consumers verified. |
| AC10 | acceptance_criterion | pass | test | Existing bin surfaces consume projection. |
| AC11 | acceptance_criterion | pass | test | Local advisory skips blocked entries; external ordered_next is full authority. |
| AC12 | acceptance_criterion | pass | test | Parity passes; bl-jernU-SM archived. |
| AC13 | acceptance_criterion | pass | test | 149 targeted tests cover reproduction cases. |
| AC14 | acceptance_criterion | pass | test | No new mutation verbs; tool is pure-read orchestrator. |
| C1 | constraint | respected | static_check | Additive defaults only. |
| C2 | constraint | respected | static_check | Shared iterative Kahn/DFS helper. |
| C3 | constraint | respected | static_check | D3 boundary integration passes. |
| C4 | constraint | respected | static_check | External advisory behavior unchanged. |
| C5 | constraint | respected | static_check | No force override. |
| C6 | constraint | respected | static_check | Canonical node dedup verified. |
| C7 | constraint | respected | static_check | No future-work context changes. |
| C8 | constraint | respected | static_check | Current-project scope retained. |
| C9 | constraint | respected | static_check | next_entry_id advisory retained. |
| DONT1 | avoidance | respected | review | Dedicated WorkNodeRef fields used. |
| DONT2 | avoidance | respected | review | No force override. |
| DONT3 | avoidance | respected | review | Hard promotion/create blocks proven. |
| DONT4 | avoidance | respected | review | No gate/archive dependency enforcement. |
| DONT5 | avoidance | respected | review | Node-owned edges and derived reverse view. |
| DONT6 | avoidance | respected | review | Lifecycle models remain separate. |
| DONT7 | avoidance | respected | review | next_entry_id remains populated. |
| DONT8 | avoidance | respected | review | No new CLI next verb. |
| DONT9 | avoidance | respected | review | Tool class is orchestrator. |
| OOS1 | out_of_scope | missing | not_applicable |  |
| OOS2 | out_of_scope | missing | not_applicable |  |
| OOS3 | out_of_scope | missing | not_applicable |  |
| OOS4 | out_of_scope | missing | not_applicable |  |
| OOS5 | out_of_scope | missing | not_applicable |  |
| OOS6 | out_of_scope | missing | not_applicable |  |
| OOS7 | out_of_scope | missing | not_applicable |  |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-d1246b5f32df | AC1, SC5, C1 | AC1 | DONT1, DONT5 |  |
| tk-987accd4bcdc | AC2, C2 | AC2 | DONT5 |  |
| tk-022bfcae63fa | AC2, AC3, SC2 | AC2, AC3 | DONT5 |  |
| tk-7e0d5e6a88a8 | AC6, AC7, AC8, SC1, SC4 | AC6, AC7, AC8 |  |  |
| tk-36f62ece8c6d | AC11, AC12, C9 | AC11, AC12 | DONT7 |  |
| tk-6957fc2f02a3 | AC9, AC10, SC1 |  | AC14, C8, DONT8 |  |
| tk-b18d8cf11400 | AC3, AC4, AC5, SC2, SC3, C3, C5, C6 | AC3, AC4, AC5 | DONT1, DONT2, DONT4 |  |
| tk-b0d12b8b84a1 |  | AC6, AC13, AC14, SC2, SC3 | C1, C2, C3, C5 |  |
