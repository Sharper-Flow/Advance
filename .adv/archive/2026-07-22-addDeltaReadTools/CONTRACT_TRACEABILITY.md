# Contract Traceability

**Change ID:** addDeltaReadTools
**Contract Version:** 1
**Rigor:** minimal
**Reviewed:** 2026-07-22T22:50:00.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | spec-delta.test.ts: adv_delta_list returns bounded rows {id, operation, capability, target, title} across capabilities; capability filter + offset/limit pagination with hasMore; summary rows keep output bounded |
| AC2 | acceptance_criterion | pass | test | spec-delta.test.ts: adv_delta_show returns full staged delta by id; typed not-found (error contains deltaId) on unknown id, no mutation |
| AC3 | acceptance_criterion | pass | test | Both read change.data.deltas via activeStore.changes.get (disk-first, same path as adv_change_show/validate); no signals/mutation; function regardless of workflow reachability |
| AC4 | acceptance_criterion | pass | test | Registered in tool-registry, tool-role-policy (+allowlist), tool-catalog-entries, tool-arg-preflight, tool-title, banner, index allowlist, inventory baseline; 26 inventory tests + generate:manifests:check + schemas:check green |
| C1 | constraint | respected | static_check | No signals, reducers, or workflows.ts edits; no store schema change; no migration |
| C2 | constraint | respected | static_check | adv_delta_list returns summary rows only with default limit 25 / cap 100; never emits unbounded delta content |
| DONT1 | avoidance | respected | review | adv_change_show truncation behavior untouched |
| DONT2 | avoidance | respected | review | replaceRecoveryToolSprawl agent not interrupted; worktree-isolated; read-only change minimizes merge conflict |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-26c463a9c6b4 | AC1, AC2, AC3 |  | C1, C2, DONT1 |  |
| tk-a96ff5f1ee81 | AC4 |  | DONT2 |  |
