# Contract Traceability

**Change ID:** tightenPreProposalCommands3
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-21T17:32:00.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Descriptions distinct: idea=Explore rough ideas; problem=Triage defects and unintended behavior; improve=Improvement analysis and research. |
| SC2 | success_criterion | pass | review | All 3 command files have **Persistence:** line in Command Boundary section. |
| SC3 | success_criterion | pass | review | /adv-improve exits table includes iterate row matching structural format. |
| AC1 | acceptance_criterion | pass | test | rg 'Triage issues before fixing' returns 0 matches across 5 mirror sites. |
| AC2 | acceptance_criterion | pass | test | rg 'Triage defects and unintended behavior' returns 5 matches. |
| AC3 | acceptance_criterion | pass | test | rg 'Suggest targeted improvements' returns 0 matches. |
| AC4 | acceptance_criterion | pass | test | rg 'Improvement analysis and research' returns 5 matches. |
| AC5 | acceptance_criterion | pass | test | /adv-improve.md exits table contains iterate row. |
| AC6 | acceptance_criterion | pass | test | All 3 command files contain Persistence line in Command Boundary. |
| AC7 | acceptance_criterion | pass | test | pnpm run check exits 0. All checks green. |
| C1 | constraint | respected | static_check | No runtime code changes; only markdown + manifest description strings. |
| C2 | constraint | respected | static_check | Description strings mirrored across all 5 sites per command. |
| C3 | constraint | respected | static_check | 'unintended behavior' covers perf/UX; 'defects' preserved per rq-defectOriginRca01. |
| C4 | constraint | respected | static_check | ODQ1 resolved; routing table unchanged; no collision with /adv-research. |
| DONT1 | avoidance | respected | review | /adv-improve not split. |
| DONT2 | avoidance | respected | review | No new commands added. |
| DONT3 | avoidance | respected | review | No runtime behavior changes. |
| DONT4 | avoidance | respected | review | No spec deltas; rq-defectOriginRca01 rule text unchanged. |
| OOS1 | out_of_scope | missing | not_applicable |  |
| OOS2 | out_of_scope | missing | not_applicable |  |
| OOS3 | out_of_scope | missing | not_applicable |  |
| OOS4 | out_of_scope | missing | not_applicable |  |
| OOS5 | out_of_scope | missing | not_applicable |  |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-9ae9f7459bdb | AC7 | AC1, AC2, AC3, AC4, AC5, AC6, SC1, SC2, SC3 |  |  |
| tk-740f369071cc | AC1, AC2, AC6 |  | C1, C2, C3, DONT3, DONT4 |  |
| tk-ee3a586c795c | AC3, AC4, AC5, AC6 |  | C1, C2, C4, DONT1, DONT3, DONT4 |  |
| tk-9d1b71d5dbe2 | AC6 |  | DONT3, DONT4 |  |
