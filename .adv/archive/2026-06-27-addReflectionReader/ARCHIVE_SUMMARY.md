# Archive: Add reflection reader

**Change ID:** addReflectionReader
**Archived:** 2026-06-27T20:50:50.997Z
**Created:** 2026-06-27T18:14:11.454Z

## Tasks Completed

- ✅ Add bounded reflection list reader
  > Added read-only `adv_reflection_list` with bounded source-backed summaries, `count`/`total`/`omitted`, `byFrictionCategory`, exact `bySuggestion`, missing-file empty state, category/change/scope/max filters, and compact per-entry plane/friction/highlight/suggestion summaries. Tests cover bounded summaries and empty state.
- ✅ Add target_path routing for reflection list
  > Added target-path test for `adv_reflection_list` verifying it routes through `withOptionalTargetPathStore`, reads target store reflection paths, returns target entries, and includes untrusted read-only `_projectContext`. The reader implementation already uses target snapshot routing from the bounded reader task.
- ✅ Extend wisdom readers with target_path
  > Added optional `target_path` to `adv_wisdom_list` and `adv_project_wisdom_list`. Both readers now wrap read execution in `withOptionalTargetPathStore`, use `activeStore` for wisdom reads, project wisdom paths, product filtering, and append `_projectContext` for target reads while preserving existing output shapes. Added tests for target project wisdom and aggregate wisdom reads.
- ✅ Register reflection reader public tool surfaces
  > Registered `adv_reflection_list` in `createToolMap`, added it to `ADV_TOOL_NAMES`, frozen CLI bridge list, CLI surface matrix, and tool title mapping. Added registry regression proving the tool is present in `createToolMap` and `ADV_TOOL_NAMES`. Targeted registry/CLI contract tests pass.
- ✅ Verify reflection and wisdom reader compatibility
  > Verified reflection and wisdom reader compatibility. Targeted reflection/wisdom/storage/target-project/registry/CLI/title tests passed (97 tests across 10 files). `pnpm run check` passed after formatting. Acceptance reviewer then fixed one issue: `adv_wisdom_list` with `target_path + changeId` now stays on disk-snapshot store without live Temporal lookup; regression added. Reviewer verification passed wisdom-target tests, scoped reflection/wisdom/registry/CLI tests, and `pnpm run check`.

## Specs Modified


## Wisdom Accumulated

- **[pattern]** For read-only target_path tools, wrap the reader body in `withOptionalTargetPathStore`, use the active target store for all storage reads and product filtering, and append `_projectContext` only when target context exists. Do not add target confirmation fields for snapshot-only reads.
- **[gotcha]** For target_path snapshot readers with changeId filters, avoid live Temporal workflow lookup against the target project unless the target store is known live/current. Snapshot reads should stay on disk/store fallback so untrusted target reads remain read-only and service-independent.
