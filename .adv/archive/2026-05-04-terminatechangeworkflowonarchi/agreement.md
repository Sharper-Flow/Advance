# Agreement: terminateChangeWorkflowOnArchive

## Discovery findings

### Current behavior (workflows.ts)
The `changeWorkflow` exits via a single condition at line 787-790:
```ts
await wf.condition(() => {
  if (shouldContinueAsNew(thresholds.changeHistoryThreshold)) return true;
  return false;
});
```
Only history-rotation triggers exit. Both `archiveChangeUpdate` (line 717) and `closeChangeUpdate` (line 750) handlers set `state.status = "archived" | "closed"` and upsert search attributes — but the condition never observes these. Workflow stays Running indefinitely.

### Architecture composition
- Update handlers run inside the workflow → state changes are deterministic events
- PSW signal `adv.change.applyChangeSummary` propagates summary to project workflow on changes
- Archive tool (`change.ts:1957-2016`) already handles idempotent re-archive via `findArchiveBundle` → synthetic-result path
- `archiveChange` orchestrator in `archive/archive.ts` does not touch Temporal directly

### Prior context
- `2026-04-30-fixArchiveRetirementZombies` exists in archive (not readable directly per ADV state policy; commit history confirms it shipped)
- `2026-04-27-fixArchiveBookkeepingZombieBug` similar
- `2026-05-04-fixZombieWorkerLockTemporal` (worker-lock zombies, distinct from workflow-zombies)
- None of these directly addressed the `wf.condition` exit-condition gap based on observable code (no terminal-state branch in workflows.ts:787-790)

### Mechanism choice
| Option | Verdict |
|---|---|
| **A. Extend `wf.condition` with terminal-status branch** (state-driven) | ✓ **Chosen** — deterministic, replay-safe, smallest diff |
| B. Client-side `handle.terminate()` after archive | ✗ Async race with workflow update; non-deterministic event |
| C. Cancellation scope | ✗ Structurally invasive |

## Objectives

1. **Stop new zombie accumulation** — change workflows reach a terminal Temporal state on archive or close
2. **Preserve replay determinism** — workflow exit driven by deterministic state, not async signals or wall-clock
3. **Preserve idempotency** — re-archive of already-archived change remains safe (existing bundle-found early-return path)
4. **Preserve continue-as-new path** — history-rotation behavior unchanged
5. **Preserve PSW signal flow** — project workflow's `change_summaries` map continues to receive updates before terminal exit
6. **Preserve `adv_change_reenter` viability** — gate-reopen on a terminated workflow either succeeds (re-creates workflow) or fails with clear actionable error

## Acceptance Criteria

| # | Criterion | Verification |
|---|---|---|
| AC1 | After `adv_change_archive` succeeds, the corresponding change workflow reaches `Completed` state in Temporal within 30s | Integration test: archive → wait → assert workflow status |
| AC2 | After `adv_change_close` succeeds, the corresponding change workflow reaches `Completed` state in Temporal within 30s | Integration test mirror of AC1 |
| AC3 | Re-archiving an already-archived change returns success without error and does not crash on missing workflow | Test: archive twice → second call succeeds via existing-bundle path |
| AC4 | Re-closing an already-closed change is safe (idempotent or clear error) | Test: close twice → assert behavior |
| AC5 | `adv_change_reenter` on a Completed workflow either restarts it correctly OR returns a clear error with remediation hint | Test: archive → reenter → assert behavior |
| AC6 | History-threshold continue-as-new path unchanged | Existing tests pass; new test asserts continue-as-new fires when threshold reached on a non-terminal change |
| AC7 | `workflow-bundle-boundary.test.ts` passes (no new external imports reachable from workflow bundle) | Run boundary test |
| AC8 | New unit test asserts terminal-state branch resolves `wf.condition` and workflow returns cleanly | Vitest red→green TDD |
| AC9 | `pnpm test` (all tests) and `pnpm run check` clean | CI run |
| AC10 | `temporal workflow list --query "ExecutionStatus='Running' AND WorkflowType='changeWorkflow'"` shows only changes that exist on disk in `changes/` after the fix is deployed and a fresh archive runs | Manual operator check post-merge |

## Non-Goals (out of scope)

- Cleanup of existing 200+ zombie workflows on this host (separate change `cleanupzombierunningworkflows`)
- Project workflow termination (project workflows are designed long-lived)
- Worker-lock contention reduction (separate change `singleworkerperprojectpolicy`)
- Change-list registry consistency (separate change `reconcilechangelistsourcesoftr`)

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Replay determinism breaks on existing in-flight workflows after deploy | State-driven exit; existing workflows resume their condition with new code, which evaluates state and exits cleanly. No history rewrite required. |
| `adv_change_reenter` finds no workflow → fails | AC5 covers this explicitly. If existing reenter path doesn't auto-restart, design will add explicit re-create logic. |
| Race: archive update commits, workflow exits, retry picks no workflow | Existing idempotent re-archive path (bundle-found check) covers this |
| PSW state desync if signal in-flight when workflow exits | Workflow exits AFTER state mutation completes (return at end of function); signal already sent synchronously before condition wakes. |

## Validation Plan

TDD red→green per task:
1. **Red**: integration test archives a change, queries workflow status, expects `Completed`. Fails on current main (workflow stays Running).
2. **Green**: extend `wf.condition` with terminal-state branch + clean return. Test passes.
3. **Refactor**: assert continue-as-new path still functions when threshold reached.
4. **Boundary**: run `workflow-bundle-boundary.test.ts`.
5. **Full suite**: `pnpm test` (3119+ tests).
6. **Check**: `pnpm run check` (typecheck/lint/format).

## Tasks (preview — finalized in /adv-prep)

1. Write failing integration test asserting workflow Completes after archive
2. Extend `wf.condition` in `changeWorkflow` to include terminal-state branch
3. Add clean return path before continue-as-new
4. Mirror test for close (workflow Completes after close)
5. Verify `adv_change_reenter` behavior on terminated workflow; add test
6. Run full suite + check; fix any regressions
7. Document the new exit semantics in `docs/temporal-recovery.md` and inline comments

## Citations
- `plugin/src/temporal/workflows.ts:787-790` — current single-branch exit condition
- `plugin/src/temporal/workflows.ts:717-749` — archiveChangeUpdate handler
- `plugin/src/temporal/workflows.ts:750-783` — closeChangeUpdate handler
- `plugin/src/tools/change.ts:1957-2016` — archive tool entry point
- `plugin/src/archive/archive.ts:29-100` — archive orchestrator (delta application)
- `plugin/src/temporal/messages.ts:180` — `applyChangeSummarySignal`