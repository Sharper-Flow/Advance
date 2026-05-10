# Archive: Delete stale bun.lock and prevent dual lockfile drift

**Change ID:** deleteStaleBunLockPreventDual
**Archived:** 2026-05-09T21:31:42.551Z
**Created:** 2026-05-09T02:47:08.279Z

## Tasks Completed

- ✅ Verify package-manager authority and whether bun.lock is stale/unneeded; add failing drift-prevention check if appropriate.
  > Verified plugin has no tracked bun.lock, uses plugin/pnpm-lock.yaml in CI/release, and package scripts are pnpm-based. Added a failing-first Vitest coverage path and CI check script that rejects bun.lock/bun.lockb beside authoritative plugin/pnpm-lock.yaml; initial focused test failed because the guard did not exist, then passed after implementation.
- ✅ Remove stale bun.lock or add explicit retention justification plus prevention against accidental dual-lock drift.
  > No tracked bun.lock existed to delete. Added explicit stale Bun lockfile prevention by ignoring plugin/bun.lockb in addition to plugin/bun.lock, documenting pnpm/pnpm-lock authority in project.md, and wiring scripts/check-lockfile-policy.ts into pnpm run check so accidental Bun lockfiles fail CI.
- ✅ Run package/check verification and document lockfile policy evidence.
  > Task checkpoint completed

## Specs Modified


## Wisdom Accumulated

- **[pattern]** Lockfile drift prevention can be structural: CI already treats plugin/pnpm-lock.yaml as authoritative via setup-node cache and frozen pnpm install, so add a small check script that fails if bun.lock/bun.lockb appears beside pnpm-lock.yaml rather than relying only on .gitignore.
