# Contract Traceability

**Change ID:** reapLeakedTestServers
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-16T01:27:05.423Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | Named helper wrappers own construction; structural checker rejects raw constructors outside helper. Checker review and 15 focused tests pass. |
| AC2 | acceptance_criterion | pass | test | Throw and AbortSignal timeout paths prove finally teardown; helper regression passes 11 tests plus 1 expected-fail timeout observer. |
| AC3 | acceptance_criterion | pass | test | Identity-verified stale-only reaper is wired in bin/oc-test; 14 focused reaper tests pass. |
| AC4 | acceptance_criterion | pass | test | 7200-second stale-only bound and real fresh-peer protection verified; no broad sweep. |
| AC5 | acceptance_criterion | pass | test | Real TestWorkflowEnvironment residue test passes 2/2: induced failure finalizes a real server; crash orphan is reaped by bounded next sweep while fresh real peer and start-dev/7233-shaped process remain untouched (tr_mrmto5l2_4b8ea19a). |
| C1 | constraint | respected | static_check | Same UID, exact basename, age bound, identity revalidation, and start-dev/7233 exclusions reviewed as READY. |
| DONT1 | avoidance | respected | review | No blind pkill or ps|grep; unknown identity skips destructive action. |
| OOS1 | out_of_scope | not_applicable | not_applicable | Worker-bundle hazard and Postgres backend remain excluded. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-f4c5dcf9fd0b | AC1 |  |  |  |
| tk-f6a98b1bdb31 | AC3, AC4 |  | C1 |  |
| tk-61f5c174090b | AC1 |  | DONT1 |  |
| tk-cade80b8af18 |  | AC2 |  |  |
| tk-ede520711667 |  | AC5, AC4 |  |  |
| tk-ba6633f4f897 |  | AC5, AC2 | C1 |  |
