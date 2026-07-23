# Contract Traceability

**Change ID:** addEpicListCircuitBreaker
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-23T19:42:54.418Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | store-types.ts:234 + changes.ts:650: store.changes.get(changeId, {context?}) forwards to getTemporalChange; omitted = fresh ctx. Backward-compatible (disk-store impls ignore param). |
| AC2 | acceptance_criterion | pass | test | tools/epic.ts convergeEpicOnShow builds one convergenceCtx threaded via loadChange; getTemporalChange short-circuits tripped members to disk+workflow_unresponsive (present, not unreachable). |
| AC3 | acceptance_criterion | pass | test | epics.test.ts list CB-trip regression: 5 hanging epics → queryMock called 3×, elapsed <6000ms (short-circuit after K=3). |
| AC4 | acceptance_criterion | pass | test | epics.ts tryQueryEpicStateRead: recordResponsiveMember on ok, recordUnresponsiveMember on timeout; not_found neutral (mirrors index.ts:901/939). |
| AC5 | acceptance_criterion | pass | test | tools/epic.ts buildFastFollowLineageMap: own ctx + short-circuit on isCircuitBreakerTripped()/isTemporalReadExpired(); per-id cache preserved. |
| C1 | constraint | respected | static_check | Reuses shipped TemporalReadContext CB + workflow_unresponsive; no second CB. |
| C2 | constraint | respected | static_check | Fix surface tools/+storage/store-temporal/ only; workflows.ts untouched; workflow-bundle-boundary.test.ts enforces. |
| C3 | constraint | respected | static_check | pnpm run check (incl typecheck, optional-param backward-compatible) + pnpm run build green. |
| DONT1 | avoidance | respected | review | getTemporalChange unchanged; only ctx plumbing added. |
| DONT2 | avoidance | respected | review | Existing store.changes.get callers omit ctx → fresh ctx, unchanged behavior. |
| DONT3 | avoidance | respected | review | Tripped members with disk projection → kind:present + workflow_unresponsive (convergeEpicMembership treats as present), not unreachable. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-e5b25a9933cd | AC3, AC4 |  |  |  |
| tk-39edca229cc8 | AC1, AC2, AC5 |  | C1, C2, C3, DONT1, DONT2, DONT3 |  |
