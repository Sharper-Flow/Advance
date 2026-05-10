# Design

## Architecture Overview

Implement product-linked ADV state with two explicit identity planes:

```text
Repo identity plane                         Product state plane
──────────────────                          ───────────────────
repo_project_id = git root SHA              product_project_id = primary repo SHA
- specs                                      - product changes
- worktrees                                  - agenda / wisdom / reflections
- git refs / branches / archive commits      - product-level status aggregation
- per-repo verification                      - scope_repos filtering
```

PokeEdge v1 topology is strict N:1: `pokeedge` backend primary, `pokeedge-web` secondary. Single-repo projects omit product config.

## Key Decisions

1. Keep `getProjectId()` repo-local; add product resolver above it.
2. Use root `project.json`; add small `product` block and reuse `related_repos` as linked repo registry.
3. Add `resolveProductContext(root)` with single_repo/primary/secondary modes and missing-primary policies (`block` default).
4. Product-state store uses `productProjectId`; repo-local tools use `repoProjectId`. Secondary init must ensure primary product Temporal queue. Product workflow IDs share primary namespace.
5. Add structural `scope_repos` to changes; default linked creates to current repo; explicit cross-cutting scopes validate against product context.
6. Status/list from secondary defaults to current repo scope; product-wide mode explicit.
7. Wisdom/reflection get origin repo tags and product query filters.
8. Migration is additive: new linked changes use product state; existing per-repo state remains readable; bulk migration deferred.
9. Multi-repo archive runs all repo preflights before any merge and records per-repo refs/evidence.

## Implementation Strategy

1. Product config schemas and resolver.
2. Plugin init/store routing with product context and Temporal queue serviceability.
3. `scope_repos` schema and create/list/show/status semantics.
4. Wisdom/reflection origin tags and product filters.
5. Multi-repo archive bundle/preflight support.
6. Specs, command docs, PokeEdge examples.

## LBP Analysis

Two-identity model is best long-term because one ID must not mean both repo and product. Product topology becomes explicit and machine-validated; repo-local mechanics remain safe. Reusing `related_repos` avoids duplicate repo registries.

## Affected Components

`plugin/src/types/project.ts`, `plugin/src/storage/json.ts`, `plugin/src/utils/project-id.ts`, `plugin/src/plugin-init.ts`, `plugin/src/storage/store.ts`, `plugin/src/types/changes.ts`, `plugin/src/tools/change.ts`, `plugin/src/tools/status.ts`, wisdom/reflection tools, worktree tools, archive, specs, command docs.

## Risks / Mitigations

- Split-brain primary missing → default block.
- Worktrees keyed by product id → repoProjectId tests.
- Secondary status noise → scoped default.
- Existing state disappears → additive adoption.
- Multi-repo partial merge → all-repo preflight before any merge.
- Scope drift → structural `scope_repos` validation.
- Wisdom contamination → origin tags.

## Validator Result

Validator verdict: CAUTION. Findings resolved inline: documented Temporal queue coupling and replaced duplicate `product.repos[]` with product metadata + existing `related_repos` registry. No spec conflicts found.
