# Executive Summary — rebuildPluginDistDeploy

## Outcome

`scripts/deploy-local.sh` now proves plugin dist freshness before runtime rsync. Stale or missing `plugin/dist/index.js` triggers an automatic `pnpm run build` from the script's own checkout; failure aborts the deploy with `refusing to deploy stale dist` and rsync is suppressed. Dry-run reports the planned rebuild without executing it. The previous warn-only pre-flight is removed.

## What Was Built

- `ADV_PLUGIN_DIST` constant and `plugin_dist_stale_reason()` helper centralize missing/stale detection (`find -newer plugin/src` vs `plugin/dist/index.js`).
- `ensure_plugin_dist_fresh()` runs after the `--check` early exit and source-dir guard, immediately before plugin rsync. It:
  - validates that the candidate CWD asset root shares the same git common dir as the script checkout before invoking build commands (prevents accidental builds in unrelated worktrees),
  - reports planned rebuilds in dry-run without executing,
  - executes `(cd "$ADV_SOURCE_PLUGIN_PATH" && pnpm run build)` in real deploy modes,
  - re-checks dist freshness after a successful build and refuses rsync if still stale.
- Test coverage in `plugin/src/overlay-sync-assets.test.ts` covers stale detection, missing dist, fresh skip, dry-run no-build messaging, build-failure abort with rsync suppression, successful fake-build path, call-site placement, and warn-only removal (19 assertions across the asset suite).

## What Was Verified

- `pnpm run build` — pass
- `pnpm test` — pass (1356+ tests including 19 freshness-guard assertions)
- `pnpm run check` (typecheck + lint + format:check) — pass
- `bash -n scripts/deploy-local.sh` — pass
- `scripts/deploy-local.sh --dry-run` — reports planned rebuild, no build executed
- `scripts/deploy-local.sh --fix` — builds when stale, leaves runtime `plugin/dist/index.js` at least as new as youngest `plugin/src/**` file (runtime freshness assertion passed)
- Review verdict: APPROVED after one remediation cycle (added behavioral guard tests, post-build re-check, same-git-common-dir CWD guard)
- `adv_change_validate` — warnings only (NO_DELTAS; expected — script change, no spec delta)

## Acceptance Criteria Status

All seven success criteria from the proposal are satisfied (missing/stale rebuild, fresh skip, dry-run report-only, build-failure abort, post-deploy runtime freshness, test coverage breadth, full verification suite green).

## Remaining Concerns

None. Working tree clean at execution close.

## Wisdom Captured

- Deploy-local asset tests spawn the real script against the checkout that owns it. Once dist auto-builds, fresh-checkout tests pay the real build cost; temp-worktree tests for unrelated path/config behavior must seed a fresh `plugin/dist/index.js` fixture to avoid testing build availability.
- `pnpm exec vitest run <file>` is more reliable than `pnpm test -- <file>` for focused verification in this repo; the script form can behave like a broad suite run and surface unrelated integration prerequisites.
