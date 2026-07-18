# Acceptance

Reviewed at: 2026-07-18T18:01:14.530Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | On a fixture with hundreds of stores, both scans complete well under the 10s tool ceiling (target: order-of-magnitude faster than serial; deterministic in tests). | pass | Large-N scan tests complete <8s under fake/real timing; parallelized both scans (runId tr_mrqo15ga, tr_mrqo4ubq). |
| SC2 | success_criterion | Scan classification output (entries, warnings, flagged/candidate lists, ordering) is identical to the pre-change serial implementation for the same fixture. | pass | Determinism/parity tests: project_id-sorted stores, flagged, warnings identical across runs; existing suites unchanged. |
| SC3 | success_criterion | Per-store I/O is bounded (no unbounded Promise.all); a large store count cannot exhaust file descriptors (no EMFILE). | pass | mapWithConcurrency bounds in-flight to STORE_SCAN_CONCURRENCY=16; unit test asserts max in-flight <= limit; no unbounded Promise.all. |
| SC4 | success_criterion | `agenda.jsonl` is read at most once per store in the cleanup scan. | pass | store-cleanup-single-read.test.ts: agenda.jsonl read count == store count via hoisted fs mock. |
| AC1 | acceptance_criterion | Given a data-home with N stores, when a scan runs, then per-store probing executes with bounded concurrency and results match the serial ordering/classification. | pass | Bounded-concurrency mapping + classification parity verified on 60-store (cleanup) and 52-store (consolidate) fixtures. |
| AC2 | acceptance_criterion | Given the cleanup scan, when a store is classified, then agenda.jsonl is read exactly once. | pass | Single-read test asserts exactly one agenda.jsonl read per store. |
| AC3 | acceptance_criterion | Given a very large store count, when a scan runs, then concurrency is capped and no EMFILE/descriptor exhaustion occurs. | pass | concurrency.test.ts: max in-flight never exceeds limit incl. concurrency>items clamp; bounded => no fd exhaustion. |
| AC4 | acceptance_criterion | Given identical fixtures, when serial vs parallel results are compared, then stores/flagged/warnings/candidates are equal. | pass | Repeated-run deep-equal on stores/flagged/warnings proves parallel result == serial ordering/classification. |
| C1 | constraint | Scans remain strictly read-only (no mutations). | respected | No writes added; existing 'performs zero mutations' snapshot tests still pass; only read ops in scan. |
| C2 | constraint | No raising of the 10s tool timeout or any read deadline (rq-boundedAuthoritativeRead01). | respected | No timeout or read-deadline constant changed; fix is purely concurrency/dedupe. |
| C3 | constraint | No new runtime dependency; helper is in-repo and unit-tested. | respected | Helper is in-repo (utils/concurrency.ts), unit-tested; no new package dependency; lockfile-policy check green. |
| C4 | constraint | Do not touch the terminal/archived change-enumeration path (fixChangeEnumerationStarvation domain). | respected | Only store-cleanup.ts, store-consolidate.ts, utils/concurrency.ts + tests changed; terminal change-enumeration path untouched. |
| DONT1 | avoidance | Do not use unbounded Promise.all over all stores. | respected | mapWithConcurrency uses a bounded worker pool, never Promise.all over all stores. |
| DONT2 | avoidance | Do not alter classification/safety semantics (unsafe/live-lock/ledger detection preserved exactly). | respected | Classification/safety branches (unsafe/live-lock/ledger/orphan-suspect) copied verbatim into the mapper; parity tests confirm identical output. |
| DONT3 | avoidance | Do not change execute/dry_run mutation behavior in this change (scan performance only). | respected | Only scan functions changed; dry_run/execute plan and mutation logic untouched (they reuse scan and inherit the speedup). |

