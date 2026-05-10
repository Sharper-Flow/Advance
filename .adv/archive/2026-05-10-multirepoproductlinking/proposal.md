# multiRepoProductLinking

## Intent

Investigate and design a model for linking multiple git repos into one logical ADV product so cross-cutting features (backend + multiple frontends) get tracked, wisdom-promoted, and reflected as a single unit while preserving per-repo git mechanics.

## Scope

### In Scope
- Product linking model for PokeEdge backend/frontend and future secondaries.
- Migration/adoption story for existing per-repo state.
- Product identity/state routing model.
- Per-change `scope_repos` semantics.
- Worktree/archive coordination across linked repos.
- Product-level wisdom/reflection.

### Out of Scope
- Replacing git.
- Monorepo migration.
- Cross-language refactor automation.
- Deployment orchestration after archive.

## Success Criteria

1. PokeEdge can declare `pokeedge` primary and `pokeedge-web` secondary using one config/tool path.
2. Cross-cutting change can be created once with `scope_repos: ["backend", "web"]` and seen from either repo.
3. Wisdom captured in one linked repo is visible from another linked repo without manual `target_path`.
4. Adding future secondaries requires only config declaration; no migration to existing primary state.
5. Existing single-repo projects continue unchanged.
6. `scope_repos` replaces manual ownership decisions for cross-cutting work.
7. `adv_status` from secondary shows scoped changes by default, product-wide explicitly.
8. Multi-repo archive bundle includes refs and verification evidence from every scoped repo.
