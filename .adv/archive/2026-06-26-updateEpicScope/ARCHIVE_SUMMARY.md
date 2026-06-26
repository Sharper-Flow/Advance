# Archive: Update epic scope

**Change ID:** updateEpicScope
**Archived:** 2026-06-26T23:12:19.188Z
**Created:** 2026-06-26T20:46:01.523Z

## Tasks Completed

- ✅ Spec/schema foundations for scoped and merged Epics
  > Added Epic `merged` status, `merged_into` schema, derived scope label helper, audited scope-update and merge signal payload schemas, spec requirements and docs mirrors for scope derivation, mutable scope, and active-Epic merge. Added tests covering merged status/progress, merged pointer parsing, scope-label derivation independent of legacy kind, and new signal payload schemas.
- ✅ Workflow/store/tool support for audited Epic scope mutation
  > Strengthened scope-removal guard for legacy linked entries and added reviewer hardening so stale `adv_epic_update_scope` versions return typed `stale_version` before scope-removal guard evaluation. Added regression coverage for both paths.
- ✅ Merge planning and execution for active duplicate Epics
  > Changed `adv_epic_merge` to preflight every unique change's child projection before mutating survivor, child membership, source unlink, or source finalization. Added regression test proving a later projection mismatch returns `PROJECTION_MISMATCH` with no survivor link, child membership update, source unlink, or markMerged calls.
- ✅ Epic rendering, command guidance, and next-work integration
  > Updated Epic rendering to include derived `scope_label` and `merged_into` in compact/full views, and to suppress `next_work` for merged sources structurally. Updated `/adv-epic` command guidance so overlap handling explicitly offers `adv_epic_update_scope` and dry-run-first `adv_epic_merge` before duplicate creation. Added tests for derived product-spanning labels from repo count, merged-source survivor pointer/no-next-work rendering, and command guidance anchors.
- ✅ Final verification and ADV validation
  > Verified change state with `adv_change_validate`, targeted Epic test suite, typecheck evidence from prior rendering verification, schemas check evidence from prior merge verification, and touched-file formatting. `bin/oc-test smoke` ran through schemas/typecheck/lint and failed only at `format:check` for unrelated pre-existing files `src/cli-bridge-contract.test.ts` and `src/tools/change.ts`, which are not in the current diff and were already reported before this task's changes.
- ✅ Post-rendering integration verification
  > Ran focused post-rendering integration tests covering Epic show/list rendering and `/adv-epic` command contract. Verified scope-label, merged-source no-next-work, compact/full show, list behavior, and command overlap guidance remain integrated after rendering changes.

## Specs Modified


## Wisdom Accumulated

- **[gotcha]** Adding a required method to `Store.epics` also requires updating the disk-only fallback in `plugin/src/storage/store-disk.ts`; Temporal overrides it, but typecheck enforces the full Store shape.
- **[pattern]** For Epic merge execution, preflight source/survivor versions and conflicts before any mutation, then mutate survivor/child/source in that order and pass source finalization the initial source version plus source-unlink count.
