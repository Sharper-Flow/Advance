# Acceptance

Reviewed at: 2026-07-10T15:59:10.171Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | Loop history is inspectable without reading scattered prose, task notes, and raw sub-agent reports. | pass | Acceptance reviewer READY; loop-ledger projector/readback tests cover source-backed history. |
| SC2 | success_criterion | Retry, inconclusive, blocked, and complete outcomes are distinguishable in a consistent vocabulary. | pass | Projector tests cover pass, fail, blocked, and inconclusive verdict vocabulary. |
| SC3 | success_criterion | Default change reads remain compact enough for routine ADV phase starts. | pass | change.test verifies compact _loopLedger omits details unless explicit opt-in. |
| SC4 | success_criterion | Existing safety boundaries remain unchanged: user checkpoints, doom-loop escalation, no nested delegation, and no sub-agent orchestration mutation. | pass | Review found no authority, delegation, or retry-control changes. |
| SC5 | success_criterion | Future vector retrieval can reference loop records but cannot decide correctness. | pass | Specs state vector retrieval remains advisory-only and out of v1 scope. |
| AC1 | acceptance_criterion | Given existing ADV loop evidence from apply, review, harden, verification triage, or CI repair, when loop state is read, then each recorded or derived entry exposes loop kind, producer, evaluator, attempt count, verdict, next action, and stop reason. | pass | loop-ledger.test covers apply, review, harden, verification triage, CI entries and their fields. |
| AC2 | acceptance_criterion | Given a routing-only or inconclusive verification/CI result, when displayed in loop state, then it is labeled `inconclusive` or equivalent and does not increment task retry-failure budget. | pass | UNKNOWN/inconclusive mapping and fail-only retryFailureCount covered by loop-ledger tests. |
| AC3 | acceptance_criterion | Given a normal change read without explicit loop-detail opt-in, when loop data exists, then output shows compact summary/latest status only, not full retained attempt history. | pass | change.test verifies compact opt-in readback has no details by default. |
| AC4 | acceptance_criterion | Given explicit loop-detail opt-in, when loop entries exist, then detailed entries are bounded or paginated and include source references to underlying task/report/test/CI evidence. | pass | change.test verifies explicit detail opt-in with bounded limit; projector clamps 1-100. |
| AC5 | acceptance_criterion | Given a ledger entry with a passing verdict, when task or gate completion is evaluated, then existing task completion, test evidence, contract, report, and gate-readiness checks remain the authority. | pass | Pure read projection never mutates state; reviewer confirmed no completion authority. |
| AC6 | acceptance_criterion | Given legacy or archived changes without loop-ledger fields, when read or replayed, then missing fields default safely and existing histories do not fail. | pass | Projector accepts missing optional legacy fields; no live workflow query added to change readback. |
| AC7 | acceptance_criterion | Given vector/pgvector retrieval returns a similar past loop, when ADV evaluates current correctness, then retrieved lessons are advisory only and cannot complete tasks/gates or override specs. | pass | advance-delivery spec explicitly keeps vector retrieval advisory-only. |
| C1 | constraint | Temporal replay safety must be preserved through additive, workflow-safe state or derivation. | respected | Zod-only types plus pure projector; purity and workflow-boundary tests pass. |
| C2 | constraint | Default readback must remain bounded. | respected | Details are opt-in; default 20 and hard maximum 100 tested. |
| C3 | constraint | Retired task-run tools must not be revived. | respected | New include.loopLedger surface leaves legacy include.ledger/_ledger behavior unchanged. |
| C4 | constraint | Vector search must not become authoritative for workflow correctness, task/gate completion, security, persistence, or spec compliance. | respected | No vector integration introduced; spec restricts future retrieval to advisory use. |
| C5 | constraint | Existing `error_recovery`, subagent report, test-run evidence, and gate-readiness compatibility must not regress. | respected | Targeted tests, typecheck, schemas check, and acceptance reviewer all passed. |
| DONT1 | avoidance | Do not add new autonomy in v1. | respected | Readback-only projection adds no autonomous action. |
| DONT2 | avoidance | Do not add unbounded retries. | respected | No retry control flow changed; derived retryFailureCount is evidence only. |
| DONT3 | avoidance | Do not dump full traces by default. | respected | Full details require explicit opt-in and bounded limit. |
| DONT4 | avoidance | Do not introduce continuous meta-harness self-modification. | respected | No meta-harness or prompt rewrite behavior added. |
| DONT5 | avoidance | Do not let sub-agents mutate orchestration state. | respected | Subagents only report evidence; no orchestration mutation surface added. |
| OOS1 | out_of_scope | Building the pgvector lessons/reflections/reports database itself. | not_applicable | No pgvector database work is included in v1. |
| OOS2 | out_of_scope | Running golden workflow evals on every change. | not_applicable | No golden workflow evaluation runner added. |
| OOS3 | out_of_scope | Enforcing blind evaluator mode for every task. | not_applicable | No blind evaluator mode implementation added. |
| OOS4 | out_of_scope | Continuous meta-harness self-modification or automatic prompt/agent rewrites. | not_applicable | No continuous self-modification behavior added. |
| OOS5 | out_of_scope | Expanding autonomy beyond existing ADV apply/review/harden/CI remediation rules. | not_applicable | No autonomy expansion beyond current workflow policies. |

