# Acceptance

Reviewed at: 2026-07-16T01:27:05.423Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| AC1 | acceptance_criterion | **AC1** Audit: every test that starts a `TestWorkflowEnvironment` (`createLocal`/`createTimeSkipping`) routes through `withTestWorkflowEnvironment` (or an equivalent finally-guaranteed teardown); violators refactored. | pass | Named helper wrappers own construction; structural checker rejects raw constructors outside helper. Checker review and 15 focused tests pass. |
| AC2 | acceptance_criterion | **AC2** `withTestWorkflowEnvironment` teardown is proven to run on test failure/timeout (finally-guaranteed), not only on success. | pass | Throw and AbortSignal timeout paths prove finally teardown; helper regression passes 11 tests plus 1 expected-fail timeout observer. |
| AC3 | acceptance_criterion | **AC3** `bin/oc-test` gains a pre/post sweep that kills orphaned processes matching the `temporal-test-server-sdk-*` arg pattern, PID- and arg-verified to exclude `temporal server start-dev` / port 7233. | pass | Identity-verified stale-only reaper is wired in bin/oc-test; 14 focused reaper tests pass. |
| AC4 | acceptance_criterion | **AC4** Reaper is bounded: only processes provably outside/older than the active run window are killed; concurrent peer test runs are not disrupted. | pass | 7200-second stale-only bound and real fresh-peer protection verified; no broad sweep. |
| AC5 | acceptance_criterion | **AC5** An induced mid-test failure leaves no `/tmp/temporal-test-server-*` residue after the suite. | pass | Real TestWorkflowEnvironment residue test passes 2/2: induced failure finalizes a real server; crash orphan is reaped by bounded next sweep while fresh real peer and start-dev/7233-shaped process remain untouched (tr_mrmto5l2_4b8ea19a). |
| C1 | constraint | Reaper matches only the test-server binary pattern, never the dev server. Safe under concurrent peer test runs. | respected | Same UID, exact basename, age bound, identity revalidation, and start-dev/7233 exclusions reviewed as READY. |
| DONT1 | avoidance | No blind `pkill temporal`. No teardown that assumes clean exit only. | respected | No blind pkill or ps|grep; unknown identity skips destructive action. |
| OOS1 | out_of_scope | The stale worker-bundle hazard (change `autoRollStaleWorkerBundle`). SQLite→Postgres backend. | not_applicable | Worker-bundle hazard and Postgres backend remain excluded. |

