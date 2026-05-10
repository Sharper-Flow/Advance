# Delete stale bun.lock and prevent dual lockfile drift

## Intent

Resolve bug #43: remove stale `bun.lock` if the project uses pnpm as the authoritative package manager, preventing dual-lockfile drift.

## Scope

- Verify package-manager authority and whether `bun.lock` is stale/unneeded.
- Add/update ignore or documentation if needed to prevent reintroducing stale Bun lockfiles.
- Remove stale lockfile if confirmed safe.
- Run package/check verification to ensure dependency state remains stable.

## Success Criteria

- Repository has one authoritative lockfile policy.
- Stale `bun.lock` is removed or explicitly justified if retained.
- Drift prevention exists via docs/ignore/check as appropriate.
- Relevant checks pass.