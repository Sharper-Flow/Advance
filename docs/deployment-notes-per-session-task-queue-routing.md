# Deployment Notes: Per-Session Task-Queue Routing

Companion to ADR-0005 (`docs/adr/0005-per-session-task-queue-routing.md`) and the `isolateAdvWorkerTaskQueues` change. Operator-facing deployment guidance for the worker-spawn model change, queue layout, and incompatibility notes.

## What changed

- **Change workflows** (per `changeId`) now route to `advance-{projectId}-{sessionId}` (the *session queue*) when the caller provides a `sessionId` (KD-10).
- **Epic workflows** continue to route to the permanent `advance-{projectId}` queue (the *project queue*); unchanged (UD2 / KD-2).
- **Every session's worker** polls BOTH its own session queue AND the permanent project queue (KD-4 implicit migration + Epic signal handling).
- **`worker_singleton_enforce` default** flipped from `true` to `false` (KD-9; landed in trunk via prior archived change `2026-05-22-flipWorkerSingletonMultiWorker`, commit `bbbbdbca4`). Each OpenCode session spawns its own worker process by default.
- **Worker.create tuning caps** applied to every production worker call site via shared `getAdvWorkerTuningOptions()` module (KD-3): 1+1 pollers per queue, 4 workflow/activity slots, 10 activities/sec.

## Operator-visible effects

- `adv_status view:"health"` and `adv_doctor` distinguish per-queue serviceability with type labels (`session` / `project`) when a session ID is active (AC6 / KD-5).
- Total per-project polling footprint under 3 concurrent sessions ≤ 18 (3 sessions × 2 queues × 1+1 pollers; AC7).
- Peer-session wedge (worker process alive but not polling) no longer blocks other sessions' workflow signals (AC2).

## Incompatibilities

- **`worker_singleton_enforce: true` is incompatible with per-session routing.** If you explicitly set this in `project.json`, only the host (lock-owning) session's worker spawns — peer sessions have no poller for their own session queues, defeating AC1 and AC2. Remove the explicit setting (the default `false` is correct) or set it to `false`.
- **`ADV_FORCE_IN_PROCESS_WORKER=1`** still forces the in-process worker path; the same caps and queue list apply (KD-7 OOP+in-process parity).

## Environment variables emitted to worker child

- `ADV_TEMPORAL_PROJECT_ID` (unchanged) — used by child for diagnostic identification.
- `ADV_TEMPORAL_SESSION_ID` (NEW, KD-6) — emitted when a session ID is available; informational. Queue list is parent-computed and passed via `ADV_TEMPORAL_TASK_QUEUES`.
- `ADV_TEMPORAL_TASK_QUEUES` (multi-queue mode) — comma-separated list the child registers; includes both session queue and project queue when sessionId is active.

## Rollback

Per-session routing is opt-out via `worker_singleton_enforce: true` in project config, but this produces incorrect behavior under the new model. To fully revert, also pin the change-workflow caller to omit `sessionId` on `ChangeWorkflowInput` — workflows started without `sessionId` route to the project queue (KD-10 backward-compat branch).

## Migration

Implicit (KD-4): in-flight change workflows on the legacy `advance-{projectId}` queue continue to be polled because every session co-polls the project queue. They drain naturally as they archive. No operator action required.
