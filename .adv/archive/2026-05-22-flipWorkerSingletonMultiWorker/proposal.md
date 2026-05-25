# Proposal: Flip Worker Singleton to Multi-Worker Default

## Why

The Temporal worker singleton enforcement (`worker_singleton_enforce` defaults `true`) creates a constant "degraded" / "not alive" diagnostic for every OpenCode session that doesn't hold the worker.lock file. The enforcement adds ~400 lines of lock/heartbeat/reclaim/approval machinery that provides no correctness benefit because Temporal's task queue model already guarantees safe concurrent access. The enforcement also has a ghost-worker bug where client-role sessions still spawn polling workers.

## What Changes

1. **Feature flag default flipped** — `worker_singleton_enforce` defaults to `false` in `types/project.ts`
2. **Init path simplified** — `plugin-init.ts` skips lock acquisition when singleton is off; every session spawns its own worker (host role)
3. **Diagnostics fixed** — `temporal-ops.ts` recommend path no longer says "not alive" when worker_alive=false but queue is server-serviceable; uses a delegation-aware label instead
4. **Spec relaxed** — `docs/specs/advance-meta.md` `rq-workerSingleton01` downgraded from MUST to SHOULD (opt-in for resource-constrained environments)
5. **Lock code retained but dormant** — `worker-lock.ts`, `worker-heartbeat.ts` remain in codebase but are only activated when `worker_singleton_enforce: true` is set in project config

## Success Criteria

1. **SC1**: A multi-session setup (≥2 OpenCode processes on same project) shows `serviceable` status for every session — no "degraded" or "not alive" labels when queue has active pollers
2. **SC2**: Setting `worker_singleton_enforce: true` in project.json restores full singleton behavior (lock acquisition, heartbeat, client role) — no regression in opt-in mode
3. **SC3**: All existing tests pass; tests that assert `worker_singleton_enforce: true` default are updated to reflect the new default

## Affected Code

| File | Change |
|------|--------|
| `plugin/src/types/project.ts` | Flip default from `true` to `false` |
| `plugin/src/plugin-init.ts` | When singleton=false, skip `resolveWorkerSingletonPlan`, always take host role |
| `plugin/src/tools/temporal-ops.ts` | Fix `recommendedNextAction` for worker_alive=false + server-serviceable case |
| `plugin/src/tools/status.ts` | Update formatted diagnostics to not say "Degraded" for multi-worker sessions |
| `docs/specs/advance-meta.md` | Relax `rq-workerSingleton01` priority and add opt-in wording |
| `plugin/src/adv-stability-docs-assets.test.ts` | Update default assertion |
| `plugin/src/deploy-local.test.ts` | Update default assertion |
| `plugin/src/plugin-init.worker-singleton.test.ts` | Verify both modes; no behavioral regression |
| `plugin/src/tools/status.test.ts` | Update feature flag default assertions |

## Related Repositories

None — this change is scoped to the Advance plugin repo only.

## Constraints

- **No lock code deletion** — `worker-lock.ts` and `worker-heartbeat.ts` stay functional for opt-in use
- **No workflow state migration** — existing running workflows are unaffected; this is a plugin-init-time behavioral change only
- **Backward compatible** — existing `project.json` files with explicit `worker_singleton_enforce: true` continue to work identically

## Impact

- **UX**: "Degraded" false alarm eliminated for standard multi-session usage
- **Reliability**: N workers on the queue means single-worker failure doesn't stall the project
- **Resource**: Each session consumes ~270MB for its Node worker (negligible for dev workstations already running 700-850MB OpenCode processes)
- **Complexity**: Lock acquisition, heartbeat, suspect-classification, and approval-flow paths become opt-in rather than mandatory

## Context

- Investigation showed 5 OpenCode sessions with 5 Node workers all actively polling the same queue while singleton enforcement was nominally "on"
- The lock file existed (held by PID 608176) but 4 other sessions had workers anyway — enforcement only prevents spawn, doesn't clean up existing workers
- Temporal guarantees at-most-once task dispatch regardless of worker count; queries route via sticky execution to whichever worker holds the workflow

## Discovery Agenda

1. Verify no downstream consumer relies on `worker_role === 'client'` for behavioral decisions (not just diagnostics)
2. Audit `classifySuspectWorkerLock` in temporal-ops.ts — confirm it's only called during restart/recovery which is itself singleton-scoped
3. Check if health monitor restart logic needs adjustment for multi-worker (currently restarts only the local worker)

## Scope

### In Scope
- Flip `worker_singleton_enforce` default to `false`
- Fix diagnostic labels for multi-worker state
- Relax spec requirement
- Update test assertions

### Out of Scope
- Deleting lock/heartbeat code (retained for opt-in)
- Changing Temporal workflow definitions or signal/query contracts
- Cross-project worker coordination changes

### Must Not
- Must not break existing `worker_singleton_enforce: true` configurations
- Must not delete or stub out worker-lock or worker-heartbeat modules
- Must not change the worker child process spawn mechanism itself