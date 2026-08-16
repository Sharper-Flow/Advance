## Problem

Archiving a change with zero spec deltas destroys the change record: `handlers-archive.ts` skips `archiveChange()` (the only bundle writer) when `deltas` is empty, reports synthetic success with an `archivePath` that was never created, then removes the active record. First observed on `restoreVendoredDesignSkills` (2026-08-16): shipped and pushed to trunk, but unresolvable by every post-archive surface.

## Root Cause Analysis

See problem-statement.md (persisted). Owning defect: delta-projection optimization wrongly scoped to skip bundle creation; `archiveChange` already handles empty deltas safely.

## Objectives

1. `adv_change_archive` MUST write a durable archive bundle (change.json sentinel + generated bundle files) for every archived change, regardless of delta count.
2. Remove the synthetic no-delta shortcut in both branches of the archive handler; route all archives through `archiveChange`.
3. Regression test: zero-delta archive produces a readable bundle with `status:"archived"`.
4. Repair the destroyed `restoreVendoredDesignSkills` record through the owning writer (schema-validated), restoring post-archive surfaces (show/list/reflect/worktree cleanup) — as a recovery run, not a new tool.

## Acceptance Criteria

- AC1: Given a change with `deltas: {}` completing all gates, when `adv_change_archive` runs, then `archive/<id>/change.json` exists, parses via ChangeSchema, and has `status: "archived"`.
- AC2: `adv_change_show` / `adv_change_list includeArchived` / `adv_reflect` resolve a zero-delta archived change (proven live on `restoreVendoredDesignSkills` post-repair).
- AC3: New regression test fails on the pre-fix handler (RED) and passes post-fix (GREEN).
- AC4: Targeted archive test files and `pnpm run check` are green; full suite shows no new failures.
- AC5: `change/restoreVendoredDesignSkills` worktree deletion succeeds via existing tools after repair.

## Constraints / Avoidances

- No new ADV tools or MCP surfaces (explicit user directive).
- Repair uses plugin's own storage/archive writers (`archiveChange`/`writeArchiveBundleFiles`), never hand-written state JSON.
- Do not resurrect the change as active/draft; it is archived and shipped.
- Preserve summary shard history; do not delete revisions.