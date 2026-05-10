# Design: Registry-drift-safe `change/*` worktree delete

## Strategy

Add a narrow recovery path inside `advWorktreeDelete` for missing-registry `change/<change-id>` branches.

Current branches with `registryEntry === undefined` and `opts.force === false` are routed to `verifyBranchIntegration`, which fails immediately with `branch_not_in_registry`. That makes the worktree registry a correctness gate. For `change/*` branches, recover structurally without registry membership:

1. Parse `changeId` with existing `inferChangeIdFromBranch(branch)`.
2. Require `deps.store`; read durable change state via `deps.store.changes.get(changeId)`.
3. Require loaded change status to equal `archived`.
4. Require branch to be merged into default branch with existing merged-branch check.
5. Continue through existing pre-hook clean check, hook execution, post-hook clean check, `git worktree remove`, registry cleanup, parent reap, and `worktreeDeletedSignal`.

## Validator Refinements

Independent validator verdict: `VALIDATED` with required refinements.

- Branching order MUST place `!registryEntry && inferredChangeId` before `!registryEntry && opts.force`. A `change/*` branch with an unarchived change must not fall through to merged-only force semantics.
- If `deps.store` is absent in the recovery path, fail closed with `INTEGRATION_REQUIRED` and reason `registry_drift_recovery_requires_store`.
- Existing delete-time signal dispatch can keep using `inferChangeIdFromBranch(branch)`; no signal rewrite needed.

## Why this shape

- Structural correctness: archived state comes from Store/Temporal, not branch-name heuristics alone.
- Registry remains bookkeeping, not sole correctness authority for safe cleanup.
- Existing #55 force path for non-ADV branches stays unchanged.
- Existing dirty checks stay centralized in `advWorktreeDelete`, so no second cleanup path can drift.
- Production `adv_worktree_delete` wrapper already passes `store`; tests can inject minimal store stub.

## Implementation Plan

1. Add helper near delete integration helpers:
   - `verifyMissingRegistryChangeBranchIntegration(branch, deps)`
   - returns `{ ok:true }` only when:
     - `inferChangeIdFromBranch(branch)` returns id
     - `deps.store` exists
     - `deps.store.changes.get(changeId)` succeeds and returns change with `status === "archived"`
     - `verifyNonAdvBranchIntegration(branch, deps)` confirms merged-to-default
   - failure reasons:
     - `registry_drift_recovery_requires_store`
     - `change_not_archived`
     - `branch_not_merged`
     - `git_failed`
2. In `advWorktreeDelete` integration branch:
   - compute `const inferredChangeId = inferChangeIdFromBranch(branch)`.
   - place `else if (!registryEntry && inferredChangeId)` before `else if (!registryEntry && opts.force)`.
   - call new helper.
   - on failure return `INTEGRATION_REQUIRED` with helper reason/hint.
   - on success append debug log for missing-registry change-branch recovery.
3. Keep `!registryEntry && opts.force` non-ADV behavior unchanged for non-`change/*` branches.
4. Extend `index-delete.test.ts` with RED/GREEN cases:
   - success: missing-registry `change/<id>`, store returns archived, merged branch, clean worktree, no force.
   - blocked: no store provided → `registry_drift_recovery_requires_store`.
   - blocked: store returns active/draft → `change_not_archived`.
   - blocked: archived but unmerged → `branch_not_merged`.
   - blocked: archived+merged but dirty without force → existing `UNCOMMITTED_WORK` after integration proof.
5. Run:
   - `pnpm exec vitest run src/tools/worktree/index-delete.test.ts src/utils/branch-integration.test.ts`
   - `pnpm run check`

## Risk Controls

- Fail closed if `deps.store` is unavailable.
- Only `change/*` branches with actual archived change state qualify.
- Do not skip merged-to-default check.
- Do not skip worktree clean checks.
- Do not delete bulk orphan worktrees as part of this change.