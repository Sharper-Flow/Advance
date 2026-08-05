# Contract Traceability

**Change ID:** clampDoomLoopAccumulator
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-08-04T23:34:02.137Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | change-state.test.ts 'error_recovery retry-budget clamp' suite: 4+ blocked reports leave attempts[] bounded to max_retries and ErrorRecoverySchema.safeParse succeeds. Pre-fix the same assertions failed (RED runId tr_msf60ua8_41995156). Full unit suite 8480 passed. |
| SC2 | success_criterion | pass | review | replay-determinism.test.ts 'retry-budget overflow self-heals': five committed production histories carrying 7-24 subagentReportSubmitted signals replay cleanly through the clamped reducer (temporal 90/90), and the reducer re-derives schema-valid error_recovery from over-budget input. |
| SC3 | success_criterion | pass | review | tool-formatters.test.ts 'clamped retry budget' confirms inDoomLoop true and the [ADV:BLOCKED] banner still renders at the cap. All escalation predicates verified as >= against DOOM_LOOP_THRESHOLD 3, matching SUBAGENT_REPORT_MAX_RETRIES. |
| AC1 | acceptance_criterion | pass | test | change-state.ts applySubagentReportSubmittedToState: retry_count = retained length, attempts = recordedAttempts.slice(-maxRetries), each entry keeping its own attempt_number. Tests assert bounded length, most-recent retention, preserved attempt_number sequence [3,4,5], and schema validity. |
| AC2 | acceptance_criterion | pass | test | Worker.runReplayHistory over unchanged pre-clamp histories resolves without nondeterminism error (assertion 1), and the reducer applied to over-budget input yields ErrorRecoverySchema-valid state (assertion 2). adv-verifier independently confirmed no worker-bundle boundary violation and no nondeterministic primitives. |
| AC3 | acceptance_criterion | pass | test | tool-formatters.test.ts asserts escalation fires with retry_count exactly at the cap and that the banner reports the true attempt count. Escalation predicates confirmed >= at tool-formatters.ts, events/status.ts (x2), context-snapshot.ts. |
| AC4 | acceptance_criterion | pass | test | SUBAGENT_REPORT_MAX_RETRIES exported from types/subagent-reports.ts and consumed at both former hardcode sites. Guard test asserts max_retries resolves to the shared constant and that no bare 'max_retries: <digit>' literal remains in change-state.ts or subagent-report.ts. |
| C1 | constraint | respected | static_check | temporal project 90/90 including the full replay-determinism suite over five committed production histories. adv-verifier confirmed the new reducer path is pure arithmetic with no Date.now, Math.random, or host I/O, and that workflows.ts's new import reaches only zod and sibling type modules. |
| C2 | constraint | respected | static_check | No validation was added at the taskUpdated write boundary. Planned task tk-187b0b2a8edd was cancelled with user approval because in-flight change fixTaskUpdatePersistence already implements ErrorRecoverySchema.safeParse there. Full TaskSchema validation was not reintroduced. |
| C3 | constraint | respected | static_check | Each retained attempt keeps its true attempt_number (asserted as [3,4,5], explicitly not renumbered to [1,2,3]). Review round strengthened this: total_attempts is now recorded so the count survives elision, and wisdom-draft discloses elided attempts rather than dropping them. |
| C4 | constraint | respected | static_check | Both assertions exist and are independent: replay command-safety via Worker.runReplayHistory, and read-path schema validity via ErrorRecoverySchema.safeParse on reducer output. The replay suite includes a guard asserting fixtures still exceed the budget, so trimming them cannot silently drop overflow coverage. |
| DONT1 | avoidance | respected | review | The clamp lives in applySubagentReportSubmittedToState, the reducer replay executes. Not relocated to the tool boundary or the schema normalizer, and the spec delta records why in durable law. |
| DONT2 | avoidance | respected | review | SUBAGENT_REPORT_MAX_RETRIES remains 3; DOOM_LOOP_THRESHOLD remains 3. No threshold value changed. The change makes the budget enforceable, not different. |
| DONT3 | avoidance | respected | review | Doom-loop detection semantics are unchanged: predicates, threshold, and the inDoomLoop condition are untouched. Only the reported attempt count was corrected to stop under-reporting. |
| DONT4 | avoidance | respected | review | No operator repair tool was added. Self-heal was proven by the two assertions, so the conditional the avoidance describes was never triggered. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-cbacac2f2659 | AC1 | SC1 | C3, DONT2 |  |
| tk-42a6bc88cba6 | AC1 | SC1 | C3, DONT1, DONT2, DONT3 |  |
| tk-80adf9566bfa | AC4 | SC1 | C4, DONT2 |  |
| tk-c0e4b16123ac | AC2 | SC2 | C1, C4, DONT1 |  |
| tk-e01d69110f0b | AC3 | SC3 | DONT3 |  |
| tk-187b0b2a8edd | AC1 | SC1 | C1, C2, DONT1 |  |
| tk-4db168229b5d | AC1, AC2 | SC1, SC2 | DONT2, DONT3 |  |
