# Contract Traceability

**Change ID:** reapOrphanAdvWorkers
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-15T19:33:39.430Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Reviewer READY. Validated gRPC saturation codes (RESOURCE_EXHAUSTED/UNAVAILABLE/DEADLINE_EXCEEDED/ABORTED) classify transient→bounded retry; fatal fast-fails; arbitrary code & non-gRPC text not transient. retry-wrapper.test.ts 22/22. |
| SC2 | success_criterion | pass | review | Archive reads reacquire handle from getService() per attempt (runReacquiringChangeQuery); reviewer confirmed stale-handle fixed. archive-gate.test.ts 12/12. |
| SC3 | success_criterion | pass | review | gateCompletedSignal fired once; ambiguous transient failure → exactly one reconcile read → terminal already-done / non-terminal typed error, zero re-signals. Reviewer READY. |
| SC4 | success_criterion | pass | review | reinitStsl fires only on isReconnectableError (transport failures); saturation codes retry-not-reconnect (hardened fd04293c to ignore transport-looking details text on validated saturation codes). Bounded by aggregate deadline. |
| AC1 | acceptance_criterion | pass | test | retry-wrapper.test.ts asserts each saturation class→transient retry, fatal fast-fail, isGrpcServiceError shape gate, cycle guard. 22/22 (tr_mrmfgqaq + harden). |
| AC2 | acceptance_criterion | pass | test | archive-gate.test.ts: attempt-2 handle provably from swapped client after transport failure; DEADLINE_EXCEEDED retries without reconnect. 12/12 (tr_mrmgy7uk). |
| AC3 | acceptance_criterion | pass | test | archive-gate.test.ts: ambiguous signal → one reconcile read, zero re-signals; terminal→already-done; non-terminal→classified error; completed-workflow recovery preserved. |
| AC4 | acceptance_criterion | pass | test | Regression coverage across allow/missing/mismatch(code vs text)/precedence/cycle/reacquire/reconcile paths. bin/oc-test targeted 195 passed (tr_mrmh20qs). |
| AC5 | acceptance_criterion | pass | test | pnpm run check passed (schemas/typecheck/isolation/lockfile/lint/format); pnpm run build passed (plugin+worker bundles); targeted 195 passed. |
| C1 | constraint | respected | static_check | Reused withTemporalRetry/createTemporalReadDeadline/reinitStsl/runTemporal(Query); no parallel retry mechanism added. |
| C2 | constraint | respected | static_check | Classification centralized in retry-wrapper.ts classifyTemporalError/isReconnectableError/extractGrpcStatus; structural gRPC codes, not scattered string checks. |
| C3 | constraint | respected | static_check | Reads retried; the idempotent signal is NOT blindly retried — reconcile-instead-of-re-signal. No non-idempotent mutation blind-retried. |
| C4 | constraint | respected | static_check | Retries bounded by existing aggregate deadline; no tool timeout ceilings raised. |
| C5 | constraint | respected | static_check | Source-only edits in the ADV worktree (retry-wrapper.ts, shared.ts, archive-gate.ts + tests); dist built, not hand-edited. |
| DONT1 | avoidance | respected | review | transient class did not capture fatal: nondeterminism/NOT_FOUND/already-exists still fallback/fatal; precedence test passes. |
| DONT2 | avoidance | respected | review | No per-session task-queue isolation or worker supervision changes; shared queue unchanged. |
| DONT3 | avoidance | respected | review | No tool-timeout ceiling raise; manual adv_temporal_reconnect not made the expected workflow (auto reconnect-and-retry on transport failures). |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-e00865b27913 | SC1, SC4 | AC1, AC4 | C2, C4, DONT1, DONT3 |  |
| tk-a25de24644de | SC2 | AC2 | C1, C3, C5, DONT2 |  |
| tk-2c0cdc23df1b | SC3 | AC3, AC4 | C3, DONT1 |  |
| tk-4cfea9409c95 |  | AC5 | C5 |  |
