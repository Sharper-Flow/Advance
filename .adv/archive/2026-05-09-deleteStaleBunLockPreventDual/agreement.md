# Discovery Agreement

## Facts

- Issue #43 is open and labeled bug/priority:low.
- Project context and AGENTS.md state development commands use pnpm from `plugin/`.
- A stale `bun.lock` can create dual-lockfile drift in a pnpm-authoritative repo.

## Decisions

- Verify lockfile authority before deleting anything.
- If pnpm is authoritative and `bun.lock` is stale/unneeded, remove it and add prevention via ignore/docs/check as appropriate.
- Preserve package integrity by running relevant checks from `plugin/`.

## Risks / Unknowns

- Need git/file inspection to confirm `bun.lock` location and whether any Bun runtime tooling still depends on it.
- Deleting lockfile is a git mutation; must be backed by verification.

## Out of Scope

- Migrating package manager.
- Changing runtime from Bun to Node or pnpm-only runtime assumptions.