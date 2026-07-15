# Contract Traceability

**Change ID:** fixWedgedWorkflowRecovery
**Contract Version:** 1
**Rigor:** strict
**Reviewed:** 2026-07-15T19:56:55.139Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Reviewer READY; pinned termination tool has approval, eligibility, run-pinning, and idempotency coverage. |
| SC2 | success_criterion | pass | review | Gate recovery reads one durable snapshot after terminal workflow evidence; targeted gate tests pass. |
| SC3 | success_criterion | pass | review | Typed query_failed classification and mutation rejection covered by task 1 tests. |
| SC4 | success_criterion | pass | review | Refusal paths for incomplete, unavailable, and unshipped recovery states reviewed and tested. |
| SC5 | success_criterion | pass | review | Review focused suite 78/78; integration full suite 5445/5445; pnpm run check passed. |
| AC1 | acceptance_criterion | pass | test | change.workflow-terminate.test.ts 18/18 passes; focused review suite passes. |
| AC2 | acceptance_criterion | pass | test | gate.test.ts coherent disk snapshot recovery test passes. |
| AC3 | acceptance_criterion | pass | test | Termination and gate recovery refusal tests pass. |
| AC4 | acceptance_criterion | pass | test | recovery-classification and Temporal store tests pass. |
| AC5 | acceptance_criterion | pass | test | pnpm run check and full suite 361 files/5445 tests pass. |
| C1 | constraint | respected | static_check | Review found typed tool/store/Temporal adapters only; no raw CLI path. |
| C2 | constraint | respected | static_check | Termination requires explicit approval and non-empty audit evidence. |
| C3 | constraint | respected | static_check | Recovery entrypoint limits targets to acceptance/release and retains task/readiness checks. |
| C4 | constraint | respected | static_check | query_failed is typed and rejected at mutation-authority boundaries. |
| C5 | constraint | respected | static_check | Archived changes remain routed to archive purge; new tool covers active wedged recovery. |
| C6 | constraint | respected | static_check | All task checkpoints were created on change/fixWedgedWorkflowRecovery worktree. |
| OOS1 | out_of_scope | not_applicable | not_applicable | No general worker supervision redesign included. |
| OOS2 | out_of_scope | not_applicable | not_applicable | No archive finalization or ops-followup redesign included. |
| OOS3 | out_of_scope | not_applicable | not_applicable | No existing incident repair executed. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-9a830ac3c12a | SC3, C4 | AC4 | C1, C4 |  |
| tk-c27ca0a33a1e | SC1, SC4, C2, C3, C5 | AC1, AC3 | C1, C2, C3, C5 |  |
| tk-e12e4c2d146a | SC2, SC4, C3, C4 | AC2, AC3 | C1, C3, C4 |  |
| tk-fab9911c3969 | SC5 | AC5 | C1, C4, C5, C6 |  |
