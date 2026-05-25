# Design

## Direction

Make `adv_change_archive phase9:"run"` the structural owner of release-gate completion for archive finalization. The tool already creates Phase 9 evidence; it should record and confirm the release gate before archiving/completing the change workflow and before worktree cleanup.

Independent design validator verdict: `PASS_WITH_NOTES`. Required adjustments incorporated below.

## Current Failure

Current command guidance says:

1. Run `adv_change_archive phase9:"run"`.
2. Only after Phase 9 succeeds, call `adv_gate_complete gateId:"release"`.

But `adv_change_archive` also transitions the change to `archived`, which completes/terminates the change workflow and runs worktree cleanup. After that, `adv_gate_complete release` can fail with `WorkflowNotFoundError` or target-path/worktree errors.

## Proposed State Machine

### Healthy direct/PR archive path

1. Preflight allows `release` pending when `phase9 !== "skip"` and all prior gates are done.
2. Write/reconcile archive bundle.
3. Run `finalizeRelease(...)`.
4. If Phase 9 blocks, return failure; do not complete release, archive status, or cleanup worktree.
5. If Phase 9 succeeds (`status:"shipped"` or `status:"pr_pushed"`):
   - fire `gateCompletedSignal` for `release` with `completedBy:"adv-archive"` using the same change workflow while it is still active;
   - include evidence summarizing finalization status, default branch, merge commit when available, push status, and main checkout;
   - poll/query until `gates.release.status === "done"` before proceeding. Signal acceptance alone is not enough because Temporal signals are accepted before handler completion;
   - if the workflow completes during confirmation, use the guarded disk-projection release recovery path with completed-workflow evidence.
6. Transition `change.status = "archived"` via existing `store.changes.save(change)` / archive signal.
7. Run source cleanup, worktree cleanup, linked issue closure, and report.

### Idempotent retry / repair path

When a retry sees an archive bundle and/or archived status but `release` is still pending:

1. Verify structural Phase 9 evidence from the main checkout without requiring the deleted change worktree:
   - direct mode: `verifyChangeBranchReachable(main, defaultBranch, changeId)` and `verifyDefaultBranchPushed(main, defaultBranch)`;
   - PR mode: `verifyChangeBranchPushed(main, changeId)`.
2. If evidence is missing, return the existing Phase 9-style blocker.
3. If evidence is present and the workflow is still active, signal `gateCompletedSignal` and poll until release is done.
4. If the workflow is completed/poisoned, write only the release-gate projection through a disk-direct recovery helper guarded by explicit recovery evidence. Do **not** reuse `completeGateViaRecovery` for archived retry.
5. If status is already `archived`, skip a second status save; otherwise archive status still follows release completion.

### Cleanup and output

- `removeChangeDir` and `advWorktreeCleanup` run only after release gate and archived status are durable, or are skipped/delayed if those state transitions fail.
- Cleanup failures remain warning-only after durable archive state is recorded.
- Successful archive output includes `continueFrom: { path: mainCheckout, branch: defaultBranch }`.
- Release-gate-blocked and recovery success outputs also carry `continueFrom` when finalization evidence is available.
- Command/report docs present terminal-neutral “Continue from: {mainCheckout} ({default-branch})” guidance and do not claim ADV changes the caller shell CWD.

## Implementation Notes

- Keep `adv_change_archive phase9:"run"` as the only normal-path owner of Phase 9 finalization and release gate recording.
- Use `completedBy: "adv-archive"` for archive-owned release gate completion.
- Normal path uses `gateCompletedSignal` + `querySignal`; recovery paths are reserved for completed/poisoned workflow repair.
- Disk-projection recovery writers must require an authorization reason/evidence so future call sites cannot bypass Temporal state accidentally.
- Do not introduce `defineUpdate` on the change workflow surface.

## Tests

- Add/extend archive Phase 9 tests for release signal before archived status save.
- Cover blocked finalization: no release signal, no status save, no issue closure.
- Cover existing-bundle/no-worktree retry with main-checkout reachability/push verification.
- Cover completed-workflow and mid-confirmation-poll release-gate recovery.
- Cover release-gate-blocked output carrying `continueFrom`.
- Cover disk-direct recovery writer authorization requirements.
- Keep targeted tests, `pnpm run check`, `pnpm run build`, full `pnpm test`, and strict ADV validation green.
