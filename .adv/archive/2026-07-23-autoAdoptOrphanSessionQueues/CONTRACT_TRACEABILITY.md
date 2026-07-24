# Contract Traceability

**Change ID:** autoAdoptOrphanSessionQueues
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-23T22:25:00.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | orphan-session-adoption.itest.ts: a stranded workflow on an unpolled session queue becomes queryable after adoptNextOrphan() registers a real poller (handle.query returns truthy). Adoption is the recovery path; no adv_change_workflow_terminate/poisoned_history needed. |
| SC2 | success_criterion | pass | review | plugin-init.ts onBeat calls adoptNextOrphan every 10s heartbeat; orphan-queue-adopter adopts one orphan/tick. Future orphaned workflows adopted within bounded time (<=heartbeat cadence). |
| AC1 | acceptance_criterion | pass | test | list-orphan-session-queues.ts enumerates RUNNING workflows via AdvAffectedProjects Visibility query, filters session-scoped queues (advance-{P}-sess_*) not in polled set. 6 unit tests cover filter/sort/group/idempotency. |
| AC2 | acceptance_criterion | pass | test | e2e: after adoptNextOrphan registers a real Worker on the stranded session queue, handle.query(getChangeStateQuery) succeeds (bounded-retry sentinel). |
| AC3 | acceptance_criterion | pass | test | list-orphan-session-queues.ts:79 skips non-RUNNING; orphan-queue-adopter returns early on empty orphans. Unit test 'does nothing when there are no orphans'. |
| AC4 | acceptance_criterion | pass | test | plugin-init.ts: onBeat invocation is fire-and-forget void...catch(()=>undefined); adopter instantiated only after worker+temporalBundle ready. Adoption never blocks startup; Visibility failures swallowed, retried next heartbeat. |
| AC5 | acceptance_criterion | pass | test | worker.queues read live each tick; list-orphan-session-queues skips already-polled. e2e asserts registerQueue called exactly once across two scans; unit test 'skips a queue already in worker.queues'. |
| AC6 | acceptance_criterion | pass | test | try/catch observes register failures; 3-attempt cap + 5-min cooldown (recordFailure); try/finally releases scanInFlight; heartbeat .catch prevents crash. Unit test 'applies cooldown after 3 failed attempts'. lastError now captured (remediation) for operator triage. |
| AC7 | acceptance_criterion | pass | test | doctor.ts renders orphan_queue_adoption (50-entry cap + omittedTrackedQueues + disabled-note); status-health.ts adds {enabled,tracked,inCooldown} summary through status-health-plan.ts + status.ts. doctor.test.ts (3 cases) + status-health.session-queue.test.ts (2 cases). |
| AC8 | acceptance_criterion | pass | test | single-flight (one adoption/tick) + 8s tick timeout (DEFAULT_TICK_TIMEOUT_MS) + 10s heartbeat = 18s worst case < 90s SERVICEABILITY_GRACE_MS. Unit test 'enforces single-flight'. |
| AC9 | acceptance_criterion | pass | test | list-orphan-session-queues returns ALL orphans (only RUNNING + session-scoped + not-polled filters); no wedge-isolation opt-out. Operator can adv_change_workflow_terminate contaminated workflows. |
| C1 | constraint | respected | static_check | Additive only: new helper + coordinator + env flag + diagnostics field. No routing/session-id/registerQueue-semantics changes. registerQueue signature unchanged. |
| C2 | constraint | respected | static_check | Adoption is fire-and-forget on the heartbeat; never blocks worker init. Same as AC4. |
| C3 | constraint | respected | static_check | Strict RUNNING filter (list-orphan-session-queues.ts:79). |
| C4 | constraint | respected | static_check | registerQueue adds a poller; no taskQueue mutation / UpdateTaskQueue calls. Delta body asserts 'only adds pollers, never re-routes'. |
| C5 | constraint | respected | static_check | Idempotent via worker.queues live read. Same as AC5. |
| C6 | constraint | respected | static_check | run-error observed (catch); failure recorded in perQueueState -> diagnostics; worker survives (try/finally + heartbeat catch). Same as AC6. |
| C7 | constraint | respected | static_check | 8s tick timeout, one queue/tick. Same as AC8. |
| C8 | constraint | respected | static_check | Single projectId bound at construction; Visibility query project-scoped. No cross-namespace enumeration. |
| C9 | constraint | respected | static_check | Diagnostics use opaque advance-{P}-sess_* queue names (no PIDs/paths); status-health redacts to counts only. Unit test 'summarizes ... without exposing queue identifiers'. |
| DONT1 | avoidance | respected | review | No default-route-to-project-queue; workflow-start routes to session queue when sessionId provided. |
| DONT2 | avoidance | respected | review | No process-exit hook added; adoption is heartbeat-driven only. |
| DONT3 | avoidance | respected | review | session-id.ts untouched; queue format sess_{id} preserved (read-only). |
| DONT4 | avoidance | respected | review | Recovery-classification taxonomy unchanged; doctor.ts only ADDS a diagnostics field. |
| DONT5 | avoidance | respected | review | registerQueue signature unchanged across worker-multi/in-process/out-of-process; change only consumes it. |
| DONT6 | avoidance | respected | review | Single-namespace; client bound at init; no cross-namespace enumeration. Same as C8. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-178c24e3f9a3 | AC1, AC3, AC9 |  | C3, C9 |  |
| tk-511d8456372f | AC1, AC2, AC3, AC4, AC5 |  | C1, C2, C3, C4, C5 |  |
| tk-e23e7b9bf45b | AC5, AC6, AC8 |  | C2, C5, C6, C7 |  |
| tk-041b86c1f738 | AC4 |  | C1, C2 |  |
| tk-3b55e010e5aa | AC7 |  | C9 |  |
| tk-30a75bade274 |  | SC1, SC2, AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC9 | C1, C4 |  |
