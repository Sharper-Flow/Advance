# Proposal: retireLegacyStorageBackend

**Change type:** refactoring / dead-code removal
**Suggested ID:** `retireLegacyStorageBackend`
**Proposed gate on creation:** `proposal` (this file is ready to paste into `adv_change_create`)

---

## Why

The Temporal cutover (archived `migrateAdvStateTemporalRetire`, 2026-04-21) shipped Temporal as the default production storage backend but explicitly **skipped Phase D step D2** — the legacy JSON+SQLite backend modules. ~4032 LOC of legacy storage code still ships in `plugin/src/storage/`, `store-temporal.ts` contains 19 `isExpectedFallbackError` branches that fall back to legacy on Temporal errors, `store.ts` still always builds the legacy backend first before wrapping it with Temporal, and two env bypass flags (`ADV_DISABLE_TEMPORAL=1`, `ADV_ALLOW_DEGRADED_FALLBACK=1`) still route execution to the file-backed store.

This violates the single-source-of-truth cutover stated in the original proposal ("no permanent dual-track backend"). Every storage op carries a dual-path cost. The "legacy as test harness substrate" justification in the D4 commit notes has become a workaround, not an architectural choice — tests should run against the real store or a purpose-built fake, not a parallel production-grade backend.

Completing the cutover:
- Removes ~4000 LOC of unused production code
- Eliminates 19 silent-fallback-to-legacy error paths that can mask Temporal issues
- Simplifies `store.ts` from a 61-line dual-selector to a thin Temporal re-export
- Reduces maintenance burden (every legacy file needs updates when schemas change)
- Removes two env-flag escape hatches that accidentally gate distribution

## What Changes

### Delete outright (confirmed by Phase 1b import analysis)

- `plugin/src/storage/store-legacy.ts` (348 LOC) — only used by `store.ts`
- `plugin/src/storage/store-sync.ts` (360 LOC)
- `plugin/src/storage/store-changes.ts` (319 LOC)
- `plugin/src/storage/store-tasks.ts` (363 LOC)
- `plugin/src/storage/store-gates.ts` (136 LOC)
- `plugin/src/storage/store-context.ts` (100 LOC)
- `plugin/src/storage/store-specs.ts` (86 LOC) — see scope check: spec files remain in-repo, so `loadSpec`/`saveSpec` may still be needed via `json.ts`
- `plugin/src/storage/store-locks.ts` (122 LOC)
- `plugin/src/storage/gate-reentry.ts` (69 LOC)
- `plugin/src/storage/corruption-recovery.ts` (82 LOC)
- `plugin/src/storage/migrate.ts` (125 LOC) — only `worktree-integration.test.ts` uses it
- Corresponding `*.test.ts` files

### Partial delete / trim

- **`plugin/src/storage/json.ts` (736 LOC)** — **keep** spec + path helpers used by Temporal-path code (`getProjectPaths`, `listSpecDirs`, `listChangeDirs`, `loadSpec`, `saveSpec`, `loadAllSpecs`, `loadProposalWithFallback`, `fileExists`, `loadProjectConfig`, `saveProjectConfig`). **Delete** legacy-change file-IO (`loadChange`, `saveChange`, `loadAllChanges`, `createChangeScaffold`, `updateChangeArtifacts`, `resolveChangeId`). Exact split to be confirmed in discovery.
- **`plugin/src/storage/sqlite.ts` (1186 LOC)** — discovery-gated. If wisdom FTS stays on SQLite as a derived cache, keep; if moves to a Temporal workflow query, delete. Do **not** assume either without a design decision.

### Rewrite

- **`plugin/src/storage/store-temporal.ts` (692 LOC)** — remove all 19 `isExpectedFallbackError` fallback branches; drop the `legacy: Store` constructor parameter; replace fallback-on-not-found with explicit error surfaces. This is the largest semantic change — a fallback that silently ran against legacy must now either surface a proper `CHANGE_NOT_FOUND` error or fail-fast. Per-site audit required.
- **`plugin/src/storage/store.ts` (61 LOC)** — reduce to a thin ~10-line re-export of `createTemporalStoreBackend`. No more dual-backend selector.

### Remove

- `plugin/src/plugin-init.ts` — delete `temporalDisabled` (ADV_DISABLE_TEMPORAL) check and `ADV_ALLOW_DEGRADED_FALLBACK` branch
- `plugin/src/temporal/runtime-manager.ts` — remove `ADV_ALLOW_DEGRADED_FALLBACK` + `ADV_DISABLE_TEMPORAL` from environment allowlist and remediation message
- Remove env-flag references from `SETUP.md`, `docs/temporal-recovery.md`, related tests (`plugin-init.test.ts`, `plugin-init-worker-cleanup.test.ts`, `index.test.ts`)

### Update

- Dependent callers in `tools/status.ts`, `tools/gate.ts`, `tools/temporal-ops.ts`, `tools/change.ts` — repoint any legacy-specific `json.ts` imports to retained helpers or the store interface
- Test harness: `plugin/src/__mocks__/`, `plugin/src/__tests__/setup.ts` — replace legacy-store fixtures with Temporal-backed fixtures or purpose-built fakes
- `AGENTS.md` storage section — remove any mention of dual-backend
- `project.md` — same

## Success Criteria

1. **No production reference to deleted modules** — `grep` for imports of `store-legacy`, `store-sync`, `store-changes`, `store-tasks`, `store-gates`, `store-context`, `store-locks`, `gate-reentry`, `corruption-recovery`, `migrate`, and legacy-specific `json.ts` exports returns zero hits in `plugin/src/**/*.ts` (excluding `__tests__/` harness if explicitly kept).
2. **`store-temporal.ts` has zero `isExpectedFallbackError` references** — the classifier is gone; errors surface or are re-classified via the new taxonomy.
3. **`store.ts` ≤ 20 lines** — trivial re-export, no selector logic.
4. **Env flags gone** — `grep ADV_DISABLE_TEMPORAL` and `grep ADV_ALLOW_DEGRADED_FALLBACK` return zero hits outside archived changes / changelog.
5. **Full regression green** — `pnpm run check` (typecheck + eslint + prettier) + `pnpm test` (all 1784+ tests) + `pnpm run build` all pass.
6. **Migration ledger re-verified** — pre-archive: all active local projects show `status: done` in migration ledger. If any project hasn't been migrated, archive blocks.
7. **No new warning on boot** — plugin init does not emit any "falling back to file-backed" log line (because that code path no longer exists).
8. **Strict change validation passes** — `adv_change_validate strict: true` passes.

## Affected Code

```
plugin/src/storage/          [13 files deleted, 2 rewritten, 1 trimmed]
plugin/src/plugin-init.ts    [remove env bypass branches]
plugin/src/temporal/
  runtime-manager.ts         [remove env flag references]
plugin/src/tools/
  status.ts, gate.ts,        [repoint imports if needed]
  temporal-ops.ts, change.ts
plugin/src/__mocks__/        [replace legacy mocks]
plugin/src/__tests__/setup.ts [update fixtures]
SETUP.md                     [env flag docs removed]
docs/temporal-recovery.md    [env flag reference removed]
AGENTS.md                    [storage section update]
project.md                   [storage section update]
.github/workflows/ci.yml     [no change expected, verify]
```

## Related Repositories

- None. Contained entirely within `advance` repo.

## Constraints

- **No permanent dual-track** — this is the completion of the cutover, not a new parallel path.
- **Temporal workflow logic unchanged** — this change does not modify any workflow definitions, activities, queries, or updates.
- **Spec laws unchanged** — no edits to `.adv/specs/advance/spec.json`.
- **No new product features.**
- **Bun host story preserved** — out-of-process Node worker + `ADV_NODE_PATH` remains the Bun path. Only the file-backed-fallback escape hatch is removed.
- **Migration ledger gate is hard** — cannot ship until every active local project directory has `MigrationLedgerEntry.status = done`.
- **SQLite FTS fate requires discovery decision** before any `sqlite.ts` work.

## Impact

| Surface | Impact |
|---------|--------|
| Users currently relying on `ADV_DISABLE_TEMPORAL=1` | **Breaking** — no more fallback. Must run Node or a Node-PATH-capable environment. Must be called out in CHANGELOG + upgrade notes. |
| Users currently relying on `ADV_ALLOW_DEGRADED_FALLBACK=1` | **Breaking** — same as above. |
| Users on a Temporal-incompatible Bun version with no Node installed | **Breaking** — installation instructions must be tightened. |
| Test run time | Likely unchanged or faster (one fewer backend to build per test). |
| Ship weight | ~4000 LOC smaller. |
| Error diagnosability | **Better** — silent fallback to legacy no longer masks Temporal errors. |

## Context

- Parent change: archived `migrateAdvStateTemporalRetire` (2026-04-21). Phase D step D2 explicitly skipped ("⏭️ D2: Delete legacy storage backend modules").
- Agenda item: `ag-JP4Qq26M` (Temporal cutover tidy follow-up) mentions centralizing `isExpectedFallbackError` taxonomy as a prerequisite — this proposal absorbs that subtask since the classifier should be deleted, not centralized.
- Related wisdom: `ws-Q0_dA9` (Resume preconditions for migrateAdvStateTemporalRetire) — still relevant for pre-flight migration ledger verification.
- No related active 6/7-gate change. `purgeRetiredLegacyArtifacts` (archived 2026-04-10) handled retired *command/spec* artifacts, not storage backend.

## Discovery Agenda

Explicit inputs for `/adv-discover`:

1. **Published-consumer compatibility** — is anyone running an older plugin version reading `.adv/` on-disk state that could be broken by this change? Need an explicit compatibility stance (hard break, grace period, migration helper).
2. **Env flag deprecation window** — immediate removal of `ADV_DISABLE_TEMPORAL` + `ADV_ALLOW_DEGRADED_FALLBACK`, or grace period with deprecation warning before removal? If grace period, define the window.
3. **SQLite FTS fate** — does wisdom search stay on SQLite (as a derived cache rebuilt from Temporal state on boot) or move to a Temporal workflow query? This decision drives `sqlite.ts` stay/delete.
4. **Test harness file-backed path** — D4 preserved legacy for "test harness internals." Is that still justified, or do we replace test fixtures with a purpose-built fake / Temporal TestWorkflowEnvironment fixture?
5. **19 `isExpectedFallbackError` sites review** — per-site audit: which represent genuine transient Temporal errors that need dedicated classification (`WorkflowNotFound` vs. `CHANGE_NOT_FOUND`), which are pure legacy-fallback dead code?
6. **`json.ts` split** — confirm exact export list kept (spec + paths) vs. deleted (change file-IO) via grep + compile check.
7. **Migration ledger re-verification trigger** — does this change need to run the migration sweep again pre-archive, or rely on the Apr 21 dogfood run being still valid? Define the pre-archive check.

## Non-Goals

- Preserve legacy backend "just in case."
- Rewrite Temporal workflow definitions.
- Change spec laws.
- Introduce new product features.
- Reduce or change the Bun out-of-process worker path.
- Expand operator runbook (tracked separately as `ag-JP4Qq26M`).
- Centralize `isExpectedFallbackError` taxonomy (moot — the classifier is being deleted, not refactored).
