## Problem

`scripts/deploy-local.sh` could sync stale `plugin/dist/index.js` into the runtime plugin path when source files were newer than dist or dist was missing.

## Intent

Make deploy-local prove plugin dist freshness before runtime rsync: rebuild when dist is missing/stale, report without building in dry-run, and refuse to deploy if build/freshness cannot be proven.

## Scope

- `scripts/deploy-local.sh`
- `plugin/src/overlay-sync-assets.test.ts`

## Success Criteria

1. Missing or stale `plugin/dist/index.js` triggers `pnpm run build` before rsync.
2. Fresh dist skips rebuild and proceeds to rsync.
3. `--dry-run` reports the planned rebuild and does not execute it.
4. Build failure exits non-zero with `refusing to deploy stale dist` and rsync does not run.
5. A successful deploy leaves runtime `plugin/dist/index.js` at least as new as the youngest `plugin/src/**` file.
6. Tests cover stale detection, missing dist, fresh skip, dry-run, build failure abort, check-mode placement, and warn-only removal.
7. `pnpm run build`, `pnpm test`, `pnpm run check`, `deploy-local.sh --dry-run`, and `deploy-local.sh --fix` pass.

## Non-Goals

- Hook activation (`core.hooksPath`).
- Replacing deploy-local with a new build system.
- Auto-running `pnpm install`.
