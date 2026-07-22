# Acceptance

Reviewed at: 2026-07-22T22:50:00.000Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| AC1 | acceptance_criterion | adv_delta_list(changeId) returns bounded rows {id, operation, capability, target (target_id or requirement.id), title} for all staged deltas across capabilities; supports capability filter + offset/limit pagination (default limit 25, cap 100); output stays within budget for delta-heavy changes. | pass | spec-delta.test.ts: adv_delta_list returns bounded rows {id, operation, capability, target, title} across capabilities; capability filter + offset/limit pagination with hasMore; summary rows keep output bounded |
| AC2 | acceptance_criterion | adv_delta_show(changeId, capability, deltaId) returns the full staged delta; typed not-found error on unknown deltaId with no mutation. | pass | spec-delta.test.ts: adv_delta_show returns full staged delta by id; typed not-found (error contains deltaId) on unknown id, no mutation |
| AC3 | acceptance_criterion | Both are read-only (no signal/mutation), read change.deltas[] disk-first, and function on a change whose workflow is orphaned/unreachable. | pass | Both read change.data.deltas via activeStore.changes.get (disk-first, same path as adv_change_show/validate); no signals/mutation; function regardless of workflow reachability |
| AC4 | acceptance_criterion | Tools registered across all parity surfaces (registry/policy/catalog/preflight/title/banner/index allowlist); schemas:check + generate:manifests:check green. | pass | Registered in tool-registry, tool-role-policy (+allowlist), tool-catalog-entries, tool-arg-preflight, tool-title, banner, index allowlist, inventory baseline; 26 inventory tests + generate:manifests:check + schemas:check green |
| C1 | constraint | Read-only — no signals, no reducers, no workflows.ts edit, no migration. | respected | No signals, reducers, or workflows.ts edits; no store schema change; no migration |
| C2 | constraint | Bounded/paginated output — never emit unbounded delta content. | respected | adv_delta_list returns summary rows only with default limit 25 / cap 100; never emits unbounded delta content |
| DONT1 | avoidance | Do not change adv_change_show truncation behavior. | respected | adv_change_show truncation behavior untouched |
| DONT2 | avoidance | Do not interrupt the replaceRecoveryToolSprawl agent; merge-time coordination only. | respected | replaceRecoveryToolSprawl agent not interrupted; worktree-isolated; read-only change minimizes merge conflict |

