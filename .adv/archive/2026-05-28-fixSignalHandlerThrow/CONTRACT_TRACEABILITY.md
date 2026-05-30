# Contract Traceability

**Change ID:** fixSignalHandlerThrow
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-05-28T21:35:22.347Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | docs/adr/0003-signal-handlers-must-not-throw.md added; reviewer verdict READY; AC1 reviewed item-by-item. |
| AC2 | acceptance_criterion | pass | test | pnpm test passed; pnpm run check passed. contracts.ts defines SignalRejection plus optional signal_rejections and signal_rejections_total fields. |
| AC3 | acceptance_criterion | pass | test | change-state.signal-rejection.test.ts passed; pnpm test passed. applySignalRejectionToState caps buffer, increments total, stores digest, updates lastSignalAt. |
| AC4 | acceptance_criterion | pass | test | workflows.signal-handlers.test.ts passed; structural test and runtime rejection test cover signalMutation/signalAsync behavior. pnpm test/check/build passed. |
| AC5 | acceptance_criterion | pass | test | workflows.signal-handlers.test.ts structural guard passed; grep found no safeUpdateHandler/ApplicationFailure.nonRetryable in workflows.ts; reviewer READY. |
| AC6 | acceptance_criterion | pass | test | RED test added then GREEN: signal rejection test passed in workflows.signal-handlers.test.ts; full pnpm test passed. |
| AC7 | acceptance_criterion | pass | test | Structural test in workflows.signal-handlers.test.ts passed, requiring setHandler signal blocks to use signalMutation or signalAsync and forbidding safeUpdateHandler. |
| AC8 | acceptance_criterion | pass | test | Targeted bundle/replay verification passed: workflow-bundle-boundary.test.ts and replay-determinism.test.ts; pnpm test passed. |
| AC9 | acceptance_criterion | pass | test | Final verification passed: pnpm test, pnpm run check, pnpm run build. |
| C1 | constraint | respected | static_check | All implementation ran in /home/jon/.local/share/opencode/worktree/.../change/fixSignalHandlerThrow on branch change/fixSignalHandlerThrow; git status clean. |
| C2 | constraint | respected | static_check | replay-determinism.test.ts passed; digest.ts uses sorted JSON + pure-JS FNV-1a; no node:crypto import; fields optional in contracts.ts. |
| C3 | constraint | respected | static_check | change-state.signal-rejection.test.ts asserts 20-entry FIFO and cumulative total counter. |
| C4 | constraint | respected | static_check | No spec deltas added; signal names/gate semantics unchanged; reviewer READY; full tests passed. |
| C5 | constraint | respected | static_check | RED evidence captured before implementation: workflows.signal-handlers.test.ts exited 1 due to safeUpdateHandler/missing rejection fields; then GREEN tests passed. |
| C6 | constraint | respected | static_check | SignalRejection type in contracts.ts, applySignalRejectionToState in change-state.ts, digest helper under temporal/; reviewer READY. |
| DONT1 | avoidance | respected | review | No wf.defineUpdate migration; workflows remains signal/query surface; workflow-bundle-boundary tests passed. |
| DONT2 | avoidance | respected | review | Structural test forbids safeUpdateHandler; grep found no ApplicationFailure.nonRetryable in workflows.ts; tests passed. |
| DONT3 | avoidance | respected | review | Digest/helper tests verify truncated sample; state-helper test asserts raw long payload not retained in signal_rejections. |
| DONT4 | avoidance | respected | review | signalAsync checks err instanceof wf.CancelledFailure || wf.TemporalFailure and rethrows; reviewer READY. |
| DONT5 | avoidance | respected | review | Touched scope limited to workflow wrapper/state/digest/tests, ADR, and stale asset-test expectation needed for full-suite verification. |
| OOS1 | out_of_scope | not_applicable | not_applicable | No signal-to-update migration performed. |
| OOS2 | out_of_scope | not_applicable | not_applicable | No new user-facing tool fields added beyond existing workflow state query surface. |
| OOS3 | out_of_scope | not_applicable | not_applicable | applyGateStuckToState and KD-8 Layer 2 size guard were referenced but not refactored. |
| OOS4 | out_of_scope | not_applicable | not_applicable | Worktree extraction, agenda migration, subagent-report migration, threshold consolidation, and gate-readiness source bug are separate follow-ups; critical gate-readiness bug recorded as ag-mgupBeWk. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-7b4beb7aef15 |  |  | C1 | Environment setup task; no logic-bearing code. |
| tk-1edb72b9c0f7 |  | AC6, AC7 | C5 |  |
| tk-191f40961390 | AC2, AC3 | AC2, AC3 | C2, C3, C6, DONT3, DONT4 |  |
| tk-a8d7918f7615 | AC4, AC5 | AC4, AC5, AC6, AC7 | DONT1, DONT2, DONT4, DONT5 |  |
| tk-1c03b3e38688 | AC1 | AC1 | C2, DONT1, DONT2, DONT3, DONT4 | Documentation-only task; verification by review/test. |
| tk-268748b49648 |  | AC8, AC9, AC1, AC2, AC3, AC4, AC5, AC6, AC7 | C1, C2, C3, C4, C5, C6, DONT1, DONT2, DONT3, DONT4, DONT5 |  |
| tk-d2dbb08687a3 | AC1, AC4, AC5 |  | C4, DONT5 | ADV agenda bookkeeping; verification is covered by implementation tasks. |
