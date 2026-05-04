# Design

## Architecture Overview

This change cleans up foldering by centralizing path resolution and making cleanup explicit, dry-run-first, and test-covered.

Architecture moves:
1. Path resolver consolidation in `plugin/src/utils/project-id.ts`.
2. External-state path completeness via `ProjectPaths.reflections` and removal of physical `ProjectPaths.db`.
3. Read-boundary canonicalization for archive listing by `change.json.id`.
4. Dry-run hygiene plane for existing disk debt; current-test-run cleanup only for owned artifacts.

## Key Decisions

### KD-1 — Keep worktrees in sibling layout, but XDG-compliant

Add `getWorktreeBase(projectId)` returning `join(getDataHome(), "opencode", "worktree", projectId)`. `getDataHome()` obeys XDG: absolute `XDG_DATA_HOME` if set, unset/empty fallback to `~/.local/share`, relative values rejected for mutating ADV paths.

### KD-2 — Add `ProjectPaths.reflections`, drop physical `ProjectPaths.db`

`ProjectPaths.reflections` resolves external to `{ext}/reflections.jsonl`; legacy fallback remains `{root}/.adv/reflections.jsonl`. `ProjectPaths.db` is removed from runtime physical allocation. `ProjectConfigSchema.db_dir` remains accepted as deprecated compatibility unless implementation proves safe hard removal.

### KD-3 — Reflection migration is idempotent and non-destructive

Migration handles nested-only, flat-only, and both-exist states. If both exist, merge JSONL by stable `id` when present, else `(change_id, created_at)`; newest duplicate wins; write flat atomically; delete nested only after successful write. Malformed-line policy must be chosen and tested during prep.

### KD-4 — Synthetic cleanup has two tiers

Current test-run artifacts may auto-clean if tagged with a current-run marker. Pre-existing artifacts are only reported dry-run unless user explicitly approves deletion.

### KD-5 — Empty parent reaping is bounded by computed worktree root

After successful `gitWorktreeRemove()`, remove empty parents one level at a time until `getWorktreeBase(projectId)` exclusive. Stop on `ENOTEMPTY`, permission error, or path escape. Never recursive-delete.

### KD-6 — Archive list canonicalization happens before final return

Build an archive-bundle index by reading each bundle `change.json.id`. `listResolvedChanges()` uses canonical archive IDs, loads archive-only records by bundle path, and de-dupes final results by `Change.id`. For duplicate terminal archives, prefer newest bundle by date/mtime.

### KD-7 — Disk hygiene is read-only by default

`adv_status view:"hygiene"` reports synthetic counts and current-project dead artifacts, never deletes.

### KD-8 — Path guards become shared resolver invariants

Centralize `getDataHome()` and namespace guards. `getExternalRoot()` is explicitly refactored to call `getDataHome()` so external-state paths and worktree paths share identical XDG semantics and relative-path rejection. Apply same helper to `getWorktreeBase()` and reflection migration.

## Implementation Strategy

1. Resolver/path shape: add XDG helpers and update `getExternalRoot()`, worktree state/index/migration hardcoded paths.
2. Reflections/db: add `ProjectPaths.reflections`, update reflection tool calls, add migration helper, remove physical `db` path allocation while preserving `db_dir` config compatibility.
3. Worktree cleanup: add bounded `removeEmptyParents()` and tests.
4. Synthetic cleanup/hygiene: add Vitest global setup/teardown marker model and read-only hygiene scanner.
5. Archive canonical listing: add archive bundle index and final `Change.id` de-dupe.
6. Docs: update AGENTS, project.md, SETUP, ADV_INSTRUCTIONS, and any changelog convention.

## LBP Analysis

Official XDG spec requires `$XDG_DATA_HOME` semantics and absolute env paths. Official Vitest docs support global setup/teardown for run-level cleanup. ADV best practice favors single resolver modules, dry-run-first destructive workflows, and canonical identity at read boundaries.

## Affected Components

`utils/project-id.ts`, `storage/json.ts`, `storage/reflection.ts`, `tools/reflection.ts`, `tools/worktree/state.ts`, `tools/worktree/index.ts`, `tools/worktree/migration.ts`, `tools/status.ts`, `storage/store-temporal/index.ts`, `types.ts`, `vitest.config.ts`, test setup, docs.

## Risks / Mitigations

| Risk | Mitigation |
|---|---|
| Accidental deletion in XDG tree | Dry-run first; current-run marker required for auto-clean |
| Existing `project.json` with `db_dir` fails | Keep schema field accepted/deprecated |
| Worktree path move breaks live sessions | No path move; sibling shape preserved |
| Archive de-dupe hides legitimate duplicate archives | Tie-breaker documented and tested |
| Reflection migration loses malformed JSONL | Decide preserve-vs-skip policy in prep; test explicitly |

## Validator Result

Verdict: CAUTION, resolved inline.

- Correctness caution: validator confirmed F9 archive-listing bug and requested explicit `getExternalRoot()` refactor to shared `getDataHome()` so existing external-state paths gain relative-XDG rejection too. Resolved in KD-8 and Implementation Strategy.
- Simplicity: no materially simpler approach found.
- Spec compliance: no contradictions; design supports `rq-synthstate01` and `rq-archiveRetirement01`.
- Alternatives: parsing archive directory names rejected because change IDs may contain dashes; reading `change.json.id` is correct.
