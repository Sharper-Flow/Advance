# Design: terminateChangeWorkflowOnArchive

## Validator verdict: CAUTION → modifications applied

Independent validator (adv-researcher) returned `CAUTION` with three actionable modifications. All three are incorporated below.

## Mechanism: state-driven exit

```ts
// plugin/src/temporal/workflows.ts ~line 787 (current single-branch)
await wf.condition(() => {
  if (shouldContinueAsNew(thresholds.changeHistoryThreshold)) return true;
  return false;
});
// → continue-as-new path
```

Becomes:

```ts
// plugin/src/temporal/workflows.ts (post-fix)
await wf.condition(() => {
  if (state.status === "archived" || state.status === "closed") return true;
  if (shouldContinueAsNew(thresholds.changeHistoryThreshold)) return true;
  return false;
});

// Terminal-state path: drain in-flight handlers and Complete
if (state.status === "archived" || state.status === "closed") {
  wf.log.info("workflow:completing", {
    changeId: state.changeId,
    status: state.status,
    reason: "terminal_status_detected",
  });
  // M1: wait for in-flight handlers to finish before workflow exits
  // (prevents interrupting a concurrent applyChangeSummary signal etc.)
  await wf.condition(wf.allHandlersFinished);
  return; // workflow Completes
}

// History-rotation path (existing, unchanged)
const seed: ChangeWorkflowInput = { ... };
await wf.continueAsNew<typeof changeWorkflow>(seed);
```

**SDK availability confirmed:** `wf.allHandlersFinished` is exported from `@temporalio/workflow@1.16.0` at `lib/workflow.d.ts:545`.

## Modifications applied

| ID | Modification | File | Why |
|----|---|---|---|
| M1 | Drain handlers via `wf.allHandlersFinished` before return | `plugin/src/temporal/workflows.ts` | Prevent interrupting in-flight signal/update handlers (e.g., `applyChangeSummary`) |
| M2a | Pre-check `adv_change_reenter` for terminal status | `plugin/src/tools/change.ts:2107+` | Domain error vs opaque Temporal "workflow already completed" — better UX |
| M2b | Extend `reseedChangeFromDisk` archived-only guard to also cover `closed` | `plugin/src/storage/store-temporal/index.ts:341` | Prevent re-seed loop on Completed closed workflows |
| M3 | Add observability log before workflow return | `plugin/src/temporal/workflows.ts` | Verifiability via Temporal event history |

## Code change details

### Change 1: workflow exit condition (M1 + M3)
- File: `plugin/src/temporal/workflows.ts`
- Location: lines 785-790 (current `wf.condition` block) + lines 791-811 (current continue-as-new path)
- Modification: split single-branch condition into multi-branch + terminal-return path
- Net diff: ~15 lines added, 0 lines removed

### Change 2: reenter pre-check (M2a)
- File: `plugin/src/tools/change.ts`
- Location: inside `adv_change_reenter.execute`, after `if (!result.data)` check at line 2154
- Modification: add status guard
```ts
if (result.data.status === "archived" || result.data.status === "closed") {
  return formatToolOutput({
    error: `Cannot reenter ${result.data.status} change ${changeId}. Reenter is for scope expansion on active changes; archived/closed changes cannot be reopened. Use adv_workflow_repair if a workflow needs re-creation.`,
    changeId,
  });
}
```
- Net diff: ~6 lines added

### Change 3: reseed guard (M2b)
- File: `plugin/src/storage/store-temporal/index.ts`
- Location: line 341 (current archived guard in `reseedChangeFromDisk`)
- Modification: extend to closed
```ts
// Was: if (change.status === "archived") { ... }
// Now:
if (change.status === "archived" || change.status === "closed") {
  return {
    ...change,
    _source: "disk",
  } as Change & { _source: "disk" };
}
```
- Net diff: 1 line modified
- Update the inline comment to mention closed too

### Change 4: tests

| Test | File | Asserts |
|---|---|---|
| Archive → workflow Completes | new test in `plugin/src/temporal/workflows.test.ts` (or change-state-related test) | After `archiveChangeUpdate` resolves, workflow returns cleanly (Completed) |
| Close → workflow Completes | same file, mirror | After `closeChangeUpdate` resolves, workflow returns cleanly |
| Continue-as-new still fires | existing test ensures threshold path | Already covered; extend to verify it does NOT fire when terminal status reached |
| Reenter on archived → domain error | new test in `plugin/src/tools/change.test.ts` | M2a returns the new error message |
| Reseed of closed change → disk projection (no re-create) | new test in `plugin/src/storage/store-temporal.test.ts` | M2b path returns `_source: "disk"` for closed |
| Boundary | existing `workflow-bundle-boundary.test.ts` | Passes unchanged |

## Replay determinism analysis

- `state.status` is workflow-managed state, fully reconstructed from event history → deterministic
- `wf.workflowInfo()` (used by `shouldContinueAsNew`) is deterministic per Temporal's replay model
- `wf.allHandlersFinished` is also deterministic (counts active in-process handlers)
- Multi-branch `wf.condition` predicate is pure; no side effects
- All branch checks read only workflow-managed values

Verdict: replay-safe.

## Mid-deploy behavior

When this code ships and existing zombie workflows are picked up:
- Workflow at `wf.condition` block → next workflow task evaluates new predicate
- If `state.status` is already "archived"/"closed" (set by prior archive/close call) → condition resolves true → workflow Completes
- Cleanup window: ≤1 workflow task per zombie. Bulk cleanup is "free" — happens passively as workflows wake up
- For workflows mid-history-rotation: continue-as-new replays into the new code; immediately observes terminal status; Completes

This is one of the cleanest deploy stories possible — no migration script needed for code-induced cleanup. Existing-zombie cleanup that requires terminate-by-query remains a separate change (`cleanupzombierunningworkflows`) for workflows that don't naturally wake up.

## Risk re-assessment with modifications

| Risk | Severity | Mitigation |
|---|---|---|
| Replay determinism breaks | Mitigated | State-driven exit; pure predicate |
| `adv_change_reenter` opaque error | Mitigated | M2a domain pre-check |
| `reseedChangeFromDisk` re-creates Completed closed workflow | Mitigated | M2b guard added |
| In-flight handler interrupted by workflow exit | Mitigated | M1 `allHandlersFinished` drain |
| Pending PSW signal lost on Complete | Accepted | Fire-and-forget; archive already applied delta; signal carries summary, not authority |
| Closed-change query post-retention loses Temporal data | Accepted | Disk projection is source of truth via `_source: "disk"` |

## Observability

After deploy, operators can:
1. Query `temporal workflow list --query "ExecutionStatus='Completed' AND WorkflowType='changeWorkflow'"` → sees the cleanup happen passively
2. Search workflow event histories for `workflow:completing` log → confirms terminal-state branch fired
3. `adv_status` recommendations stop reporting "stale Temporal queue" once disk-active changes match Running workflows

## Tasks (finalized in /adv-prep)

| # | Task | Owner | TDD intent |
|---|---|---|---|
| 1 | Write failing test: archive → workflow Completes | inline | red phase |
| 2 | Extend `wf.condition` with terminal-state branch + log + handler drain | inline | green phase 1 |
| 3 | Write failing test: close → workflow Completes | inline | red phase 2 |
| 4 | Verify close path uses same exit (no additional code if state.status branch is symmetric) | inline | green phase 2 |
| 5 | Add `adv_change_reenter` terminal-status pre-check + test | inline | red→green |
| 6 | Extend `reseedChangeFromDisk` to guard `closed` + test | inline | red→green |
| 7 | Run `workflow-bundle-boundary.test.ts` and full suite + check | inline | regression |
| 8 | Update `docs/temporal-recovery.md` with new exit semantics + comment near workflows.ts:787 | inline | docs |

## Citations
- `plugin/src/temporal/workflows.ts:785-811` — current condition block + continue-as-new
- `plugin/src/temporal/workflows.ts:717-783` — archive/close update handlers
- `plugin/src/storage/store-temporal/index.ts:329-369` — reseedChangeFromDisk
- `plugin/src/tools/change.ts:2107-2174` — adv_change_reenter
- `@temporalio/workflow@1.16.0/lib/workflow.d.ts:540-545` — `allHandlersFinished` signature
- Validator findings (Context7 sources): TS SDK continue-as-new pattern, Update-on-Completed RpcException, Java `await(allHandlersFinished)` pattern, archived-change disk projection invariant test (`store-temporal.test.ts:1024-1027`)