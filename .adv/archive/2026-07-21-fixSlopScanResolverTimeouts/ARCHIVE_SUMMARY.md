# Archive: Fix slop scan resolver and timeouts

**Change ID:** fixSlopScanResolverTimeouts
**Archived:** 2026-07-21T00:24:54.200Z
**Created:** 2026-07-20T23:55:41.636Z

## Tasks Completed

- ✅ Fix `nearestPackageRoot` in `bin/lib/slop-scan/scan.ts` to descend into immediate subdirectories of `repoRoot` when walking UP from the target fails to find a `package.json`.
  > Task checkpoint completed
- ✅ Raise `DEFAULT_SLOP_SCAN_CONFIG.ast_timeout_ms` in `bin/lib/slop-scan/config.ts` from `10000` to `30000`.
  > Task checkpoint completed
- ✅ Add regression test coverage to `bin/lib/slop-scan/scan.test.ts` for the resolver descent behavior.
  > Task checkpoint completed

## Specs Modified

