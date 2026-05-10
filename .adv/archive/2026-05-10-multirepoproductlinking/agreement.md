# Discovery Agreement — Multi-Repo Product Linking

## Evidence

- ADV project identity is repo-bound via `plugin/src/utils/project-id.ts` and external state at `$XDG_DATA_HOME/opencode/plugins/advance/{project-id}/`.
- Existing cross-project model is contribution/provenance, not product grouping.
- `ProjectConfigSchema` has `related_repos[]`, but no `product` or `scope_repos` concept.
- PokeEdge backend and web have distinct project IDs, specs, active changes, archives, wisdom, and reflections.
- GitHub issue #59 is open and mirrors this change.

## Objectives

O1. Add product-level linking for repo families like `pokeedge` + `pokeedge-web` without breaking single-repo projects.
O2. Preserve per-repo git mechanics: branches, worktrees, commits, specs, verification, archive git finalization.
O3. Provide one canonical product-level place for active changes, archive metadata, wisdom, reflections, and status aggregation.
O4. Make per-change repo scope structural.
O5. Make PokeEdge adoption low-friction.
O6. Avoid split-brain state.
O7. Keep existing `target_path` for one-off/external coordination.

## Acceptance criteria

AC1. Product-link config exists with explicit primary/secondary declarations, Zod-validated.
AC2. Single-repo projects unchanged.
AC3. From `pokeedge-web`, ADV resolves canonical product state without manual `target_path`, while knowing current repo context for filtering.
AC4. Changes declare `scope_repos` structurally, validated against linked config.
AC5. `adv_status` from secondary defaults to changes scoped to that secondary, with explicit all-product mode.
AC6. Wisdom/reflection queries surface product knowledge and retain origin repo tags.
AC7. Multi-repo archive captures touched repo refs and verification evidence for every scoped repo.
AC8. Adoption handles existing state without mandatory immediate bulk migration; old state readable/recoverable.
AC9. Missing primary, corrupt state, partial migration, conflicting scope, and merge ordering are structurally handled.

## Out of scope

Monorepo conversion; cross-language refactor automation; global spec tree; advisory dependencies becoming blockers; deployment orchestration.
