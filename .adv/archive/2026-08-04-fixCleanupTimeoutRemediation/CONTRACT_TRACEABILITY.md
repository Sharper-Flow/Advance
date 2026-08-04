# Contract Traceability

**Change ID:** fixCleanupTimeoutRemediation
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-08-04T16:07:30.207Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | Mode-aware conditional remediation in both timeout branches. worktrees names skipDiscovery:true + adv_worktree_triage; archived_branches names a narrower changeId filter + triage and deliberately omits skipDiscovery (that mode never forwards discover). Tests in adv-worktree.test.ts and adv-worktree.archived-branches-emergency.test.ts. RED tr_msesfk2w_b0e471dd captured the original string verbatim. |
| AC2 | acceptance_criterion | pass | test | Unclamped branch retains 'Retry with a larger timeoutMs' in both modes because that action is reachable. Covered by one test per mode. |
| AC3 | acceptance_criterion | pass | test | Poison assertion and unconditional adv_doctor referral removed. Tests assert error and remediation match neither /poison/i nor 'adv_doctor', across clamped and unclamped input, in both modes. |
| AC4 | acceptance_criterion | pass | test | Timeout response reports stage plus pendingDeleteCount, with stage snapshotted synchronously before the pending-delete read. Production emission covered by a new test added during review after a scanner showed wrapper tests fired onStageEnter from their own mock. |
| AC5 | acceptance_criterion | pass | test | skipDiscovery added to args and Zod schema, forwarded as discover:!skipDiscovery against the discover !== false gate. Populated-queue and empty-queue tests both assert discover:false forwarding and no discovery invocation. Spread semantics verified by execution. |
| AC6 | acceptance_criterion | pass | test | gitTimeoutMs threaded through both cleanup-path helpers and all 7 discovery-reachable sites; wrapper derives min(2000, floor(budget/4)). cleanup-git-budget.test.ts now covers the census helper AND the worktree/index.ts helper. RED tr_mseryxua_5b81832b. Mutation-verified: corrupting the index.ts default now fails the new guard. |
| AC7 | acceptance_criterion | pass | test | WORKTREE_TOOL_SAFE_TIMEOUT_MS still 8000; clampToSafeBudget still monotone downward; effectiveTimeoutMs reported in every response shape. Pre-existing clamp tests unedited (diff additions-only, zero deletions). Verified tr_mseugh3r_78e9dc70, 157 passed. |
| C1 | constraint | respected | static_check | rq-worktreeBoundedCleanup02 upheld: clamp unchanged, typed timeout response retained, effectiveTimeoutMs reported, no late background mutation. No .then/.catch on the timed-out inner promise. |
| C2 | constraint | respected | static_check | rq-worktreeBoundedCleanup01 upheld: drain remains a sequential for-of, retry cap still 5, no parallelism introduced. index-delete.test.ts green. |
| C3 | constraint | respected | static_check | rq-terminalCleanupSafety01 upheld: deletion authority remains advWorktreeDelete; no direct git worktree remove added. |
| C4 | constraint | respected | static_check | rq-worktreePoisonVisibility01 upheld: poison claim removed rather than reclassified, because the branch resolves a setTimeout sentinel with no error object to classify. No describe() probe added. |
| C5 | constraint | respected | static_check | Drain-only adds no deletion path. drainPendingDeletes processes only rows a prior validated discovery wrote via setPendingDelete. |
| DONT1 | avoidance | respected | review | WORKTREE_TOOL_SAFE_TIMEOUT_MS unchanged at 8000; asserted directly by the pre-existing constant test. |
| DONT2 | avoidance | respected | review | No late-success handler on the timed-out promise. Scanner grep for cleanupPromise/raced .then/.catch returned zero hits; race consumed by await with timer cleared. |
| DONT3 | avoidance | respected | review | No handle.describe() probe added. Scanner grep across the three touched source files returned zero hits. |
| DONT4 | avoidance | respected | review | No deletion parallelized. The only Promise.all touched is the pre-existing census read-only git trio, now individually bounded. |
| DONT5 | avoidance | respected | review | Strengthened during review: stage is snapshotted synchronously before the pending-delete await so a value advanced by the still-running inner promise cannot be reported. pendingDeleteCount remains a fresh DB read. |
| OOS1 | out_of_scope | not_applicable | not_applicable | Bounded-concurrency discovery deliberately not implemented; zero mapWithConcurrency references introduced. Discovery remains sequential. |
| OOS2 | out_of_scope | not_applicable | not_applicable | Poison-detection machinery untouched. No changes to state.ts or recovery-probe.ts; adv-worktree.ts only imports the existing getPendingDeletes reader. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-7b2d308848b0 | AC5 |  | C5, C3, DONT4 |  |
| tk-2a69e7c2a549 | AC4 |  | DONT2, DONT5, C1 |  |
| tk-b4217ae3eb05 | AC1, AC2, AC3 |  | C4, DONT3, DONT1 |  |
| tk-6d217e1bba98 | AC6 |  | C1, C2, C3, OOS1, DONT4 |  |
| tk-57abcd25de71 |  | AC7 | C1, DONT1, DONT2 |  |
