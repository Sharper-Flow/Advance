# Contract Traceability

**Change ID:** fixLoopLedgerRegressions
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-10T20:23:25.400Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Reviewer READY; exact subagent-reports requirement and version expectations match spec 1.7.1. |
| SC2 | success_criterion | pass | review | Archive review: bundleJsonStringify owns one newline at all bundle JSON writes and recovery sidecar. |
| SC3 | success_criterion | pass | review | Reviewer confirmed types-layer ownership and all seven consumers migrated without temporal re-export. |
| SC4 | success_criterion | pass | review | Full run tr_mrfdmm62_42afd5bd has only two documented unrelated advance-workflow pin failures; reviewer confirmed parent/diff proof. |
| AC1 | acceptance_criterion | pass | test | Task tk-5160f317f1cc deterministic spec-ID equality check and reviewer focused suite pass. |
| AC2 | acceptance_criterion | pass | test | Task tk-5160f317f1cc exact version check; diff preserves unrelated advance-workflow expectation. |
| AC3 | acceptance_criterion | pass | test | Task tk-38e52641f17a archive and recovery tests pass; 39/39 full files. |
| AC4 | acceptance_criterion | pass | test | Task tk-a02e7b6694d8: 53 helper tests, 71 boundary/purity/consumer tests, and typecheck pass. |
| AC5 | acceptance_criterion | pass | test | Task tk-a02e7b6694d8 loop-ledger purity and existing behavior suite pass; reviewer confirmed no behavior change. |
| AC6 | acceptance_criterion | pass | test | git diff --check trunk...HEAD exits clean; reviewer confirmed. |
| AC7 | acceptance_criterion | pass | test | Full run tr_mrfdmm62_42afd5bd: only two unchanged advance-workflow 1.26.0 pins fail; reviewer verified unrelated. |
| C1 | constraint | respected | static_check | Four format-pinning tests preserve exact subagentReportKey output; reviewer confirmed. |
| C2 | constraint | respected | static_check | Dedicated archive serialization helper controls newline at archive and recovery write boundaries. |
| C3 | constraint | respected | static_check | Parent addLoopLedger archive was not changed; diff is limited to forward generation and tests. |
| C4 | constraint | respected | static_check | Reviewer found no task/gate/retry authority changes. |
| DONT1 | avoidance | respected | review | Unrelated advance-workflow 1.26.0 pins remain; only subagent-reports 1.6.0→1.7.1 assertion changed. |
| DONT2 | avoidance | respected | review | No temporal/contracts re-export remains; all seven consumers use types/subagent-reports. |
| DONT3 | avoidance | respected | review | Review confirmed changes are limited to deterministic archive bundle JSON newlines. |
| OOS1 | out_of_scope | not_applicable | not_applicable | No new loop-ledger feature or retry behavior was introduced. |
| OOS2 | out_of_scope | not_applicable | not_applicable | Only evidence-backed subagent-report asset repairs were made. |
| OOS3 | out_of_scope | not_applicable | not_applicable | Historical parent archive bundle was not rewritten. |
| OOS4 | out_of_scope | not_applicable | not_applicable | Unrelated advance-workflow and other asset cleanup was left unchanged. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-5160f317f1cc | SC1, AC1, AC2 | AC1, AC2 | DONT1, OOS2, OOS4 |  |
| tk-38e52641f17a | SC2, AC3 | AC3 | C2, C3, DONT3 |  |
| tk-a02e7b6694d8 | SC3, AC4, AC5 | AC4, AC5 | C1, C4, DONT2, OOS1 |  |
| tk-550e9ea0c687 | SC4, AC6, AC7 | AC6, AC7 | C1, C2, C3, C4, DONT1, DONT2, DONT3, OOS1, OOS2, OOS3, OOS4 |  |
