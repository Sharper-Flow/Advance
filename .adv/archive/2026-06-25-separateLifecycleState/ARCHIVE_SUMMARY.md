# Archive: Separate lifecycle state

**Change ID:** separateLifecycleState
**Archived:** 2026-06-25T04:14:26.148Z
**Created:** 2026-06-25T02:03:54.951Z

## Tasks Completed

- ✅ Add lifecycle state types and normalization
  > Added `ChangeLifecycleStateSchema` / type and optional persisted `lifecycleState`; added workflow-state `lifecycleState`; added pure `normalizeChangeLifecycleState` mapping legacy `draft|pending|active` to `open` and terminals to themselves; initialized new workflows as open; carried lifecycle through seed and continue-as-new; updated terminal archive/close transitions to set lifecycle. Regenerated public change JSON schema.
- ✅ Add lifecycle Visibility projection and local migration/backfill
  > Added `AdvLifecycleState` as required Keyword search attribute; projected lifecycle from workflow state in `buildChangeSearchAttributes`; mapped lifecycle into Temporal Change read model and summary memo. Tests now cover registration, upsert projection, and Change read-model projection.
- ✅ Centralize lifecycle Visibility query helpers and update open-query consumers
  > Task checkpoint completed
- ✅ Fix worktree lifecycle queries for open owners
  > Task checkpoint completed
- ✅ Update worker-free CLI/status lifecycle rendering
  > Task checkpoint completed
- ✅ Update lifecycle specs and scenario tests
  > Task checkpoint completed
- ✅ Run lifecycle migration and query verification suite
  > Task checkpoint completed

## Specs Modified


## Wisdom Accumulated

- **[gotcha]** Adding fields to `ChangeSchema` requires regenerating public JSON schemas; otherwise broad `pnpm test` surfaces schema-registry drift even when the targeted lifecycle tests pass.
- **[pattern]** For lifecycle/open-state Visibility changes, add a new single-value Keyword search attribute and retain older attributes as compatibility projection; this avoids Temporal SQL Visibility remove/re-add remapping hazards while not consuming KeywordList slots.
