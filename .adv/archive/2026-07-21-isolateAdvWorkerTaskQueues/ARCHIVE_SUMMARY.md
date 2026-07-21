# Archive: Isolate ADV worker task queues

**Change ID:** isolateAdvWorkerTaskQueues
**Archived:** 2026-07-21T13:25:03.131Z
**Created:** 2026-07-21T02:21:58.368Z

## Tasks Completed

- ✅ Apply `getAdvWorkerTuningOptions()` to all `Worker.create` call sites in `plugin/src/temporal/`
  > Task checkpoint completed
- ✅ Add `buildSessionTaskQueue(projectId, sessionId)` to `plugin/src/temporal/client.ts`
  > Task checkpoint completed
- ✅ Create `plugin/src/temporal/worker-tuning.ts` exporting `getAdvWorkerTuningOptions(env?)`
  > Task checkpoint completed
- ✅ Generate `sessionId` in `plugin-init.ts:tryInitStore` and persist in loaded-build session registry
  > Task checkpoint completed
- ✅ Plumb `sessionId` through workflow-start path
  > Task checkpoint completed
- ✅ Flip `worker_singleton_enforce` feature flag default from `true` to `false`
  > Task checkpoint completed
- ✅ Branch `ensureChangeWorkflowStarted` on `sessionId` for per-session task-queue routing
  > Task checkpoint completed
- ✅ Worker child computes own-session queue from env vars; registers session queue + project queue
  > Task checkpoint completed
- ✅ Extend `health-probe.ts` for multi-queue probing with queue-type labels
  > Task checkpoint completed
- ✅ Extend `adv_temporal_diagnose` and `adv_status view:"health"` for multi-queue output
  > Task checkpoint completed
- ✅ Integration test: AC2 — peer-session wedge isolation
  > Task checkpoint completed
- ✅ Integration test: AC3 — legacy queue co-polling for migration
  > Task checkpoint completed
- ✅ Verification: AC8 — session end leaves no orphan polling process
  > Task checkpoint completed
- ✅ Load test: AC7 — 3-session poller footprint ≤ 18
  > Task checkpoint completed
- ✅ Integration test: AC1 + AC5 — workflow task-queue routing
  > Task checkpoint completed
- ✅ Add spec deltas `rq-isolSessionTaskQueue01..04` to `.adv/specs/advance-workflow/spec.json`
  > Task checkpoint completed
- ✅ Deployment documentation: `worker_singleton_enforce` default flip + ADR-0001 draft
  > Task checkpoint completed

## Specs Modified

- **advance-workflow**: 4 delta(s)

## Wisdom Accumulated

- **[gotcha]** Plain `pnpm test -- src/temporal/<file>.test.ts` triggers the full Vitest suite (both unit and temporal integration projects), causing timeouts. Use `pnpm vitest run --project unit src/temporal/<file>.test.ts` for fast unit-only iteration (~1.3s), or `bin/oc-test targeted -- src/temporal/<file>.test.ts` for the host-throttled variant. Reserve plain `pnpm test` for full-suite runs.
- **[gotcha]** Spec drift on rq-isolSessionTaskQueue03: delta text in change.json says workflowTaskPollerBehavior.maximum:1, but implementation (worker-tuning.ts:36) uses maximum:2 because Temporal SDK requires ≥2 when max_cached_workflows > 0 (default). ADR-0005 + deployment-notes + worker-tuning.ts:30-35 comments all document this deviation. Archive will apply the stale maximum:1 text to spec.json; a fast-follow change is needed to update rq-isolSessionTaskQueue03 body + scenario 03.1 to maximum:2 after archive. The adv_delta_modify tool requires the exact SHA-256 of the current global-spec requirement, which doesn't exist pre-archive, so in-flight delta text correction isn't possible from within the change.
