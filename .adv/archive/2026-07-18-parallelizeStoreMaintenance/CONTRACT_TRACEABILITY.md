# Contract Traceability

**Change ID:** parallelizeStoreMaintenance
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-18T18:01:14.530Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Large-N scan tests complete <8s under fake/real timing; parallelized both scans (runId tr_mrqo15ga, tr_mrqo4ubq). |
| SC2 | success_criterion | pass | review | Determinism/parity tests: project_id-sorted stores, flagged, warnings identical across runs; existing suites unchanged. |
| SC3 | success_criterion | pass | review | mapWithConcurrency bounds in-flight to STORE_SCAN_CONCURRENCY=16; unit test asserts max in-flight <= limit; no unbounded Promise.all. |
| SC4 | success_criterion | pass | review | store-cleanup-single-read.test.ts: agenda.jsonl read count == store count via hoisted fs mock. |
| AC1 | acceptance_criterion | pass | test | Bounded-concurrency mapping + classification parity verified on 60-store (cleanup) and 52-store (consolidate) fixtures. |
| AC2 | acceptance_criterion | pass | test | Single-read test asserts exactly one agenda.jsonl read per store. |
| AC3 | acceptance_criterion | pass | test | concurrency.test.ts: max in-flight never exceeds limit incl. concurrency>items clamp; bounded => no fd exhaustion. |
| AC4 | acceptance_criterion | pass | test | Repeated-run deep-equal on stores/flagged/warnings proves parallel result == serial ordering/classification. |
| C1 | constraint | respected | static_check | No writes added; existing 'performs zero mutations' snapshot tests still pass; only read ops in scan. |
| C2 | constraint | respected | static_check | No timeout or read-deadline constant changed; fix is purely concurrency/dedupe. |
| C3 | constraint | respected | static_check | Helper is in-repo (utils/concurrency.ts), unit-tested; no new package dependency; lockfile-policy check green. |
| C4 | constraint | respected | static_check | Only store-cleanup.ts, store-consolidate.ts, utils/concurrency.ts + tests changed; terminal change-enumeration path untouched. |
| DONT1 | avoidance | respected | review | mapWithConcurrency uses a bounded worker pool, never Promise.all over all stores. |
| DONT2 | avoidance | respected | review | Classification/safety branches (unsafe/live-lock/ledger/orphan-suspect) copied verbatim into the mapper; parity tests confirm identical output. |
| DONT3 | avoidance | respected | review | Only scan functions changed; dry_run/execute plan and mutation logic untouched (they reuse scan and inherit the speedup). |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-88d63d3f80a2 | SC3, C3 | AC3 | DONT1 |  |
| tk-c97e4c91cf7d | SC1, SC2, SC4 | AC1, AC2, AC4 | C1, C2, DONT1, DONT2, DONT3 |  |
| tk-a9a9b4cb00e4 | SC1, SC2 | AC1, AC4 | C1, C4, DONT1, DONT2, DONT3 |  |
| tk-60aaaaa07c4f |  | SC1, SC2, SC3, SC4, AC1, AC2, AC3, AC4, C1, C2, C3, C4 |  |  |
