# Executive Summary

## Outcome
This change isolates per-session Temporal workflow routing so concurrent OpenCode sessions on the same project no longer wedge each other. Approvers are deciding whether to ship per-session task queues, Worker.create polling caps, and a flipped worker-spawn default that together eliminate a real cross-session reliability regression.

## Why It Matters
Observed wedge (2026-07-21): when one session's worker degraded, every session's workflow signals stalled because all workflows shared one Temporal task queue. This change routes each session's change workflows to its own session-scoped task queue, so a peer-session wedge cannot block another session's processing. Operator value: fewer manual `adv_temporal_worker_restart` interventions, predictable signal latency under concurrent load, and a 70% reduction in total per-project polling footprint under typical 3-session use.

## Verdict
APPROVED

## What Was Built
1. Per-session task-queue routing — each session's change workflows route to `advance-{projectId}-{sessionId}` instead of the shared project queue; epic workflows stay on the project queue (project-scoped entity, not session-scoped).
2. Session ID plumbing — opaque `sess_<8 alphanumeric>` ID generated at plugin-init, persisted in a runtime holder co-located with the generator, threaded end-to-end from storage callers through workflow-start to the worker child env.
3. Worker queue computation — every worker spawn site (in-process and out-of-process, init and restart) computes `[sessionQueue, projectQueue]` so the worker polls both: session for own workflows, project for epics + legacy migration.
4. Worker.create tuning caps — single shared `getAdvWorkerTuningOptions()` module bounds every Worker.create (2 workflow pollers + 1 activity poller + 4 slots + 10 activities/sec per queue). Static-check drift guard prevents regression. **Critical fix during AC7 verification**: workflow poller cap bumped from 1 to 2 because the Temporal SDK requires `≥2 when max_cached_workflows > 0` (the default).
5. Multi-queue diagnostics — `adv_temporal_diagnose` and `adv_status view:"health"` both surface per-queue serviceability with `session` / `project` type labels when per-session routing is active. Operators can distinguish session-queue wedge from project-queue health.
6. Worker child identity — `ADV_TEMPORAL_SESSION_ID` env var emitted by parent and consumed by child via `setCurrentSessionId()` at worker startup.
7. Documentation — ADR-0005 (per-session routing tradeoffs + cross-references ADR-0004 for Epic queue retention) + deployment notes (env vars, incompatibilities, rollback, migration).
8. Spec deltas — 4 new requirements (`rq-isolSessionTaskQueue01..04`) added to the `advance-workflow` capability.

## What Was Verified
- Verdict: APPROVED with 5 findings (0 blockers, 0 unresolved issues after remediation, 4 deferred suggestions to /adv-harden, 6 praise)
- Tests: 5 integration tests against real Temporal test env (AC1/AC2/AC3/AC5/AC7/AC8 all GREEN); 65+ unit tests across routing/session-id/caps/diagnostics surfaces; typecheck clean; lint clean
- Preview URL: not_applicable — backend reliability change, visual_surface: false, no browser-visible or visual-output work
- Contract matrix: 33/33 rows passing (5 SC, 8 AC, 9 C, 6 DONT, 5 OOS); 0 failing

## Remaining Concerns
- **Spec text drift (non-blocking)**: delta text for `rq-isolSessionTaskQueue03` declares `workflowTaskPollerBehavior.maximum:1`; implementation uses 2 (SDK invariant). ADR-0005 + worker-tuning.ts:30-35 + wisdom ws-MqePhs document authoritatively. Fast-follow change needed post-archive to correct spec text. The `adv_delta_modify` tool requires the exact SHA-256 of the pre-archive global-spec requirement, which doesn't exist yet, so in-flight delta text correction is not possible from within the change.
- **Deferred suggestions** (validated, deferred to /adv-harden): add explicit `owningSession` field to diagnose queue entries; thread sessionId through reImportChangeState + store-consolidate recreateLiveChange; extract computeWorkerQueues helper for DRY across plugin-init spawn sites.
- **adv-engineer sub-agent broke in this session** (3 consecutive empty returns); all code work done inline by orchestrator per the still-failing-inline-fallback policy. May resolve in fresh session.

## Supporting Evidence
- ADR: docs/adr/0005-per-session-task-queue-routing.md
- Deployment notes: docs/deployment-notes-per-session-task-queue-routing.md
- Integration tests: plugin/src/temporal/__tests__/session-routing.itest.ts, legacy-copoll.itest.ts, wedge-isolation.itest.ts, no-orphan-poller.itest.ts, poller-footprint.itest.ts
- Cap module: plugin/src/temporal/worker-tuning.ts (with drift guard in worker-tuning.test.ts:110-126)
- Routing branch: plugin/src/temporal/workflow-start.ts:43-52
- Multi-queue diagnose: plugin/src/tools/temporal-ops.ts:639-684
- Multi-queue status: plugin/src/tools/status-health.ts:367-458 + status-health.session-queue.test.ts
- Review remediation commit: 7ce7c1b8

## Consequence Context
1. **Delivered value**: Cross-session dispatch isolation; ~70% polling-load reduction; peer-session wedge cannot block signals; automatic migration via co-polling.
2. **Enabling-only/follow-up dependency**: None blocking. Spec text drift on rq-isolSessionTaskQueue03 is a documentation fast-follow (post-archive).
3. **Ops readiness**: `adv_status view:"health"` and `adv_temporal_diagnose` now distinguish session-queue from project-queue serviceability. `worker_singleton_enforce` default flip was already in trunk via prior archive (bbbbdbca4).
4. **Migration/data impact**: Implicit (KD-4). In-flight workflows on legacy project queue continue to be polled by every session via co-polling; drain naturally as they archive. No operator action required.
5. **Frontend/preview impact**: not_applicable — backend reliability change, no visual surface.
6. **Collision/release risk**: Minimal. Surface (plugin/src/temporal/*) does not overlap with concurrent slimMutationsToolSurface / addAdvMcpReadSurface / replaceRecoveryToolSprawl / tightenToolOutputDefaults / tightenAdvChatVoice work (DONT6 respected).
7. **Open follow-ups**: 3 suggestions deferred to /adv-harden (owningSession field, reImportChangeState sessionId threading, computeWorkerQueues DRY helper). 1 spec-text correction fast-follow post-archive.
8. **Next action**: Acceptance approval proceeds inline to `/adv-harden isolateAdvWorkerTaskQueues`.