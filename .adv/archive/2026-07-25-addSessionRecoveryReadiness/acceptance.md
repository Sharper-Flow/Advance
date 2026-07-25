# Acceptance

Reviewed at: 2026-07-25T07:17:30.896Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | **SC1** — A mutation fired at an orphaned prior-session queue during the post-replacement adoption window returns an explicit, retryable "not ready" — never an ambiguous `no_poller` whose recovery path is unknown. | pass | ADV_SESSION_NOT_READY typed envelope returned for orphaned prior-session queue, distinct from no_poller. session-readiness.integration.test.ts AC1 + adv-reviewer READY. |
| SC2 | success_criterion | **SC2** — A mutation fired at the new session's own freshly-polled queue is not blocked by an unrelated orphaned queue's unreadiness. | pass | Fresh own-queue unblocked despite unrelated orphan (per-target-queue). _adapters.test.ts AC2 + integration AC2. |
| SC3 | success_criterion | **SC3** — Worker startup latency is unchanged by the barrier (non-blocking preserved). | pass | Startup latency unchanged; barrier post-init (AC6 test: startChangeWorkflow does not call readiness probe). |
| SC4 | success_criterion | **SC4** — After a worker dies mid-session following initial readiness, subsequent mutations return "not ready" until recovery — the ambiguous window does not silently re-open. | pass | markStale at worker-death hooks; next mutation re-rejects. orphan-queue-adopter.test.ts AC4. |
| SC5 | success_criterion | **SC5** — The "not ready" response is classifiable by callers as distinct from init-failure (`ADV_PLUGIN_INIT_FAILED`) and from mutation-ineligible (`no_poller`). | pass | Envelope discriminable through safeExecute (kind/blockers/retryHint), distinct from ADV_PLUGIN_INIT_FAILED/no_poller. Remediation 23ed585f; safe-execute.test.ts. |
| AC1 | acceptance_criterion | **AC1** — Given a replacement session whose prior-session queue has no live poller, when a mutation targets that prior queue, then it returns a typed "not ready" response (not a `no_poller` mutation-ineligible error) and the signal does not execute. | pass | _adapters.test.ts AC1 + integration AC1; signal NOT fired on unproven queue. tr_mrzvafcc, tr_mrzxikf2. |
| AC2 | acceptance_criterion | **AC2** — Given a new session with its own queue freshly polled, when a mutation targets the new session's own queue, then it executes normally regardless of any unrelated orphaned queue's state. | pass | _adapters.test.ts AC2 + integration AC2; fresh own-queue executes. tr_mrzvafcc, tr_mrzxikf2. |
| AC3 | acceptance_criterion | **AC3** — Given the readiness probe has not proven serviceability for a target queue, when any mutation targets that queue, then the response includes retry guidance referencing the adoption heartbeat cadence. | pass | retryHint references ~10s adoption cadence, no ETA. readiness-types.test.ts. tr_mrzvafcc. |
| AC4 | acceptance_criterion | **AC4** — Given the worker has died mid-session after initial readiness, when a mutation is attempted, then it returns "not ready" (re-check active) rather than executing against the dead poller. | pass | orphan-queue-adopter.test.ts AC4; markStale re-reject after worker death. tr_mrzwke6i. |
| AC5 | acceptance_criterion | **AC5** — Given a configured readiness bypass is active, when mutations are attempted, then the barrier is skipped — for tests/dev determinism. | pass | ADV_SESSION_READINESS_BYPASS=1 short-circuits; restricted to '1' only (23ed585f). _adapters.test.ts AC5. |
| AC6 | acceptance_criterion | **AC6** — Worker startup completes without awaiting the readiness probe (non-blocking startup preserved). | pass | startChangeWorkflow does not call readiness probe; rq-isolSessionTaskQueue05 preserved. _adapters.test.ts AC6. |
| AC7 | acceptance_criterion | **AC7** — The existing cross-project `target_path` serviceability check behavior is unchanged. | pass | ensureTargetMutationQueueReady parity matrix (T1 pure extraction); integration AC7. tr_mrzxikf2. |
| C1 | constraint | **C1** — Worker startup MUST stay non-blocking (`rq-isolSessionTaskQueue05`, scenario 05.3) — inviolable. | respected | Barrier is post-init tool exposure; startup path untouched. rq-sessionReadinessBarrier01.6. |
| C2 | constraint | **C2** — Readiness proof uses a read-only Query where a target workflow exists; `DescribeTaskQueue` + local worker status otherwise (no always-present session/project workflow — `projectWorkflow` retired). Never a Signal (Signal ACK ≠ processing). | respected | Query proof for existing workflow; DescribeTaskQueue advisory-only; never a Signal. session-readiness.ts KD3 truth table. |
| C3 | constraint | **C3** — No regression of `gateMutationSuccessDisk` durability typing (`MutationApplicationUnconfirmedError`, receipt readback, `isOuterSignalRetryAllowed=false`). | respected | gateMutationSuccessDisk typing intact (MutationApplicationUnconfirmedError/receipt/isOuterSignalRetryAllowed untouched); 356-test regression + full itest green. |
| C4 | constraint | **C4** — Existing per-call cross-project `target_path` serviceability check (`target-project.ts:ensureTargetMutationQueueReady`) behavior unchanged. | respected | ensureTargetMutationQueueReady behavior-identical (T1 extraction); integration AC7 parity. |
| C5 | constraint | **C5** — Probe MUST be bounded (no unbounded hang) and MUST fail-closed to "not ready," never to "ready." | respected | Probe bounded (DDC1 <=2s, fail-closed on timeout); never returns ready on uncertainty. |
| C6 | constraint | **C6** — A mutation targeting the new session's own fresh queue MUST NOT be gated behind an unrelated orphaned queue's readiness (per-target-queue model). | respected | Per-target-queue model; fresh own-queue not gated by unrelated orphan. KD1. |
| DONT1 | avoidance | **DONT1** — MUST NOT block worker startup on the readiness probe (violates `rq-isolSessionTaskQueue05`). | respected | Startup not blocked (C1/AC6). |
| DONT2 | avoidance | **DONT2** — MUST NOT use a Signal as readiness proof. | respected | Read-only Query used, never Signal. KD3. |
| DONT3 | avoidance | **DONT3** — MUST NOT remove or weaken the existing eventual orphan adoption. | respected | Existing orphan adoption preserved (17 pre-existing adopter tests green). |
| DONT4 | avoidance | **DONT4** — MUST NOT auto-retry mutations blindly on "not ready" — caller-driven retry only. | respected | No blind auto-retry; caller-driven retry hint only. |
| DONT5 | avoidance | **DONT5** — MUST NOT regress cross-project `target_path` serviceability checking. | respected | Cross-project check unchanged (AC7). |
| DONT6 | avoidance | **DONT6** — MUST NOT regress `gateMutationSuccessDisk` durability typing. | respected | Durability typing intact (C3). |
| DONT7 | avoidance | **DONT7** — MUST NOT over-block: a fresh own-queue mutation must not wait on an unrelated orphaned queue. | respected | No over-blocking; per-target-queue (C6). |
| OOS1 | out_of_scope | **OOS1** — Issue #205: cross-project `target_path` worker lifecycle (separate, tracked). | missing |  |
| OOS2 | out_of_scope | **OOS2** — Non-session-bound worker fleet (longer-term architectural direction). | missing |  |
| OOS3 | out_of_scope | **OOS3** — Orphan-queue-adopter cooldown redesign (noted as risk; separate unless it blocks readiness). | missing |  |
| OOS4 | out_of_scope | **OOS4** — Stable operation-id mutation dedup (complementary follow-up, not core). | missing |  |

