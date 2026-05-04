## Goal

Split `plugin/src/types.ts` (1852 lines / 135 exports) into per-domain modules under `plugin/src/types/` with a barrel `plugin/src/types/index.ts` that preserves the existing public API (`from ".../types"` imports continue to work unchanged). Mechanical refactor, large diff, low semantic risk.

## What Changes

1. **Create `plugin/src/types/` directory** with per-domain files. Initial proposed split (subject to Discovery Agenda item D1):
   - `types/specs.ts` — `Priority`, `Scenario`, `Requirement`, `Spec`, `Dependency`
   - `types/tasks.ts` — `TaskStatus`, `Task`, `TaskType`, `Cancellation`, `TddPhase`, `TddPhaseEvidence`, `TddEvidence`, `TddReclassification`, `Attempt`, `ErrorRecovery`
   - `types/task-run.ts` — `TaskRunPhase`, `TaskRunRequiredNextAction`, `TaskRunEventType`, `TaskRunEvent`, `TaskRunState`
   - `types/changes.ts` — `Change`, `ChangeStatus`, `Gates`, `GateId`, `ReentryHistoryEntry`
   - `types/wisdom.ts` — `WisdomType`, `WisdomEntry`
   - `types/investment.ts` — `InvestmentReport`, `JudgmentCall`, `JudgmentCallCategory`, `ThresholdTier`
   - `types/project.ts` — `ProjectConfig`, `ProjectMetadataEntry`, `RelatedRepo`
   - `types/conformance.ts` — conformance-related schemas
   - `types/agenda.ts` — agenda-related schemas
   - `types/common.ts` — anything that doesn't fit cleanly elsewhere or is shared across multiple domains

2. **Create `plugin/src/types/index.ts`** as a barrel that re-exports every symbol from the domain files. Public API unchanged: `import { Change, Task, ... } from "../types"` continues to resolve via Node's directory-as-module (`types/index.ts`).

3. **Delete `plugin/src/types.ts`** after the directory is in place.

4. **Update `plugin/src/types.test.ts`** if it directly tests file-level structure (most likely it tests Schema parsing — no changes needed).

5. **Verify cross-cutting tests pass** without modification:
   - `plugin/src/manifest.test.ts`
   - `plugin/src/types.test.ts`
   - `plugin/src/temporal/workflow-bundle-boundary.test.ts` (CRITICAL — must still pass; types are allowed in workflow bundle)
   - Full `pnpm test` suite

## Success Criteria

- `plugin/src/types.ts` no longer exists; `plugin/src/types/` directory contains 7-10 domain files plus `index.ts`.
- Every import site that previously read `from ".../types"` continues to resolve identically (no import-site edits required outside `types/`).
- `pnpm test` passes with no test modifications outside `types/` and `types.test.ts`.
- `pnpm run check` (typecheck + isolation script + lint + format) passes.
- `pnpm run build` succeeds; `dist/index.js` byte size is comparable to baseline (±5%).
- `temporal/workflow-bundle-boundary.test.ts` continues to pass (no forbidden imports introduced via the split).
- No new circular dependencies between domain files (lint/typecheck would catch).
- Each domain file is < 400 lines (rough hygiene target; soft).
- PR diff isolates the move — git's `--find-renames` should detect each Schema cluster as a rename, keeping review surface tractable.

## Affected Code

- `plugin/src/types.ts` — deleted
- `plugin/src/types/` — new directory with `index.ts` + 7-10 domain files
- `plugin/src/types.test.ts` — relocated to `plugin/src/types/index.test.ts` if test file structure follows the source

No expected changes outside these paths.

## Related Repositories

None. Single-repo refactor.

## Constraints

- **× MUST NOT** change any exported Schema or Type's runtime behavior.
- **× MUST NOT** introduce imports from `storage/`, `tools/`, `tool-registry`, `plugin-init`, or `node:*` into any domain file (workflow-bundle constraint).
- **× MUST NOT** rename any exported symbol (104 import sites depend on stable names).
- Token-budget per file ≤ 400 lines (soft target; not a hard gate).
- Commit history should preserve renames so `git blame` survives.

## Impact

- **DX:** new types are easier to find, review, and extend.
- **PR review:** 135 schemas no longer collide in one file; per-domain edits stop touching unrelated changes.
- **Build:** no expected change (tsup bundles).
- **Tests:** no expected change (105 import sites resolve identically via barrel).
- **Workflow bundle:** verified safe via existing boundary test.
- **Establishes pattern:** unlocks the follow-on `change.ts` and `worktree/index.ts` splits.

## Context

- Today's session shipped 4 changes addressing related polish (audit findings on `/adv-improve`, `branch-integration` regex, `adv_change_archive worktreePath`, `adv_run_test timeoutMs`).
- The `/adv-improve polish` research pack at `docs/repo-improve-prep.md` (just-written) records this as the #1 recommendation with full evidence.
- Open questions in that pack:
  - Q1: Refactor sequencing for `types.ts` — split first by namespace (existing usage patterns) or by capability (matches `.adv/specs/` shape)?
  - Q2: Refactor pattern for the follow-on `change.ts` split — does this change's barrel approach scale?

## Discovery Agenda

Items deferred from Phase 1b knowledge-gap analysis for `/adv-discover` to resolve before design:

- **D1 — Optimal domain partitioning.** Should the split match `.adv/specs/` capability shape (specs/changes/tasks/gates/wisdom/agenda/conformance), or use some other axis (e.g. by Schema-name prefix clustering)? Evidence needed: dependency graph of current types.
- **D2 — Cyclic-dep risk.** Does `Change` reference `Task` reference `Change`? Need a dependency graph showing which Schema imports which before committing to a split. If cycles exist, may need a `types/common.ts` for shared types or merge two domains.
- **D3 — Token-budget constraint check.** Does `.opencode/token-budgets.json` apply to source files (not just command files)? If yes, what's the per-file budget for `types/*.ts`?
- **D4 — Test colocation policy.** Existing `types.test.ts` is at `src/types.test.ts`. Does it move to `src/types/index.test.ts`, or split per domain like the source? Repo convention: tests are colocated next to source.
- **D5 — Build size baseline.** Capture `dist/index.js` byte size before split as a regression check.

## Out of Scope (explicit)

- Splitting `change.ts` or `worktree/index.ts` (separate proposals; this change establishes the pattern).
- Adopting `errorClass` taxonomy across all `throw new Error` sites (REL1 from the improve scan).
- Console-to-logger consistency cleanup (OBS2 from the improve scan).
- Removing the legacy `db_dir` default (CQ3 from the improve scan).
- Renaming any types.
- Introducing a `types/index.ts` barrel that's anything other than pure re-exports.

## Scope

### In Scope

- Move every type/schema export from `plugin/src/types.ts` into a domain file under `plugin/src/types/`.
- Create `plugin/src/types/index.ts` barrel re-exporting all symbols.
- Delete `plugin/src/types.ts`.
- Relocate `plugin/src/types.test.ts` if needed for colocation.
- Run full verification: `pnpm test`, `pnpm run check`, `pnpm run build`, `workflow-bundle-boundary.test.ts`.

### Out of Scope

- Splitting other mega-files (`change.ts`, `worktree/index.ts`) — separate proposals.
- Renaming types or schemas.
- Modifying any non-types Schema validation logic.
- Changing `plugin/schemas/*.json` `$ref` stubs.
- Updating import sites (105 sites should resolve unchanged via the barrel).
- Adopting any other `/adv-improve` recommendation (REL1 errorClass, OBS2 console drift, CQ3 db_dir).