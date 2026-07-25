# Contract Traceability

**Change ID:** addSessionRecoveryReadiness
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-25T07:17:30.896Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | ADV_SESSION_NOT_READY typed envelope returned for orphaned prior-session queue, distinct from no_poller. session-readiness.integration.test.ts AC1 + adv-reviewer READY. |
| SC2 | success_criterion | pass | review | Fresh own-queue unblocked despite unrelated orphan (per-target-queue). _adapters.test.ts AC2 + integration AC2. |
| SC3 | success_criterion | pass | review | Startup latency unchanged; barrier post-init (AC6 test: startChangeWorkflow does not call readiness probe). |
| SC4 | success_criterion | pass | review | markStale at worker-death hooks; next mutation re-rejects. orphan-queue-adopter.test.ts AC4. |
| SC5 | success_criterion | pass | review | Envelope discriminable through safeExecute (kind/blockers/retryHint), distinct from ADV_PLUGIN_INIT_FAILED/no_poller. Remediation 23ed585f; safe-execute.test.ts. |
| AC1 | acceptance_criterion | pass | test | _adapters.test.ts AC1 + integration AC1; signal NOT fired on unproven queue. tr_mrzvafcc, tr_mrzxikf2. |
| AC2 | acceptance_criterion | pass | test | _adapters.test.ts AC2 + integration AC2; fresh own-queue executes. tr_mrzvafcc, tr_mrzxikf2. |
| AC3 | acceptance_criterion | pass | test | retryHint references ~10s adoption cadence, no ETA. readiness-types.test.ts. tr_mrzvafcc. |
| AC4 | acceptance_criterion | pass | test | orphan-queue-adopter.test.ts AC4; markStale re-reject after worker death. tr_mrzwke6i. |
| AC5 | acceptance_criterion | pass | test | ADV_SESSION_READINESS_BYPASS=1 short-circuits; restricted to '1' only (23ed585f). _adapters.test.ts AC5. |
| AC6 | acceptance_criterion | pass | test | startChangeWorkflow does not call readiness probe; rq-isolSessionTaskQueue05 preserved. _adapters.test.ts AC6. |
| AC7 | acceptance_criterion | pass | test | ensureTargetMutationQueueReady parity matrix (T1 pure extraction); integration AC7. tr_mrzxikf2. |
| C1 | constraint | respected | static_check | Barrier is post-init tool exposure; startup path untouched. rq-sessionReadinessBarrier01.6. |
| C2 | constraint | respected | static_check | Query proof for existing workflow; DescribeTaskQueue advisory-only; never a Signal. session-readiness.ts KD3 truth table. |
| C3 | constraint | respected | static_check | gateMutationSuccessDisk typing intact (MutationApplicationUnconfirmedError/receipt/isOuterSignalRetryAllowed untouched); 356-test regression + full itest green. |
| C4 | constraint | respected | static_check | ensureTargetMutationQueueReady behavior-identical (T1 extraction); integration AC7 parity. |
| C5 | constraint | respected | static_check | Probe bounded (DDC1 <=2s, fail-closed on timeout); never returns ready on uncertainty. |
| C6 | constraint | respected | static_check | Per-target-queue model; fresh own-queue not gated by unrelated orphan. KD1. |
| DONT1 | avoidance | respected | review | Startup not blocked (C1/AC6). |
| DONT2 | avoidance | respected | review | Read-only Query used, never Signal. KD3. |
| DONT3 | avoidance | respected | review | Existing orphan adoption preserved (17 pre-existing adopter tests green). |
| DONT4 | avoidance | respected | review | No blind auto-retry; caller-driven retry hint only. |
| DONT5 | avoidance | respected | review | Cross-project check unchanged (AC7). |
| DONT6 | avoidance | respected | review | Durability typing intact (C3). |
| DONT7 | avoidance | respected | review | No over-blocking; per-target-queue (C6). |
| OOS1 | out_of_scope | missing | not_applicable |  |
| OOS2 | out_of_scope | missing | not_applicable |  |
| OOS3 | out_of_scope | missing | not_applicable |  |
| OOS4 | out_of_scope | missing | not_applicable |  |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-c70dcf713b42 |  | AC7 | C4, DONT5 |  |
| tk-4cb5785d8e89 |  |  | C1, C2, C5, DONT1, DONT2 |  |
| tk-d0a955d809aa | SC5 | AC3, AC5 |  |  |
| tk-bec0692c8fda |  | AC1 | C2, C5, DONT2 |  |
| tk-160446af96b1 | SC1, SC2 | AC1, AC2 | C3, C6, DONT6, DONT7 |  |
| tk-9b23045e3b3e | SC4 | AC4 | DONT3 |  |
| tk-922cef45dadb | SC3 | AC5, AC6 | C1, DONT1 |  |
| tk-ca2645ff74e0 |  | AC1, AC2, AC3, AC4, AC5, AC6, AC7 | C1, C3, C4 |  |
