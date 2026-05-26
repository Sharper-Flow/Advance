# Archive: Fix deploy backups

**Change ID:** fixDeployBackups
**Archived:** 2026-05-26T16:37:03.755Z
**Created:** 2026-05-26T16:19:33.728Z

## Tasks Completed

- ✅ Add prune_config_backups helper + integrate at end of --fix runs
  > Task checkpoint completed
- ✅ Reorder patch_config to detect drift before backup; skip backup on JSONC+no-drift
  > Task checkpoint completed
- ✅ Add fail-loud JSONC-drift path with exact diff + non-zero exit
  > Task checkpoint completed
- ✅ Surface JSONC drift in --check summary
  > Task checkpoint completed
- ✅ Final verification — all 6 success criteria
  > Task checkpoint completed

## Specs Modified

