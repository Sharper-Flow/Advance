# Agreement: Flip Worker Singleton to Multi-Worker Default

## Objectives

1. **OBJ1**: Every OpenCode session spawns its own Temporal worker by default — no lock coordination, no client role, no "degraded" false alarms
2. **OBJ2**: Singleton enforcement remains fully functional as opt-in via `worker_singleton_enforce: true` in project config
3. **OBJ3**: Diagnostic surfaces (adv_status, adv_temporal_diagnose) accurately reflect multi-worker reality — "serviceable" when pollers are active, not "degraded"
4. **OBJ4**: Spec requirement `rq-workerSingleton01` relaxed from MUST to SHOULD with opt-in wording

## Acceptance Criteria

1. **AC1**: With default config (no `worker_singleton_enforce` in project.json), two concurrent OpenCode sessions on the same project each spawn their own worker and both report `serviceable` status — no session reports "degraded" or "not alive"
2. **AC2**: With `worker_singleton_enforce: true` in project.json, second session takes client role and does not spawn a worker — behavior identical to current production
3. **AC3**: `adv_temporal_diagnose` does not recommend "run adv_temporal_restart" when worker_alive=false but queue has active server-side pollers
4. **AC4**: All tests pass (`pnpm test`, `pnpm run check`)
5. **AC5**: `docs/specs/advance-meta.md` shows `rq-workerSingleton01` as SHOULD with opt-in description

## Constraints

- **C1**: `worker-lock.ts` and `worker-heartbeat.ts` modules must remain importable and functional — no deletion
- **C2**: No changes to Temporal workflow definitions, signal contracts, or query schemas
- **C3**: Existing project.json files with explicit `worker_singleton_enforce: true` must continue to work identically
- **C4**: No workflow state migration — this is a plugin-init-time behavioral change only

## Avoidances

- **DONT1**: Do not delete or stub out worker-lock or worker-heartbeat modules
- **DONT2**: Do not change the worker child process spawn mechanism (createMultiWorker / createOutOfProcessWorker)
- **DONT3**: Do not introduce new feature flags — reuse the existing `worker_singleton_enforce` with flipped default

## Discovery Findings

### DF1: `worker_role` is purely diagnostic
The `client` role value is never used for behavioral decisions — only for diagnostic labeling in structured status output. The formatted human-readable status text (`formatStatusOutput`) derives its labels from queue serviceability probing, not from `worker_role`. Flipping every session to "host" would not break any correctness path.

### DF2: Lock classification is effectively dead code
`classifySuspectWorkerLock` has a single production caller chain gated behind a `WORKER_LOCK_HELD` error code that is never thrown by any code path. The health probe always returns `worker_lock: null`, making the function's body unreachable. `buildRestartServiceabilitySnapshotRaw` has zero lock-file dependencies and operates correctly without a lock file.

### DF3: Health monitor restart is already singleton-agnostic
`restartCurrentProjectTemporalWorker` does not acquire or check locks — it unconditionally drains old workers and spawns a replacement. The health probe checks Temporal server liveness (describeNamespace + sentinel describe), not individual worker health. This works correctly in multi-worker mode. The only gap: the probe cannot detect "local worker died but server is fine" because another process's worker keeps the server responsive — but this is acceptable since tool calls still route through the server to whichever worker holds the sticky execution.

### DF4: Formatted status labels
The "Worker process: peer-owned, serviceable" and "degraded" labels come from `formatStatusOutput` in `tool-formatters.ts`, derived from queue serviceability state — NOT from `worker_role`. After the flip, sessions with active local workers will show "Worker process: healthy" (because `worker_alive` returns true). The `temporal-ops.ts` recommendation for `!workerAlive` needs a new branch for the server-serviceable case.