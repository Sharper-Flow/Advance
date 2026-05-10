# Design

## Implementation Plan

1. Inspect package-manager files and scripts to confirm pnpm lockfile authority and `bun.lock` staleness.
2. Add/update prevention mechanism if needed (`.gitignore`, docs, or check) so stale dual lockfile does not return.
3. Remove stale `bun.lock` only if confirmed safe.
4. Run dependency/check verification from `plugin/`.
5. Document evidence and any reason to retain `bun.lock` if deletion is unsafe.

## Planned Tasks

1. Verify package-manager authority and whether `bun.lock` is stale/unneeded; add failing drift-prevention check if appropriate.
2. Remove stale `bun.lock` or add explicit retention justification plus prevention against accidental dual-lock drift.
3. Run package/check verification and document lockfile policy evidence.

## Contracts

- Repository has one clear authoritative lockfile policy.
- No dependency state drift from removing stale file.
- Prevention exists against accidental stale dual-lockfile reintroduction.

## Test Strategy

- Structural/file-level check for dual-lockfile policy if feasible.
- `pnpm run check` from `plugin/` after mutation.
- Focused script/test if a prevention check already exists or is added.