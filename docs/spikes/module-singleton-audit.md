# Audit: module-scope singletons & experimentalWorkspaces flag side effects

Task: `tk-063286a8d596` (change `fixWorktreeSessionRoot`).

Combines two research strands surfaced by the spike (`tk-ad9ebd8b983f`):
1. Module-scope singletons in `plugin/src` and their resilience to double plugin instantiation (post-warp scenario).
2. Side effects of `OPENCODE_EXPERIMENTAL_WORKSPACES=true` beyond enabling warp.

---

## Part A: Module-scope singletons audit

### Findings by file

| File:line | Singleton | Double-init risk | Classification | Action |
|---|---|---|---|---|
| `events/terminal.ts:107-329` | `cachedPaneTty`, `cachedClientTty`, `ttyCacheTimestamp`, `_onBell`, `lastAlertedStatus`, `pendingFinalAlert`, `lastArmedMessageId`, `lastRungMessageId`, `bellDebounceTimer` | TTY caching is process-global; both plugin instances inherit. Bell-state singletons may double-fire alerts if both instances see the same `session.idle` event | SAFE-ish: TTYs are immutable per process; bell state may double-arm but `lastRungMessageId` dedup at the ring site prevents duplicate rings | No action needed; document as known double-emit risk for non-terminal events |
| `events/status.ts:23` `let state: StatusState` | Status singleton; reset on `initializeStatus` | NEEDS-FIX | Already in scope as task 2 (tk-f96182eff2ad) | — |
| `events/status.ts:142` `const retryTrackers = new Map` | Retry counter map keyed by task id | SAFE — Map shared across plugin instances, task IDs are unique | No action | — |
| `plugin-init.ts:366-370` Worker tracking Sets + `currentWorkerRole`, `exhaustedWorkerDirs` | Tracks in-process Temporal workers | NEEDS-AUDIT — second plugin init would re-call `startTemporalWorker` and potentially register a SECOND worker into the Set | YELLOW: existing `if (exhaustedWorkerDirs.has(projectStateDir)) return` short-circuits second-init for same project-id. **Verify by reading `startTemporalWorker` path before plugin-init code change lands** | Add explicit verification step to task 7 (tk-19b6a92616ad) |
| `plugin-init.ts:541` `let activeHealthMonitor: HealthMonitor \| null` | Process-global health monitor | NEEDS-FIX — second `startWorkerHealthMonitor()` call would orphan the first | YELLOW: function should be idempotent already. Read `startWorkerHealthMonitor`'s body to confirm | Fold check into task 7 verification |
| `plugin-init.ts:667-742` `registerShutdownHandlers` | Registers `process.on("exit"|"SIGINT"|"SIGTERM")` UNCONDITIONALLY on every call. `removeProcessListeners` returned but never called from `index.ts:747` | **RED — process-handler leak.** Two plugin instances → two handlers on each signal → `shutdownWithFlush` runs twice → `process.exit(0)` called twice → second store.close() throws "already closed" (swallowed) but is real noise | Existing leak even today on plugin reload; warp doesn't introduce it, but exacerbates it. **Add task to graph or fold into task 7** | See "Recommended additions" below |
| `tools/worktree/index.ts:542` `let db: Database \| null` | Worktree state DB handle | SAFE — first-init wins; `getDb()` returns cached handle. project-id-keyed external state means both plugin instances point at the same DB file | No action | — |
| `tools/worktree/index.ts:545` `let projectRoot: string \| null` | Set on first `initDb` call, never reset | NEEDS-FIX — second plugin instance's `initDb(worktreePath, log)` would set `projectRoot = worktreePath`, but cached `db` is already open against trunk path. Subsequent state ops use cached `db` so worktree path is silently ignored | YELLOW: state DB is project-id-keyed (same SHA for both), so cached `db` IS correct for both instances. The semantic confusion is cosmetic. Add a JSDoc note | Document in task 7 verification, no code change |
| `tools/worktree/index.ts:548` `let cleanupRegistered` | Guard against double `registerCleanupHandlers` | SAFE — boolean guard works correctly across plugin instances | No action | — |
| `temporal/service.ts:141-147` STSL singletons | `cachedBundle`, counters, `inFlightReconnect`, `lastSaVerification` | SAFE — `initStsl` checks `if (cachedBundle && same params) return existing` (lines 182-189). Second plugin init returns existing bundle | Properly idempotent. No action | — |
| `temporal/retry-wrapper.ts:24-29`, `temporal/fallback-telemetry.ts:8` | Telemetry counters | SAFE — counters shared across plugin instances is desired behavior (process-global metrics) | No action | — |
| `temporal/health-probe.ts:43` `let overrideTelemetry` | Test override hook | SAFE — only set by tests | No action | — |
| `tools/temporal-ops.ts:87`, `tools/status.ts:118,158` | Serviceability-input maps, health-snapshot cache | SAFE — keyed by inputs; cached values share across instances correctly | No action | — |
| `storage/store-temporal/shared.ts:13` `ownerGuardCache` (WeakMap) | Owner guard | SAFE — WeakMap with structural keys | No action | — |
| `utils/metrics.ts:35` `let counters` | Metrics accumulator | SAFE — `resetMetrics()` exposed, but module-scope counter survives plugin re-init (desired: cumulative process metrics) | No action | — |
| `utils/peer-sessions.ts:96` `let processScanner` | Test-injectable function | SAFE | No action | — |
| `utils/fs.ts:25` `let tempCounter` | Monotonic tmp-file counter | SAFE — process-global counter is correct | No action | — |
| `temporal/worker-heartbeat.ts:48-85` + `temporal/health-monitor.ts:186-272` setInterval | Heartbeat timers | NEEDS-AUDIT: second plugin init could create a second timer | YELLOW: registered timers are tracked via `workerLockHeartbeats` Set + `intervalTimer` variable. The `Set`-tracking lets `drainWorkerLockHeartbeats` clean both up. Likely safe but verify | Add verification to task 7 |

### Process-global handler observations

`process.on(...)` is called in TWO places:
1. `plugin-init.ts:732-734` — exit / SIGINT / SIGTERM (the leak)
2. `tools/worktree/index.ts:571-573` — `process.once(...)` (idempotent by design: removes itself after one call)

Only #1 is a real leak.

### Summary: items to fold into existing tasks

| Item | Severity | Fold into |
|---|---|---|
| `events/status.ts` idempotency | NEEDS-FIX | Task 2 (`tk-f96182eff2ad`) — already in scope |
| `registerShutdownHandlers` double-registration | RED (pre-existing, exacerbated by warp) | Task 7 (`tk-19b6a92616ad`) — add guard at registration site |
| Worker/health-monitor idempotency verification | YELLOW (likely-safe, needs read) | Task 7 (`tk-19b6a92616ad`) — verification step |
| `projectRoot` cosmetic stale-cache | YELLOW (no behavioral impact) | Task 7 (`tk-19b6a92616ad`) — JSDoc note only |
| Bell state double-arm on non-terminal events | YELLOW (low impact) | Document as known limitation; no fix |

### Recommended addition to task 7 (plugin init wiring)

Add a guard against duplicate `registerShutdownHandlers` registration:

```ts
// In plugin-init.ts
let shutdownHandlersRegistered = false;

export function registerShutdownHandlers(store: Store | null): ShutdownHandlers {
  if (shutdownHandlersRegistered) {
    debugLog("registerShutdownHandlers: already registered, returning no-op handlers");
    return {
      handleExit: () => {},
      shutdownWithFlush: () => {},
      removeProcessListeners: () => {},
    };
  }
  shutdownHandlersRegistered = true;
  // ... existing body ...
}
```

This fix is independent of warp (helps existing plugin-reload scenarios too) but should ship with task 7 since that's where plugin-init wiring lands.

---

## Part B: experimentalWorkspaces flag side effects

### Gated call sites (verified against `/tmp/opencode-v1.15.5/packages/opencode/src/`)

#### B.1 `session/session.ts:557-564` — duplicate backward-compat event emission

```ts
if (!flags.experimentalWorkspaces) {
  // This only exist for backwards compatibility. We should not be
  // manually publishing this event; it is a sync event now
  yield* bus.publish(Event.Updated, {
    sessionID: result.id,
    info: result,
  })
}
```

**Direction**: when flag is OFF, an extra `Event.Updated` is emitted via `bus.publish`. When flag is ON, only the canonical `sync.run(Event.Created, ...)` from line 555 fires.

**ADV impact**: ADV doesn't listen for `bus.publish` events (only the sync event stream / SDK event stream). No observable behavior change. **SAFE.**

#### B.2 `session/session.ts:575-580` — `Session.list` filters out cross-workspace sessions

```ts
const list = Effect.fn("Session.list")(function* (input?: ListInput) {
  const ctx = yield* InstanceState.context
  return Array.from(
    listByProject({ projectID: ctx.project.id, experimentalWorkspaces: flags.experimentalWorkspaces, ...input }),
  )
})
```

#### B.3 `session/session.ts:889-914` — listByProject query branching

```ts
} else if (input.scope !== "project" && !input.experimentalWorkspaces) {
  if (input.directory) {
    conditions.push(eq(SessionTable.directory, input.directory))
  }
}
```

**Direction**: when flag is OFF, `Session.list` (default scope) filters by `directory` matching. When flag is ON, that filter is dropped — `Session.list` returns sessions across all workspaces of the project (with workspace_id-based filtering applied separately).

**ADV impact**: ADV doesn't currently call `client.session.list`. If a future ADV feature does, the listing semantics change: with flag on, sessions from other workspaces of the same project are included by default. Document as a behavior note. **YELLOW — informational.**

#### B.4 `sync/index.ts:317-338` — event store population

```ts
if (options.experimentalWorkspaces) {
  tx.insert(EventSequenceTable).values({...}).onConflictDoUpdate({...}).run()
  tx.insert(EventTable).values({...}).run()
}
```

**Direction**: when flag is ON, sync events are persisted into `EventSequenceTable` and `EventTable` in addition to being projected. This builds the event sourcing log needed for cross-workspace sync via `syncHistory` (used by remote workspace warps).

**ADV impact**: pure additive — populates new tables OpenCode uses for replay. Increases SQLite I/O slightly. No behavior changes ADV observes. **SAFE (performance cost only).**

#### B.5 `control-plane/workspace.ts:478-522` — startSync machinery

Already characterized in the spike doc. **Required for warp to function.**

### Other flag references (non-gating)

Found via `rg`: env var `OPENCODE_EXPERIMENTAL_WORKSPACES=true` is also injected into spawned workspace adapter child processes (`control-plane/workspace.ts:569`). Doesn't affect ADV since our adapter's `create` is a no-op (no child process).

### Summary

| Side effect | Impact on ADV | Documentation needed? |
|---|---|---|
| B.1 Duplicate event emission disabled | None | No |
| B.2 + B.3 `Session.list` filters by workspace_id instead of directory | None today; potential future ADV consideration | Light note in docs (advanced section) |
| B.4 EventSourceTable populated | None | No |
| B.5 startSync emits connected for local targets | Required for warp | Already documented |

### Graduation timeline

Reviewed recent OpenCode releases (v1.15.0 - v1.15.5, released 2026-05-15 through 2026-05-18):

- v1.15.0 release notes mention "Effect-based core event system" — likely the foundation for the workspaces feature
- v1.15.5 mentions "Keep file references scoped to the current workspace" — suggests active development
- **No GA announcement; no sunset date for the env var**

Conclusion: `OPENCODE_EXPERIMENTAL_WORKSPACES=true` is the current and ongoing state of the world. Opt-in via env var is the right guidance. No transitional-period language needed in docs.

---

## Aggregate recommendations

1. **Add `shutdownHandlersRegistered` guard** to `registerShutdownHandlers` — fold into task 7 (`tk-19b6a92616ad`).
2. **Add verification steps** to task 7 for worker / health-monitor idempotency.
3. **Document the `Session.list` semantic change** lightly in `ADV_INSTRUCTIONS.md § Worktree Protocol § Enabling mode: warp` subsection. Wording suggestion:
   > Setting `OPENCODE_EXPERIMENTAL_WORKSPACES=true` also affects how OpenCode's session-list defaults work: cross-workspace sessions of the same project are included instead of filtered by directory. ADV does not currently rely on this behavior; the note is provided for advanced users.
4. **No sunset/transitional language** needed — the experimental flag is the current and stable opt-in mechanism.

All findings consistent with the spike's verdict and the user's Option A decision. No design re-entry needed; folding into existing task notes.
