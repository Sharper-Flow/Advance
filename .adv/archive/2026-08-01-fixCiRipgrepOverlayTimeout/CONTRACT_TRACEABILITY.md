# Contract Traceability

**Change ID:** fixCiRipgrepOverlayTimeout
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-08-01T17:46:18.518Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | tr_ms9akj8t_bfe348f9; CI |
| SC2 | success_criterion | pass | review | CI and READY review |
| SC3 | success_criterion | pass | review | spec-delta tests |
| SC4 | success_criterion | pass | review | #351; CI |
| AC1 | acceptance_criterion | pass | test | tr_ms9akj8t_bfe348f9 |
| AC2 | acceptance_criterion | pass | test | tr_ms9akj8t_bfe348f9 |
| AC3 | acceptance_criterion | pass | test | tr_ms9chb10_1e390350 |
| AC4 | acceptance_criterion | pass | test | tr_ms9ecqvi_29b34884 |
| AC5 | acceptance_criterion | pass | test | tr_ms9f4ho8_bdeed792 |
| AC6 | acceptance_criterion | pass | test | tr_msamtk86_d4f08c01 |
| AC7 | acceptance_criterion | pass | test | plugin check passed |
| AC8 | acceptance_criterion | pass | test | CI plus classified host exception |
| AC9 | acceptance_criterion | pass | test | PR #355 6/6 |
| AC10 | acceptance_criterion | pass | test | spec-delta tests |
| AC11 | acceptance_criterion | pass | test | CI assets |
| AC12 | acceptance_criterion | pass | test | CI assets |
| AC13 | acceptance_criterion | pass | test | #351; PR #355 |
| C1 | constraint | respected | static_check | READY review |
| C2 | constraint | respected | static_check | Node scan |
| C3 | constraint | respected | static_check | AST unchanged |
| C4 | constraint | respected | static_check | fixture tests |
| C5 | constraint | respected | static_check | call-count tests |
| C6 | constraint | respected | static_check | worktree review |
| C7 | constraint | respected | static_check | recorded rationale |
| C8 | constraint | respected | static_check | single-writer tests |
| C9 | constraint | respected | static_check | #351 readiness |
| OOS1 | out_of_scope | respected | not_applicable | no CI package |
| OOS2 | out_of_scope | respected | not_applicable | no timeout rise |
| OOS3 | out_of_scope | respected | not_applicable | no suppression |
| OOS4 | out_of_scope | respected | not_applicable | no gate change |
| OOS5 | out_of_scope | respected | not_applicable | no worktree deploy |
| OOS6 | out_of_scope | respected | not_applicable | PR CI |
| OOS7 | out_of_scope | respected | not_applicable | not repaired |
| OOS8 | out_of_scope | respected | not_applicable | bounded storage change |
| OOS9 | out_of_scope | respected | not_applicable | CLI action retained |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-a0c664ac1634 | SC1, AC1, AC2 |  | C1, C2, C3, C6 |  |
| tk-b1038b91b33e | AC3, AC4 |  | C1, C4, C6 |  |
| tk-b7b238ba6de0 | AC5, AC6 |  | C1, C5, OOS3, OOS4 |  |
| tk-049015a57f1e | AC3, AC4 |  | C1, C4, C6 |  |
| tk-b861747859d4 |  | AC7, AC8 | C1, OOS2 |  |
| tk-c12b59bf807d |  | AC9 | C6, OOS6 |  |
| tk-97f722d22eca | AC10, SC3 |  | C1, C8, OOS8 |  |
| tk-27f928ca2303 | AC11, AC12 |  | C1, C7 |  |
| tk-91a45a3832d1 | AC13 |  | C1, C6, C9 |  |
