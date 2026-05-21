# Archive: Rebuild plugin dist before deploy

**Change ID:** rebuildPluginDistDeploy
**Archived:** 2026-05-21T04:34:20.890Z
**Created:** 2026-05-20T18:49:12.804Z

## Tasks Completed

- ✅ Add deploy-local freshness guard tests
  > Added source-level asset tests to `plugin/src/overlay-sync-assets.test.ts` covering freshness helper existence, mtime staleness check, pnpm build invocation, call placement after check/source guard and before rsync, dry-run messaging, missing/stale reasons, and removal of warn-only behavior.
- ✅ Implement deploy-local dist freshness guard
  > Added `ADV_PLUGIN_DIST` and `ensure_plugin_dist_fresh()` to `scripts/deploy-local.sh`. The helper detects missing dist and source-newer-than-dist via `find -newer`, reports planned rebuilds during dry-run, runs `(cd "$ADV_SOURCE_PLUGIN_PATH" && pnpm run build)` in real deploy modes, and exits before rsync with `refusing to deploy stale dist` on build failure. The call site is after the `--check` exit and source-dir guard, immediately before plugin rsync. Updated asset tests to allow the first fresh-checkout build and seed temp-worktree dist for unrelated worktree-path assertions.
- ✅ Run full verification and deploy smoke checks
  > Extended verification/remediation after review findings: deploy-local now validates candidate CWD asset roots share the same git common dir as the script checkout before executing build commands; `plugin_dist_stale_reason()` centralizes missing/stale checks; `ensure_plugin_dist_fresh()` re-checks dist after successful build and refuses rsync if still stale. Added behavioral tests that exercise dry-run no-build, build failure abort/rsync suppression, and successful fake build before rsync.

## Specs Modified


## Wisdom Accumulated

- **[gotcha]** Deploy-local asset tests spawn the real script against the checkout that owns the script. Once deploy-local auto-builds missing/stale plugin/dist, fresh-checkout tests may pay the real build cost, and temp worktree tests that validate unrelated path/config behavior should seed a fresh `plugin/dist/index.js` fixture to avoid accidentally testing dependency/build availability.
- **[gotcha]** For focused Vitest verification in this repo, `pnpm exec vitest run <file>` is more reliable than `pnpm test -- <file>`; the package-script form can still behave like a broad suite run under the current pnpm/vitest invocation and surface unrelated integration prerequisites.
