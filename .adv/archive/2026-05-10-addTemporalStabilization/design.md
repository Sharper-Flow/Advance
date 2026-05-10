# Design: Issue #98 stabilization checklist update

## Strategy

Use GitHub issue #98 as the tracker surface. Add a compact, dated `## Stabilization tracker` block between `## Summary` and `## Evidence`. Preserve all existing prose; tracker block supplements existing `## Proposed exit criteria`, not replaces it.

## Tracker Shape

Bounded markers:

- `<!-- temporal-stabilization-tracker:start -->`
- `<!-- temporal-stabilization-tracker:end -->`

Header:

- `Last assessed: 2026-05-10 | Assessed by: adv_status health + manual review`

Each criterion gets:

- checkbox state: unchecked until fully satisfied for two consecutive weeks
- status label: `Blocked`, `Current OK — window pending`, or `Unknown / needs evidence`
- one evidence line with date and source
- one next-action line where useful

## Current Status Mapping

1. Zero Temporal-tagged fix archives for two weeks
   - Status: `Blocked — window not started`
   - Evidence: recent Temporal-related fixes/archives exist.
2. Zero search-attribute drift events
   - Status: `Current OK — window pending`
   - Evidence: `adv_status view:health` reports `search_attributes.ok:true`.
3. Zero `WorkflowUpdateFailedError` / `TMPRL1100` diagnose events
   - Status: `Current OK — window pending`
   - Evidence: current `last_error:null`, but open related issues remain.
4. Worker respawn-elect succeeds without approval
   - Status: `Unknown / needs evidence`
   - Evidence: not exercised in this session.
5. Concurrent-load benchmark N≥5 passes in CI
   - Status: `Unknown / needs CI evidence`
   - Evidence: benchmark existence known from issue text; current run not executed.
6. Cache-refresh invariant tests stay green for two weeks
   - Status: `Current OK — window pending`
   - Evidence: rq-cacheRefresh01 exists/enforced; two-week window not proven.

## Implementation Plan

- Fetch current issue #98 body.
- Insert or replace bounded tracker block.
- If markers absent, insert after `## Summary` section and before `## Evidence` heading.
- Use `gh issue edit 98 --body-file <temp>` to update issue.
- Verify via `gh issue view 98 --json body,state`.

## Safety / Drift Controls

- Do not close issue #98.
- Do not overwrite unbounded issue content.
- Do not remove existing `## Proposed exit criteria` prose section.
- Mark unknowns explicitly rather than claiming satisfied criteria.
- No repo code behavior changes.

## Validator Result

Independent validator verdict: `VALIDATED` with minor refinements applied:

- Exact marker placement anchor specified.
- Explicit `Last assessed` header added.
- Existing `## Proposed exit criteria` preservation documented.