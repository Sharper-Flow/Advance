## Architecture

`deploy-local.sh` enforces plugin dist freshness at the runtime plugin deployment boundary. The freshness guard runs after `--check` has exited and after the source plugin directory guard, immediately before runtime plugin rsync.

```
parse flags / resolve paths
validate config
--check exits without mutation
verify source plugin directory exists
ensure_plugin_dist_fresh
  plugin_dist_stale_reason
    missing dist -> stale
    missing source dir -> stale/error
    source newer than dist -> stale
    otherwise fresh
  dry-run + stale -> report only
  real run + stale -> pnpm run build
  post-build stale -> refuse deploy
runtime plugin rsync
```

## Key Decisions

1. Freshness is enforced at deploy boundary; stale runtime copies are created only by deploy-local.
2. `--check` remains config-only and cannot run builds.
3. The source-dir guard runs before freshness checks.
4. Staleness uses mtime via `find "$ADV_SOURCE_PLUGIN_PATH/src" -type f -newer "$ADV_PLUGIN_DIST" -print -quit`.
5. Build failure and post-build freshness failure abort before rsync with `refusing to deploy stale dist`.
6. Candidate CWD asset roots must share the same git common dir as the script checkout before they can become the build source.
7. Tests include source-shape guards plus behavioral temp-worktree tests with fake `pnpm`/`rsync`.

## Affected Components

- `scripts/deploy-local.sh`
- `plugin/src/overlay-sync-assets.test.ts`

## Validator / Review Result

Design validator passed after placing the guard after `--check`. Acceptance review found issues in behavioral coverage, post-build validation, and CWD asset-root trust; all were remediated and re-verified.