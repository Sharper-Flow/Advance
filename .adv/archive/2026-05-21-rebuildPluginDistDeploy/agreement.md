## Objectives

Make `scripts/deploy-local.sh` rebuild `plugin/dist` before rsyncing whenever source is newer than dist or dist is missing, and refuse to ship stale dist on build/freshness failure.

## Acceptance Criteria

1. Stale or missing `plugin/dist/index.js` triggers `pnpm run build` before rsync.
2. Fresh `plugin/dist/index.js` skips build and proceeds to rsync.
3. `--dry-run` announces the planned rebuild but does not execute `pnpm run build`.
4. Build failure exits non-zero with `refusing to deploy stale dist` and rsync does not run.
5. After build success, dist freshness is re-checked before rsync.
6. After successful deploy, runtime `plugin/dist/index.js` is at least as new as the youngest `plugin/src/**` file.
7. Tests cover freshness guard behavior, dry-run, failure abort, rsync suppression, check-mode placement, and warn-only removal.
8. Full verification passes: build, test, check, deploy dry-run, deploy fix, and runtime freshness assertion.

## Constraints

- Bash script only; no new dependencies.
- Must work when invoked directly, from hooks, or from worktrees.
- Must not auto-run `pnpm install`.
- Must fail loud instead of warning and syncing stale output.

## Avoidances

- Do not touch hook activation.
- Do not modify `plugin/package.json` build scripts.
- Do not replace deploy-local with a new build system.
- Do not change unrelated overlay/config sync behavior.