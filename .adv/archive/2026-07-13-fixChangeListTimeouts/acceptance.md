# Acceptance

Reviewed at: 2026-07-13T16:03:39.702Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | Operators receive a usable, typed read result instead of an unclassified MCP timeout when a candidate workflow or source is slow. | pass | Post-remediation reviewer READY; typed bounded/degraded outcome verified. |
| SC2 | success_criterion | Summary status remains lightweight without treating stale cached state as authoritative. | pass | Summary bound and authoritative-state behavior retained by existing focused coverage and reviewer. |
| SC3 | success_criterion | Changes that were already hydrated during a request are not fetched again for status context. | pass | Request-local hydration reuse remains covered by prior acceptance tests; remediation did not touch enrichment. |
| SC4 | success_criterion | Source-level incompleteness is visible, actionable, and cannot be mistaken for a complete workflow view. | pass | Reviewer verified source/candidate deadline degradation remains explicit after remediation. |
| AC1 | acceptance_criterion | Given one or more candidate workflows or sources exceed the internal read budget, when `adv_change_list` or `adv_status` resolves state, then it returns within an **8-second aggregate internal deadline** with deterministic degraded metadata naming incomplete candidates or sources; the result never claims completeness. | pass | New fast Temporal failure plus slow disk fallback RED→GREEN test; bounded-read suite 12/12 passed. |
| AC2 | acceptance_criterion | Given all required sources and candidates resolve within the aggregate deadline, when either tool runs, then it returns a complete result preserving existing authoritative state and fast-path behavior. | pass | Prior complete-path coverage remains green; remediation only bounds fallback reads. |
| AC3 | acceptance_criterion | Given `adv_status` is called with `view: "summary"`, when status resolution starts, then the summary bound is applied before non-required deep hydration, artifact reads, or recent-change enrichment. | pass | Post-remediation scoped 122/122 includes status/list bounded-read coverage. |
| AC4 | acceptance_criterion | Given a change was hydrated for a status request, when recent-change or proposal-derived context renders, then the request reuses its hydrated document/projection and does not issue a duplicate per-change Temporal read; a regression test verifies the call count. | pass | Existing hydration call-count regression remains covered; remediation did not alter enrichment. |
| AC5 | acceptance_criterion | Given Archive inventory or Visibility pagination contributes candidates, when that source is slow, fails, or reaches the aggregate deadline, then the result identifies the source in typed degraded evidence and stops further unbounded source work. | pass | New slow archive fallback regression passes with typed bounded handling. |
| AC6 | acceptance_criterion | Given a cold cache, a slow candidate, and partial source failure fixtures, when affected tool tests run, then all three assert deterministic complete/degraded semantics without outer `ToolExecutionTimeout`. | pass | Fast Temporal failure + slow disk/archive fallback regression, bounded-read 12/12, storage/temporal 666 tests, and scoped 122/122 passed without outer timeout. |
| C1 | constraint | Change/task/gate state remains authoritative; TTL cache data must not become the primary list/status truth source. | respected | No authoritative TTL cache introduced; reviewer/diff inspection confirms request-scoped mechanisms only. |
| C2 | constraint | Degraded results are explicit and typed; no silent omission or complete-looking partial response. | respected | Fallback deadline tests assert explicit bounded degradation rather than silent omission. |
| C3 | constraint | `safeExecute` remains defense in depth, not normal timeout control. | respected | Existing deadline context reused; no outer timeout workaround introduced. |
| C4 | constraint | Archive and Visibility paths are included in deadline/source-classification design. | respected | Remediation explicitly covers disk/archive candidate fallback path. |
| C5 | constraint | Preserve existing target-path non-authoritative snapshot markers and isolate target-source deadline accounting. | respected | No target-path authority/accounting change in remediation. |
| C6 | constraint | Follow the existing Zod/schema, Temporal workflow-bundle, and test-isolation boundaries. | respected | pnpm run check passed; bounded read follows existing schema/workflow/test boundaries. |
| DONT1 | avoidance | No worker restart, poisoned-workflow mutation, or timeout-ceiling increase as a read-path workaround. | respected | No worker restart, poisoned mutation, or timeout-ceiling increase. |
| DONT2 | avoidance | No primary list-level TTL cache serving stale lifecycle/gate/task state. | respected | No list-level stale cache authority added. |
| DONT3 | avoidance | No unbounded archive-inventory × candidate scan. | respected | Archive fallback is deadline-wrapped; no unbounded archive scan introduced. |
| DONT4 | avoidance | No unrelated adapter-surface refactor or broad `change.ts` restructuring. | respected | Diff limited to bounded fallback test/path and formatting; no broad adapter/change.ts refactor. |

