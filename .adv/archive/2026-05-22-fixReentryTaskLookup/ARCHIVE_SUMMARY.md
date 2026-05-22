# Archive: Fix reentry task lookup

**Change ID:** fixReentryTaskLookup
**Archived:** 2026-05-22T05:09:22.774Z
**Created:** 2026-05-22T04:29:45.039Z

## Tasks Completed

- ✅ Implement workflow-backed task-id lookup recovery.
  > Task checkpoint completed

## Specs Modified


## Wisdom Accumulated

- **[pattern]** For task-id-only tools, keep ownership recovery structural: fast-path task→change index/disk lookup, then fallback to typed workflow task arrays over active changes. Co-locate reverse-index hydration with workflow-state cache materialization (`setCachedChange`) so gate re-entry, task add refreshes, and other workflow reads maintain the same invariant.
- **[gotcha]** Task lookup stale-index fallback must handle both null fast-path results and thrown fast-path lookups; an unavailable old workflow can otherwise block structural live-state resolution before the fallback scan runs.
