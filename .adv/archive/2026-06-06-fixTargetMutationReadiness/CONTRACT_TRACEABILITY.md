# Contract Traceability

**Change ID:** fixTargetMutationReadiness
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-06-06T23:16:31.129Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | `ensureTargetMutationQueueReady` accepts fresh server poller evidence; `target-project.test.ts` client-only fresh poller case passes. Reviewer verdict READY. |
| SC2 | success_criterion | pass | review | Spec `rq-targetMutationReadiness03`; helper reuses `classifyQueueServiceability`; reviewer confirmed status/mutation readiness semantics align. |
| SC3 | success_criterion | pass | review | Unproven poller statuses fail before `createStore` with typed blockers/action in table-driven test; reviewer expanded absent/stale/unavailable coverage. |
| SC4 | success_criterion | pass | review | `change-cross-project-create.test.ts` target create failure surfaces Temporal failure and source `changes.save` is not called. |
| AC1 | acceptance_criterion | pass | test | `bin/oc-test targeted -- src/tools/target-project.test.ts ...` passed; fresh server poller test opens temporal store after local registration failure. |
| AC2 | acceptance_criterion | pass | test | Table-driven `target-project.test.ts` covers `none`, `stale`, and `unavailable` pollers; each throws queue/blocker/action error before `createStore`. |
| AC3 | acceptance_criterion | pass | test | Existing temporal-required target store test still passes and asserts `ensureProjectTemporalQueue(TARGET_PROJECT_ID)` and `createStore` are called. |
| AC4 | acceptance_criterion | pass | test | Existing untrusted target mutation resolver test still passes; `resolveTargetProject` rejects missing `target_confirmed` before readiness/store construction. |
| AC5 | acceptance_criterion | pass | test | `change-cross-project-create.test.ts` failure case asserts target create attempted, target get not called, Temporal failure surfaced, and source `changes.save` not called. |
| AC6 | acceptance_criterion | pass | test | Targeted tests passed 3 files/25 tests; `pnpm run check` passed after reviewer remediation. |
| C1 | constraint | respected | static_check | `withTargetPathStore` still constructs target mutations through `createStore(... temporalBundle ...)`; snapshot/scaffold branches unchanged; no disk mutation fallback added. |
| C2 | constraint | respected | static_check | Mutation readiness uses `classifyQueueServiceability`, same structural model used by status/diagnostics. |
| C3 | constraint | respected | static_check | Helper first checks registered queues and then calls existing `ensureProjectTemporalQueue` before server fallback. |
| C4 | constraint | respected | static_check | Helper calls `probeTaskQueuePollers` at mutation boundary with explicit `freshPollerMs: TARGET_MUTATION_FRESH_POLLER_MS`; does not consume cached status/health evidence. |
| C5 | constraint | respected | static_check | Failure is built from `QueueServiceability.status`, `confidence`, `evidence.serverPollerProbe`, and `blockers`; no parsing of `no registered worker` prose controls correctness. |
| DONT1 | avoidance | respected | review | No disk-only target mutation fallback added; unproven readiness throws before `createStore`. |
| DONT2 | avoidance | respected | review | `resolveTargetProject` trust gate remains before temporal readiness; existing confirmation test passes. |
| DONT3 | avoidance | respected | review | No CLI/tool-exec path added; change limited to target-project readiness helper, tests, and spec docs. |
| DONT4 | avoidance | respected | review | No broad worker architecture replacement; existing `ensureProjectTemporalQueue` remains local path, server poller fallback added at target boundary. |
| DONT5 | avoidance | respected | review | Fresh poller path no longer reports missing target worker; it proceeds to temporal store path. |
| OOS1 | out_of_scope | not_applicable | not_applicable | No product-linked repository scope files or behavior were changed. |
| OOS2 | out_of_scope | not_applicable | not_applicable | No direct ADV state file read/write policy changes made. |
| OOS3 | out_of_scope | not_applicable | not_applicable | No broad status performance/latency redesign; only readiness semantics reused status classifier/probe model. |
| OOS4 | out_of_scope | not_applicable | not_applicable | Worker restart UX not changed beyond target readiness failure action text. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-28152fd2daa6 | SC2, SC3, C1, C2, C5 | AC2 | DONT1, DONT2, DONT3, DONT4, DONT5, OOS1, OOS2, OOS3, OOS4 |  |
| tk-08358f278a59 | SC1, SC2, SC3, AC1, AC2, AC3, AC4, C1, C2, C3, C4, C5 | AC1, AC2, AC3, AC4, AC6 | DONT1, DONT2, DONT3, DONT4, DONT5, OOS1, OOS2, OOS3, OOS4 |  |
| tk-ad71e2c8c81e | SC4, AC5 | AC5, AC6 | DONT1, DONT2, DONT5, OOS1, OOS2, OOS3, OOS4 |  |
| tk-8dd953c53fc1 |  | SC1, SC2, SC3, SC4, AC1, AC2, AC3, AC4, AC5, AC6 | C1, C2, C3, C4, C5, DONT1, DONT2, DONT3, DONT4, DONT5, OOS1, OOS2, OOS3, OOS4 |  |
