# Contract Traceability

**Change ID:** fixMultiSessionTemporalState
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-06-05T19:31:45.147Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | `src/temporal/health-probe.test.ts` covers server poller fresh state setting worker_alive=true while worker_process_alive=false; bin/oc-test full 3524/3524 pass. |
| AC2 | acceptance_criterion | pass | test | `src/storage/store-temporal/index.test.ts` covers archive-bundle memo busting for stale non-terminal cached changes; full suite pass. |
| AC3 | acceptance_criterion | pass | test | `src/tools/change.archive-phase9.test.ts` covers explicit phase9:run async pending dispatch and unchanged phase9:skip; full suite pass. |
| AC4 | acceptance_criterion | pass | test | `src/tools/change.archive-phase9.test.ts` + workflow state mapping cover phase9_status persistence/readback via adv_change_show; full suite pass. |
| AC5 | acceptance_criterion | pass | test | `src/tools/worktree/triage.test.ts` covers unregistered change/* branch with unmerged commits classified missing_from_temporal_unmerged; full suite pass. |
| AC6 | acceptance_criterion | pass | test | bin/oc-test full: 259 files / 3524 tests pass (adv_run_test evidence, exit 0). bin/oc-test smoke pass. New tests cover all five fixes incl Fix 5. |
| AC7 | acceptance_criterion | pass | test | Two new tests in `src/tools/change.test.ts`: validate + archive-dryRun with a peer whose changes.get throws WorkflowNotFoundError. RED reproduced crash (validate threw; archive returned VALIDATION_CONTEXT_FAILED); GREEN both pass after the loadValidationContext guard. change.test.ts 50/50. |
| C1 | constraint | respected | static_check | TemporalHealth still exposes worker_process_alive as a separate field; typecheck + full suite green. |
| C2 | constraint | respected | static_check | Memo busting uses per-call archive-bundle presence check; no polling TTL or repo-wide scan; store-temporal tests pass. |
| C3 | constraint | respected | static_check | Archive phase9 tests cover dry-run/skip preservation and explicit run async dispatch; full suite pass. |
| C4 | constraint | respected | static_check | Triage tests preserve legacy missing_from_temporal for unknown/merged cases while adding proven-unmerged subclass. |
| C5 | constraint | respected | static_check | Fix 5 guard catches only the per-peer hydration get; target-change validation errors still flow (existing `strict mode fails when validation has errors` DUPLICATE_REQUIREMENT_ID test still passes). Guard does not wrap the target change load. |
| DONT1 | avoidance | respected | review | No distributed lock or cross-session event bus introduced; Fix 5 is a local try/catch guard on an existing read loop. |
| DONT2 | avoidance | respected | review | Only phase9 async added a workflow signal/state (phase9StatusUpdated). Fix 5 touches no workflow signal/query surface — tool-layer guard only. Message-surface tests + full suite pass. |
| DONT3 | avoidance | respected | review | No modifications to adv_worktree_delete or adv_worktree_cleanup; Fix 5 is confined to change.ts loadValidationContext + tests. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-a519d7eb5bf1 | AC1, C1 | AC1 |  |  |
| tk-3adfb0cdf9d0 | AC2, C2 | AC2 |  |  |
| tk-39aa04165358 | AC5, C4 | AC5 |  |  |
| tk-34590084665f | AC3, AC4, C3 | AC3, AC4 | DONT2 |  |
| tk-0cc3b7ac030a |  | AC6, C1, C2, C3, C4, DONT1, DONT2, DONT3 |  |  |
| tk-c347050e63a2 | AC7, C5 | AC7 | C5, DONT2 |  |
