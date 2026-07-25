# Archive: Add Epic Timestamps

**Change ID:** addEpicTimestamps
**Archived:** 2026-07-25T19:28:57.864Z
**Created:** 2026-07-08T23:49:36.937Z

## Tasks Completed

- ✅ Add Epic timestamp spec law and regression expectations
  > Updated `rq-epicCliList01` and docs mirror to require Epic CLI JSON entries with present `startTime` field, ISO UTC when Visibility startTime is valid and `null` when invalid/missing. Added/updated regression expectations across Epic list tests. During same checkpoint, implementation files were updated to satisfy the new tests and a missing citation for existing `rq-epicSearchAttributeRepair01` was repaired.
- ✅ Implement rich Epic Visibility list helper
  > Implemented rich Epic Visibility listing via `listEpicWorkflows()` with `{ id, startTime }` entries, structural Date validation, null fallback, and existing query/prefix/limit behavior. Preserved `listEpicWorkflowIds()` as a compatibility wrapper for existing string-ID callers. Exported rich helper through the approved CLI Temporal boundary.
- ✅ Emit Epic startTime in CLI JSON payload
  > Updated CLI Epic list payload path to load rich Epic entries and emit `startTime` as ISO UTC string or `null`. Updated `bin/adv` to pass rich entries into the payload builder. Preserved fail-closed metadata for connection/list errors and root CLI source boundary through `plugin/src/cli/temporal-boundary.ts`.
- ✅ Run Epic timestamp compatibility verification
  > Ran final compatibility verification across CLI payload tests, Epic Visibility helper tests, CLI source-boundary guard, spec citation invariant, schema check, format check, typecheck, git whitespace check, and live CLI output. Initial format check failed on `list-epic-workflows.test.ts`; ran Prettier and reran format check green.

## Specs Modified


## Wisdom Accumulated

- **[pattern]** For CLI visibility-list enrichments, prefer adding a rich list helper plus preserving the existing ID-only wrapper. This avoids broad caller churn while letting CLI JSON carry native Temporal Visibility row fields such as startTime without hydration.
