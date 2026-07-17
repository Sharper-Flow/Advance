# Contract Traceability

**Change ID:** fixTriageTimeouts
**Contract Version:** 1
**Rigor:** strict
**Reviewed:** 2026-07-17T04:44:59.158Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Reviewer READY: bounded inventory context gives triage a documented caller-visible budget ≤60s (55s inner/60s outer); returns complete or explicitly incomplete result (inventory-budget + adv-worktree tests, 97 reviewer-run + tr_mrogeeo3_88e305c1: 42 post-commit). |
| SC2 | success_criterion | pass | review | Partial responses preserve collected findings with inspected scope, omitted scope, stop reason; omitted worktrees never classified clean/deletion-safe (honest partial projection, reviewer-remediated + tested). |
| SC3 | success_criterion | pass | review | Cancellation propagation stops new Git/workflow inspection admission; termination uncertainty reported explicitly (reviewer remediation + AC5 tests). |
| SC4 | success_criterion | pass | review | Interactive read-tool audit complete: 10s default retained globally; documented per-tool budgets ≤60s with internal bound + typed degraded behavior recorded (advance-meta spec + tool-registry, rq-toolTimeoutOverride01). |
| SC5 | success_criterion | pass | review | WIP renders active-change and peer-session sections while worktree source degradation is explicit (state-snapshot-budget tests, AC2). |
| AC1 | acceptance_criterion | pass | test | Controlled slow Git/workflow probes yield actionable partial triage response, not opaque wrapper timeout (adv-worktree.test.ts hung-query partial return; runs tr_mrogeeo3_88e305c1, tr_mrnyword_f83ec612). |
| AC2 | acceptance_criterion | pass | test | Controlled slow worktree inventory leaves WIP active-change + peer-session output available with worktree warning (state-snapshot-budget.test.ts, 42-test run green). |
| AC3 | acceptance_criterion | pass | test | Every tool receiving outer headroom has documented inner budget, rationale, typed timeout behavior, outer cap ≤60s (spec rq-toolTimeoutOverride01 assertions + tool-registry tests in reviewer 97-test run). |
| AC4 | acceptance_criterion | pass | test | Tests prove incomplete inventory cannot authorize cleanup or label omitted worktrees clean (inventory-budget.test.ts red-first evidence tr_mrnwzzae→tr_mrnx0syb; DONT2 assertions). |
| AC5 | acceptance_criterion | pass | test | Tests prove cancellation stops new inspection admission and preserves honest incomplete state (cancellation propagation tests in reviewer run + tr_mrogeeo3_88e305c1). |
| C1 | constraint | respected | static_check | Global safeExecute default remains 10000ms (unchanged; pnpm run check green; reviewer static review). |
| C2 | constraint | respected | static_check | Triage/WIP remain read-only; no cleanup, deletion, recovery, or mutation authority added (diff review). |
| C3 | constraint | respected | static_check | Per-tool outer timeouts >10s carry shorter internal budget, return reserve, rationale, and typed degraded behavior (documented per rq-toolTimeoutOverride01). |
| C4 | constraint | respected | static_check | Exact branch, path, and blocker evidence preserved for inspected worktree findings (C4 assertions in adv-worktree tests). |
| C5 | constraint | respected | static_check | Coordinates with fixTemporalQueryRecovery bounded-read work without expanding its contract (bounded-read-deadline.test.ts untouched semantics; verified green tr_mrofz8h7_8727e6fb). |
| DONT1 | avoidance | respected | review | Global timeout default not raised (C1 evidence; reviewer READY 0 findings). |
| DONT2 | avoidance | respected | review | Uninspected worktrees never classified clean/merged/deletion-safe (AC4 tests + honest partial projection). |
| DONT3 | avoidance | respected | review | No additional Git/workflow inspection starts after cancellation or budget exhaustion (SC3/AC5 admission-stop tests). |
| DONT4 | avoidance | respected | review | Incomplete inspection surfaces explicitly (inspected/omitted/stop reason); never a successful-looking complete result (SC2 tests). |
| OOS1 | out_of_scope | not_applicable | not_applicable | No automatic cleanup/deletion/recovery/mutation added. |
| OOS2 | out_of_scope | not_applicable | not_applicable | No OpenCode host configuration or lifecycle changes. |
| OOS3 | out_of_scope | not_applicable | not_applicable | No unrelated timeout changes; every timeout change is backed by an interactive read-tool audit finding. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-fdceea81152f | SC1, SC2, SC3, AC1, AC4, AC5 |  | C1, C2, C3, C4, DONT1, DONT2, DONT3, DONT4, OOS1, OOS2 |  |
| tk-1703833ae4ae | SC1, SC2, SC3, AC1, AC4, AC5 |  | C1, C2, C3, C4, DONT1, DONT2, DONT3, DONT4 |  |
| tk-81702a220f7d | SC4, SC5, AC2, AC3 |  | C1, C2, C3, C5, DONT1, DONT3, OOS1, OOS2, OOS3 |  |
| tk-8a963ce5c634 |  | SC1, SC2, SC3, SC4, SC5, AC1, AC2, AC3, AC4, AC5 | C1, C2, C3, C4, C5, DONT1, DONT2, DONT3, DONT4, OOS1, OOS2, OOS3 |  |
