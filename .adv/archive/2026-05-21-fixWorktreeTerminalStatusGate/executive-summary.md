## Outcome

The worktree-delete integration gate now treats both `archived` and `closed` as valid terminal states. Worktrees for changes ended via `/adv-cancel` (cancelled, superseded, not_planned) can be deleted with the same merged+clean discipline as archived changes. The failure-reason literal `change_not_archived` is renamed to `change_not_terminal` to reflect the widened semantics — this is a structural breaking change for any consumer matching the old literal (verified: zero internal callers).

## Success Criteria — Verification

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Closed change branch deletes when merged + clean | ✓ | `branch-integration.test.ts` "change closed (terminal, non-archived) → ok: true" passes; `index-delete.test.ts` "#55 follow-up deletes missing-registry CLOSED merged clean change branch without force" passes |
| 2 | Draft/pending/active still rejects with `change_not_terminal` | ✓ | `branch-integration.test.ts` "change not in terminal set (status=active)" passes with renamed reason; `index-delete.test.ts` "#55 follow-up blocks ... not in terminal state" passes |
| 3 | Existing archived-status tests pass with renamed reason | ✓ | Full suite: 2526 passed (baseline 2524 + 2 new closed-accept) |
| 4 | New test on both primary and drift-recovery paths | ✓ | Two new tests added, one per code path |
| 5 | `pnpm test` + `pnpm run check` green | △ | All gate-domain tests + typecheck + lint clean. Touched-file format clean. 5 pre-existing warp-workspace HTTP test failures + 3 pre-existing format warnings on baseline 8808dd0 are out of scope (captured in wisdom for follow-up) |

## What Was Built

- `plugin/src/utils/branch-integration.ts`: widened guard from `=== "archived"` to `∈ {"archived","closed"}`; renamed reason literal in union type and `fail()` call; updated detail/hint wording; refreshed header docstring.
- `plugin/src/tools/worktree/index.ts`: same widening + rename in `verifyMissingRegistryChangeBranchIntegration` (drift-recovery path); updated static fallback hint at the integration-required fail site; updated 4-case inline comment block; updated `appendDebugLog` message.
- `plugin/src/utils/branch-integration.test.ts`: new closed-accept test; renamed 3 assertion sites + 2 descriptions.
- `plugin/src/tools/worktree/index-delete.test.ts`: new closed drift-recovery accept test; renamed 3 assertion sites + 1 description.

## Invariants Preserved

- Condition B (merged into default branch) — closed branches with unmerged commits still fail with `branch_not_merged`.
- Condition C (clean worktree) — closed branches with dirty tree still fail with `worktree_dirty`.
- `opts.force` still does NOT bypass the integration gate.
- Registry-drift recovery ordering (case c before case d) unchanged.

## Follow-up Candidates (captured in wisdom)

- `ws-R3RNON`: `adv_change_close` errors with "workflow execution already completed" when the workflow is already terminated — should be idempotent and write the closed projection.
- `ws-dI_fYL`: 5 pre-existing warp-workspace HTTP test failures + 3 pre-existing format warnings on baseline 8808dd0, all unrelated to this change.

## Verification Commands

```
pnpm vitest run src/utils/branch-integration.test.ts src/tools/worktree/index-delete.test.ts  # 39/40 pass; 1 pre-existing warp failure
pnpm run typecheck                                                                            # clean
pnpm run lint                                                                                 # clean
rg "change_not_archived" plugin/src                                                           # zero matches
```