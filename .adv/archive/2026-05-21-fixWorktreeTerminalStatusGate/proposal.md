## Intent

Fix the worktree-delete integration guard to treat both `archived` and `closed` change statuses as valid terminal states ("nothing to integrate"). Currently the guard hard-rejects with `INTEGRATION_REQUIRED / change_not_archived` for any non-archived status, including `closed` (cancelled, superseded, not_planned). `force: true` does not bypass (by design — branch-integration.ts comment: "All three must pass. No opts.force bypass — this is an integrity contract.").

Rename the failure reason key `change_not_archived` → `change_not_terminal` since the gate is now status-in-terminal-set, not status-equals-archived. The old name encodes the buggy precondition and would become actively misleading after the widening.

## LBP Targets

- **Two parallel code paths must change in lockstep**:
  - `plugin/src/utils/branch-integration.ts:129` — primary path (registry + changeId)
  - `plugin/src/tools/worktree/index.ts:1460` — `verifyMissingRegistryChangeBranchIntegration` (registry-drift recovery for `change/*` branches)
- **Keep merged-into-default + clean-tree** requirements unchanged. Closed ≠ unmerged-OK; commits on a closed branch must still be merged or explicitly discarded.
- **Reason key rename is internal**: 11 references all under `plugin/src/{utils,tools/worktree}/`. Single docs mention in `docs/audits/cull-process-retrospective.md` left as historical record.

## Scope

- `plugin/src/utils/branch-integration.ts` — widen status check, rename reason literal in union type and return
- `plugin/src/utils/branch-integration.test.ts` — add closed-accept test; rename test descriptions and assertion strings
- `plugin/src/tools/worktree/index.ts` — `verifyMissingRegistryChangeBranchIntegration` widens accept set and renames reason
- `plugin/src/tools/worktree/index-delete.test.ts` — add closed-accept test for drift-recovery path; rename existing assertions

## Success Criteria

- Deleting a worktree for a `closed` change branch succeeds when merged + clean
- Deleting a worktree for `draft`/`pending`/`active` changes still rejects with `INTEGRATION_REQUIRED / change_not_terminal`
- All existing archived-status tests still pass with renamed reason key
- New test covers closed-status accept on both primary and drift-recovery paths
- `pnpm test` and `pnpm run check` green