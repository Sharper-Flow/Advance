# Contract Traceability

**Change ID:** separateLifecycleState
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-06-25T03:34:00.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Typed lifecycle model added: ChangeLifecycleState open|archived|closed, workflow state persists lifecycleState, gate progress remains in gates/AdvCurrentGate. adv-reviewer READY. |
| SC2 | success_criterion | pass | review | Terminal archive/close paths set lifecycleState archived/closed; review remediation restored lifecycle rollback on failed archive/cancel projection. Targeted tests and pnpm run check passed. |
| SC3 | success_criterion | pass | review | normalizeChangeLifecycleState maps draft|pending|active to open; search/read-model projection carries lifecycleState; source scan found no legacy open-status authority literals. |
| SC4 | success_criterion | pass | review | Default list, backlog claim, worktree owner, and status query paths no longer use legacy status union for open authority; lifecycle/running predicates and client lifecycle filtering used. |
| SC5 | success_criterion | pass | review | worktree state queries use AdvLifecycleState open + ExecutionStatus Running; worktree tests passed in targeted suite. |
| SC6 | success_criterion | pass | review | bin live-status uses worker-free Visibility list, exposes lifecycleState separately from status/gate, filters non-open lifecycle summaries, and keeps running execution guard. Bun CLI tests passed. |
| AC1 | acceptance_criterion | pass | test | pnpm exec vitest run src/temporal/change-state.test.ts and shared/read-model tests passed; legacy draft|pending|active normalize/project to lifecycleState open. |
| AC2 | acceptance_criterion | pass | test | Lifecycle tests and read-model/search-attribute tests passed; terminal states normalize/project archived or closed and default open reads exclude terminal via lifecycle/running guard. |
| AC3 | acceptance_criterion | pass | test | lgrep scans returned zero `AdvChangeStatus = "active"` and zero `AdvChangeStatus IN ("draft", "pending", "active")` occurrences after implementation/review. |
| AC4 | acceptance_criterion | pass | test | src/tools/worktree/state-session-lifecycle.test.ts and index-create.test.ts passed; expected branch-owner queries use AdvLifecycleState open + ExecutionStatus Running. |
| AC5 | acceptance_criterion | pass | test | list-change-workflows, visibility-claim-queries, worktree, and live-status tests passed with ExecutionStatus Running guard; CLI test filters stale completed workflow rows. |
| AC6 | acceptance_criterion | pass | test | bun test bin/lib/live-status.test.ts bin/lib/render.test.ts bin/adv.test.ts passed (41 tests); ChangeSummary includes lifecycleState separate from status and firstIncompleteGate. |
| AC7 | acceptance_criterion | pass | test | Updated .adv/specs/advance-workflow, advance-meta, backlog-coordination, worktree-lifecycle plus docs/specs markdown mirrors where present; deploy-local spec tests passed. |
| AC8 | acceptance_criterion | pass | test | Normalization/read-model/search-attribute tests passed; source scan shows no remaining legacy open-status authority query literals. |
| AC9 | acceptance_criterion | pass | test | Targeted suite passed: 209 vitest tests across lifecycle, projection, query, worktree, backlog, status/spec assets; 41 Bun CLI tests passed. |
| AC10 | acceptance_criterion | pass | test | pnpm run check passed after schemas:check, typecheck, test-isolation check, lockfile policy check, lint, and format:check. |
| C1 | constraint | respected | static_check | lifecycleState field is separate from gates/AdvCurrentGate; no code makes lifecycle mirror gate progress. |
| C2 | constraint | respected | static_check | Lifecycle, gate progress, and compatibility status/bucket are distinct fields in types, search attributes, and CLI summary. |
| C3 | constraint | respected | static_check | Archive/cancel terminal paths preserve archived/closed behavior; review remediation restores lifecycle rollback on projection failure. |
| C4 | constraint | respected | static_check | bin/lib/live-status.ts remains Visibility-based and does not issue per-change getState queries for default table; CLI tests passed. |
| C5 | constraint | respected | static_check | Open coordination queries use lifecycle/running guard; status CLI filters non-open lifecycle rows and fails closed on Temporal list failure. |
| C6 | constraint | respected | static_check | AdvLifecycleState added as additive Keyword search attribute; AdvChangeStatus retained as compatibility projection, not removed/reused. |
| DONT1 | avoidance | respected | review | Change.status remains compatibility/read-model metadata; current gate remains gates/AdvCurrentGate. |
| DONT2 | avoidance | respected | review | Open lifecycle truth moved to lifecycleState/AdvLifecycleState; legacy draft|pending|active normalized to open. |
| DONT3 | avoidance | respected | review | Source scan zero occurrences of `AdvChangeStatus = "active"`; worktree owner query fixed to lifecycle/running predicate. |
| DONT4 | avoidance | respected | review | Lifecycle correctness is represented by typed schema, normalizer, Search Attribute projection, and tests; no branch/title/prose heuristic authority introduced. |
| DONT5 | avoidance | respected | review | Archived/closed terminal reads and compatibility status remain; default open reads changed without removing terminal/audit modes. |
| DONT6 | avoidance | respected | review | Seven-gate model unchanged; new requirement explicitly keeps lifecycle orthogonal to gates. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-69adb25af2b0 | AC1, AC2, AC8, SC1, SC2, SC3 | AC1, AC2 | C1, C2, C3, DONT1, DONT2, DONT6 |  |
| tk-57a369598d7b | AC1, AC2, AC5, AC8, SC1, SC2, SC3, SC6 | AC1, AC2, AC5, AC8 | C3, C4, C5, C6, DONT2, DONT4, DONT5 |  |
| tk-2d2d64723112 | AC3, AC5, AC7, SC4, SC6 | AC3, AC5, AC7 | C1, C2, C4, C5, DONT2, DONT4, DONT5 |  |
| tk-23680dc03411 | AC3, AC4, AC5, SC4, SC5 | AC3, AC4, AC5 | C1, C2, C5, DONT3, DONT4, DONT5 |  |
| tk-7f11c9e3b72c | AC3, AC5, AC6, SC4, SC6 | AC5, AC6 | C1, C2, C4, DONT4, DONT5 |  |
| tk-5ee8001e7cc5 | AC7 | AC7 | C1, C2, DONT1, DONT2, DONT6 |  |
| tk-7e29a7ceaae8 |  | AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC9, AC10, SC1, SC2, SC3, SC4, SC5, SC6 | C1, C2, C3, C4, C5, C6, DONT1, DONT2, DONT3, DONT4, DONT5, DONT6 |  |
