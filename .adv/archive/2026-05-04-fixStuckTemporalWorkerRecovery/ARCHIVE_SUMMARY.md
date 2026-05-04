# Archive: Fix stuck Temporal worker recovery

**Change ID:** fixStuckTemporalWorkerRecovery
**Archived:** 2026-05-04T07:55:15.220Z
**Created:** 2026-05-04T04:08:20.933Z

## Tasks Completed

- ✅ Update advance-meta spec laws for verified worker recovery

TDD intent: not_applicable
Delegation hint: inline_required
Touched files:
- .adv/specs/advance-meta/spec.json

Scope:
- Replace rq-toolTimeoutOverride01.2 fire-and-forget restart scenario with bounded verified recovery scenario.
- Amend rq-workerSingleton01 body and rq-workerSingleton01.2 so v1 alive-PID fallback protects passive initialization/known-serviceable owners but not suspect recovery states.
- Add rq-workerSingleton01.6 for suspect legacy live lock requiring approval to reclaim.
- Add rq-workerHealth01 queue serviceability diagnostics scenario.

Acceptance:
- Spec text has Given/When/Then scenarios for success, timeout/failure, and approval-gated suspect v1 live lock.
- Normal plugin init remains exempt from describeTaskQueue/serviceability probes.
- Existing spec-law conflict with the approved design is removed before archive validation.
  > Updated advance-meta spec to replace fire-and-forget worker restart law with bounded verified recovery, add suspect legacy live-lock approval-gated reclaim scenario, extend worker health diagnostics with queue serviceability, and update sync-global drift assertions. Verified with targeted Vitest and Prettier check.
- ✅ Add queue serviceability classifier and Temporal poller probe

TDD intent: inline
Delegation hint: inline_required
Touched files:
- plugin/src/temporal/queue-serviceability.ts
- plugin/src/temporal/queue-serviceability.test.ts
- plugin/src/temporal/health-probe.ts (probe reuse/adaptation if needed)

Red phase:
- Add tests for serviceable local owner, serviceable fresh server poller, stale/no poller, unavailable describeTaskQueue, stale running workflow count, and peer-owned unknown evidence.
- Run: pnpm test -- src/temporal/queue-serviceability.test.ts src/temporal/health-probe.test.ts

Green phase:
- Implement typed QueueServiceability result with status, confidence, evidence, and blockers.
- Use DescribeTaskQueue when available but do not require it during normal plugin initialization.
- Preserve 10s verification semantics: success requires at least one strong positive serviceability plane; unknown evidence cannot produce success for peer-owned queues.

Acceptance:
- Local-owner confidence works without server poller evidence.
- Peer-owned PID-only evidence returns unknown/failure without fresh server poller evidence.
- Probe failures are explicit as unavailable, not silently collapsed to healthy empty results.
  > Added `queue-serviceability.ts` with typed classification and DescribeTaskQueue poller probing. Added tests for local-owner confidence, fresh server pollers, peer-owned unavailable evidence, stale/no poller states, and unavailable probes. Verified targeted serviceability/health tests, Prettier, and typecheck.
- ✅ Expose local worker diagnostics for in-process and OOP workers

TDD intent: inline
Delegation hint: inline_required
Touched files:
- plugin/src/plugin-init.ts
- plugin/src/temporal/worker-multi.ts
- plugin/src/temporal/out-of-process-worker.ts
- plugin/src/plugin-init.test.ts
- plugin/src/temporal/worker-multi.test.ts

Red phase:
- Add tests that diagnostics include queue list, childPid/childRunning/restartCount/pending registrations/register errors for OOP multi-worker.
- Add tests that in-process local readiness can support confidence:local without DescribeTaskQueue.
- Run: pnpm test -- src/plugin-init.test.ts src/temporal/worker-multi.test.ts

Green phase:
- Add `getTemporalWorkerDiagnostics()` or equivalent read-only helper.
- Ensure respawn ready/registration failures affect diagnostics and do not leave misleading healthy state.
- Keep passive plugin init behavior unchanged; no serviceability probe during normal lock read.

Acceptance:
- Diagnostics expose enough local evidence for verified restart, diagnose, and status.
- Both in-process and OOP local readiness paths are tested.
- Existing singleton lock behavior remains safe for passive initialization.
  > Added `getTemporalWorkerDiagnostics()` to expose in-process and OOP worker state with queues, failedQueues, alive state, and OOP diagnostics. Expanded plugin-init and worker-multi tests to cover diagnostic output including childPid, childRunning, restartCount, pending registrations, and register errors.
- ✅ Implement verified worker restart with approval-gated suspect-lock recovery

TDD intent: inline
Delegation hint: inline_required
Touched files:
- plugin/src/tools/temporal-ops.ts
- plugin/src/tool-registry.ts
- plugin/src/plugin-init.ts
- plugin/src/temporal/worker-lock.ts
- plugin/src/tools/temporal-ops.test.ts
- plugin/src/temporal/worker-lock.test.ts
- plugin/src/tool-registry.test.ts or existing registry drift test

Red phase:
- Replace fire-and-forget tests with failing tests for 10s verified success, structured timeout failure, local-confidence success, peer-owned unknown failure, and approved suspect v1 lock reclaim.
- Add tests that unapproved live-PID reclaim is refused with approval-required diagnostics.
- Add test that tool registration has explicit timeout override with rq-toolTimeoutOverride01 rationale.
- Run: pnpm test -- src/tools/temporal-ops.test.ts src/temporal/worker-lock.test.ts src/tool-registry.test.ts

Green phase:
- Replace `adv_temporal_worker_restart` fire-and-forget body with awaited bounded verification.
- Add optional approval args for live v1 lock reclaim (`approvedLockReclaim` + `approvalEvidence`) or equivalent explicit approval path.
- Reuse dead-PID and stale-v2-heartbeat automatic reclaim; do not auto-reclaim live v1 locks.
- Ensure restart path does not report failure while leaving an uncontrolled background spawn continuing.

Acceptance:
- success:true only after serviceability proof.
- failure output includes expected queue, registered queues, worker lock, serviceability evidence, stale workflow count/probe status, worker diagnostics, and next action.
- approved suspect-lock recovery records prior PID/schema/queue/evidence and approval evidence.
- healthy singleton owner is never duplicated or reclaimed silently.
  > Replaced fire-and-forget `adv_temporal_worker_restart` with awaited bounded verification against queue serviceability. Added optional approval args for suspect live legacy v1 lock reclaim, with audit metadata for prior PID/schema/queue/evidence. Added explicit 15s safeExecute timeout override for the 10s verification budget. Preserved dead-PID/stale-v2 automatic recovery and kept fresh/live locks protected.
- ✅ Use queue serviceability in diagnose and status health output

TDD intent: inline
Delegation hint: inline_required
Touched files:
- plugin/src/tools/temporal-ops.ts
- plugin/src/tools/status.ts
- plugin/src/temporal/health-probe.ts
- plugin/src/tools/temporal-ops.test.ts
- plugin/src/tools/status-temporal-health.test.ts
- plugin/src/tools/target-read-tools.test.ts
- SETUP.md or docs/temporal-recovery.md if field descriptions move

Red phase:
- Add tests for `suspect_live_legacy_lock` recommendation: alive v1 PID + no heartbeat + no serviceable queue recommends approval-gated recovery/OpenCode restart, not repeated blind restart.
- Add tests that healthy serviceable peer returns no duplicate restart/reclaim recommendation.
- Add tests that cross-project status labels current-session worker health separately from target-project queue serviceability.
- Run: pnpm test -- src/tools/temporal-ops.test.ts src/tools/status-temporal-health.test.ts src/tools/target-read-tools.test.ts

Green phase:
- Add queue serviceability to Temporal health/diagnose payload and formatted status output.
- Preserve backward-compatible raw fields where practical.
- Update recommendation ordering to use serviceability before stale queue/orphan-sweep guidance.

Acceptance:
- Diagnose classifies #22/#23/#24 shape as suspect or unserviceable with actionable next action.
- Status output cannot imply current Advance worker health equals target PokeEdge queue health.
- Probe unavailable states are visible, not silently healthy.
  > Added queue serviceability snapshots to `adv_temporal_diagnose` and `adv_status view:health`, including expected queue, local worker diagnostics, server poller probe status, stale workflow count, and blockers. Updated recovery recommendations so suspect live legacy v1 locks require explicit approval/OpenCode owner restart, while fresh server poller evidence can mark peer-owned queues serviceable. Formatted status now separates worker process health from target queue serviceability.
- ✅ Add bounded project-workflow access recovery for worktree creation

TDD intent: inline
Delegation hint: inline_required
Touched files:
- plugin/src/tools/project-workflow-helper.ts
- plugin/src/tools/worktree/state.ts
- plugin/src/tools/adv-worktree.ts
- plugin/src/tools/worktree/index-create.test.ts
- plugin/src/tools/worktree/state-session-lifecycle.test.ts
- plugin/src/tools/worktree/migration.test.ts if helper shape changes

Red phase:
- Add tests that worker-unavailable project workflow access triggers exactly one bounded non-approval recovery attempt, then retries access once.
- Add tests that approval-gated suspect-lock requirement returns structured failure instead of reclaiming or suggesting in-place edits.
- Add tests that non-worker unavailable reasons do not run recovery.
- Run: pnpm test -- src/tools/worktree/index-create.test.ts src/tools/worktree/state-session-lifecycle.test.ts src/tools/worktree/migration.test.ts

Green phase:
- Centralize recovery at project-workflow access seam (`recovery: "once"` or adjacent helper).
- Keep git worktree implementation decoupled from worker internals.
- Surface expected queue, local queues, lock health, serviceability status, and next action in failure output.

Acceptance:
- `adv_worktree_create` either reaches workflow-backed access after one verified recovery or fails with actionable diagnostics.
- No live-PID lock reclaim occurs without explicit approval args.
- No output suggests in-place edits as fallback.
  > Added bounded `recovery: "once"` strategy to `getBoundedProjectWorkflowAccess`: when worker readiness fails, runs a single non-approval `restartCurrentProjectTemporalWorker` attempt and re-checks readiness. On suspect live legacy-v1 lock failures (WORKER_LOCK_HELD + schema_version=1 + not_serviceable), returns `unavailable` with rich `recommendedNextAction` requiring explicit approval and a `queueServiceability` snapshot built via `classifyQueueServiceability` + `probeTaskQueuePollers` — never recommends in-place edits as fallback (rq-workerSingleton01.6). Wired the worktree-state seam (`state.ts:resolveAccess`) to pass `recovery: "once"`; migration/wisdom/agenda paths preserve historical no-recovery behavior. Typecheck clean; targeted helper tests 3/3 pass; 5-file worktree batch 31/31 pass; cross-consumer sweep 107/107 pass.
- ✅ Update recovery docs and incident tracker for corrected Temporal model

TDD intent: inline
Delegation hint: inline_required
Touched files:
- docs/temporal-recovery.md
- docs/temporal-worker-stuck-investigation.md
- SETUP.md if health field definitions change
- relevant docs/tests asserting guidance text

Red phase:
- Add or update docs/guidance assertions that poller rows are freshness evidence, restart is verified, live v1 lock reclaim is approval-gated, and OpenCode restart remains fallback when serviceability cannot be proven.
- Run targeted docs/guidance tests if existing (e.g. manifest/doc drift tests); otherwise run format/check after docs updates.

Green phase:
- Update runbook and incident tracker with final recovery ladder and new diagnostic fields.
- Remove stale fire-and-forget guidance.
- Preserve source-vs-dist caveat: worker code changes need build/fresh session where applicable.

Acceptance:
- Docs explain why poller rows expire but live workers keep refreshing them.
- Docs distinguish Temporal backend correctness from ADV worker lifecycle bugs.
- Agent-facing guidance names verified restart, approval-gated reclaim, and OpenCode restart fallback.
  > Updated docs/temporal-recovery.md: rewrote the worker-restart section for verified semantics (10 s budget, structured failure envelope, expected queue + queueServiceability + recommendedNextAction); added new subsections for approval-gated suspect live legacy v1 lock reclaim, bounded recovery: "once" at the project-workflow access seam, and an explicit "poller rows are freshness evidence" explanation; added a suspect-v1 row to the worker-auto-respawn health-shape table; added a suspect-v1 row to the external-restart-boundary table; added a `fixStuckTemporalWorkerRecovery` lineage entry. Created docs/temporal-worker-stuck-investigation.md as the historical incident summary covering #22/#23/#24, what was wrong (fire-and-forget restart, over-protective v1 fallback, no worktree recovery seam), what changed (4 planes: spec laws, serviceability classifier, recovery surfaces, worktree seam), final recovery ladder, and source-vs-dist caveat. SETUP.md unchanged — it does not document temporal_health field shapes. Format check passes; drift tests (sync-global + manifest) 102/102 pass.
- ✅ Run cross-cutting regression verification for #22/#23/#24 recovery class

TDD intent: inline
Delegation hint: inline_required
Touched files:
- tests touched by earlier tasks
- docs/temporal-worker-stuck-investigation.md if final evidence summary needs update

Red phase:
- Add a failing regression/integration-style test or composed unit test that models the shared incident shape: server alive, expected queue not serviceable, v1 alive-PID lock with no heartbeat, stale running workflows, and worktree create blocked before filesystem creation.
- Run the targeted regression command chosen by implementation.

Green phase:
- Confirm the implemented recovery path returns structured diagnose/restart/worktree results for the incident shape.
- Run targeted suites from all touched areas, then `pnpm run check` from plugin/.
- If feasible in-session, run `pnpm test` for full suite; if runtime/tool behavior changed, note build+fresh OpenCode requirement for live tool validation.

Acceptance:
- Regression covers #22, #23, #24 failure class.
- Targeted tests for serviceability, restart, lock, diagnose/status, worktree, specs/docs pass.
- `pnpm run check` passes from plugin/.
- Final notes clearly state whether live ADV tool behavior was source-tested only or build/fresh-session verified.
  > Added a labeled regression guard test (`regression: fixStuckTemporalWorkerRecovery incident shape`) in plugin/src/tools/project-workflow-helper.test.ts that models the exact #22/#23/#24 shared incident shape: server alive, expected queue not_serviceable, suspect v1 alive-PID worker.lock with no heartbeat, stale running workflow count > 0, no local registration. The test asserts: exactly one bounded non-approval restart attempt, mode=unavailable, reason naming "suspect live legacy v1 worker.lock", recommendedNextAction containing "explicit approval" and never "in-place", queueServiceability.status=not_serviceable, evidence covering localRegistered/localWorkerAlive/localOwnership(peer)/staleRunningWorkflowCount=6/blockers. Test passed on first run because the recovery contract from tk-e34aba61 was already in place. Fixed pre-existing mock gap in plugin/src/tools/status.test.ts (added getService to ../temporal/service mock factory; required by computeStatusQueueServiceability added in tk-669c7976 but mock had not been updated). Verification: cross-cutting touched-area sweep 19 files / 259 tests pass; full suite (pnpm test) 168 files / 3086 tests pass / 7 skipped / 0 failures; `pnpm run check` clean (typecheck + test-isolation + lint + prettier). Source-only validation: source edits to plugin/src/ do not take effect in the current OpenCode session per AGENTS.md "Source-vs-Dist Reload Gotcha" — live behavior of `adv_temporal_worker_restart` (verified semantics + approval-gated suspect reclaim) and `adv_worktree_create` (bounded recovery seam) requires `pnpm run build:worker` plus a fresh OpenCode session for end-to-end validation. Source-tested in-session via Vitest red→green; live-session validation deferred to a fresh session post-merge.
- ✅ Extend recovery specs for re-entry incidents #25/#26/#27

TDD intent: inline
Delegation hint: inline_required
Touched files:
- .adv/specs/advance-meta/spec.json
- .adv/specs/advance-delivery/spec.json
- plugin/src/sync-global.test.ts or related spec drift tests

Scope:
- Add spec law for fresh v2 worker.lock heartbeat that is not queue-serviceable: heartbeat proves holder liveness only, not expected queue serviceability.
- Add spec law that live unserviceable v1/v2 lock reclaim requires explicit approval evidence unless dead PID or stale v2 heartbeat proves stale.
- Add spec law that an owner must stop renewing heartbeat when its own local worker remains unserviceable past grace, so the v2 lock can expire without manual deletion.
- Add spec law that `adv_temporal_reconnect` is STSL-only and must not be recommended as worker-registration recovery when queue serviceability is negative.
- Add delivery/checkpoint law for `checkpointRecorded:false`: git commit success plus ledger write failure blocks task completion until ledger retry/status recovery.
- Add worktree law if missing: `adv_worktree_create`/apply preflight must reuse existing `change/<id>` worktree before recovery/create and must never suggest in-place edits fallback.

Red phase:
- Add failing drift/spec tests asserting the new laws and guidance tokens.
- Run targeted spec/asset test(s).

Green phase:
- Update specs and synced guidance assertions.
- Re-run targeted spec/asset tests and formatting.

Acceptance:
- Specs cover #25 fresh v2 poison-pill heartbeat, #26 `checkpointRecorded:false`, #27 reconnect boundary, and transcript worktree-reuse failure.
- Existing #22/#23/#24 verified recovery laws remain intact.
- Spec drift tests pass.
  > Updated .adv/specs/advance-meta/spec.json and .adv/specs/advance-delivery/spec.json for #25/#26/#27/worktree/checkpoint re-entry gaps; updated plugin/src/sync-global.test.ts drift assertions. Green evidence and incremental formatting/test verification passed; checkpoint commit ca5b456 recorded.
- ✅ Implement fresh-v2 unserviceable worker recovery and heartbeat self-expiry

TDD intent: inline
Delegation hint: inline_required
Touched files:
- plugin/src/temporal/heartbeat-writer.ts
- plugin/src/temporal/heartbeat-writer.test.ts
- plugin/src/plugin-init.ts
- plugin/src/plugin-init.test.ts
- plugin/src/temporal/worker-lock.ts
- plugin/src/temporal/worker-lock.test.ts
- plugin/src/tools/temporal-ops.ts
- plugin/src/tools/temporal-ops.test.ts
- plugin/src/tools/status-temporal-health.test.ts
- plugin/src/tools/project-workflow-helper.ts
- plugin/src/tools/project-workflow-helper.test.ts
- plugin/src/utils/tool-formatters.ts

Scope:
- Treat fresh v2 heartbeat as host/owner liveness evidence only; do not treat it as queue serviceability proof.
- Add local-only serviceability guard to heartbeat writer/registration so a lock owner stops renewing when its own local worker remains unserviceable beyond grace.
- Extend suspect-lock classification from legacy v1 to live unserviceable v2 where serviceability is negative but PID/heartbeat is alive/fresh.
- Keep automatic reclaim only for dead PID or stale v2 heartbeat; live unserviceable v1/v2 reclaim requires explicit approval evidence and audit metadata.
- Add `worker_lock_held_by_self`/equivalent diagnostics when current session owns the lock but is not serving the expected queue.
- Ensure restart/diagnose/workflow-access recommendations do not loop blind restarts and do not recommend `adv_temporal_reconnect` for worker-registration failure.

Red phase:
- Add failing tests for fresh v2 heartbeat + no registered queue/no poller returning suspect/unserviceable instead of healthy/peer-spawn-pending.
- Add failing heartbeat-writer test where local serviceability stays false and heartbeat stops/self-exhausts before poison-pill freshness continues indefinitely.
- Add failing approved live-v2 reclaim test recording prior PID/schema/workerId/expectedQueue/approval evidence.
- Add failing diagnose/status/workflow-access tests for self-owned unserviceable lock and reconnect boundary.

Green phase:
- Implement serviceability guard, suspect v2 classification, approved reclaim audit, and recommendation ordering.
- Run targeted Temporal/runtime/status/project-workflow tests.

Acceptance:
- #25 shape is classified actionable, not healthy.
- No fresh v2 unserviceable owner can keep heartbeating forever without serving its queue.
- No live v1/v2 lock is reclaimed without explicit approval unless dead/stale rules apply.
- Diagnostics distinguish self-owned unserviceable lock, peer-owned unserviceable lock, STSL issue, and serviceable peer.
  > Implemented fresh-v2 unserviceable worker recovery and heartbeat self-expiry. Heartbeat writer now accepts expected queue/local serviceability guard and stops renewing when unserviceable past grace. Worker-lock recovery distinguishes fresh/stale v2 heartbeat from queue serviceability, keeps automatic reclaim to dead/stale cases, and requires approval/audit for live unserviceable v1/v2 locks. Temporal diagnose/restart/project-workflow guidance now identifies self/peer unserviceable locks and avoids blind reconnect loops for worker-registration failures. Added regression coverage for heartbeat self-expiry, approved live-v2 reclaim, fresh-v2 suspect diagnostics, plugin-init wiring, and status/project-workflow guidance.
- ✅ Make worktree creation reuse existing change worktrees before recovery or create

TDD intent: inline
Delegation hint: inline_required
Touched files:
- plugin/src/tools/worktree/index.ts
- plugin/src/tools/worktree/index-create.test.ts
- plugin/src/tools/adv-worktree.ts if wrapper output shape changes
- plugin/src/tools/project-workflow-helper.ts if recovery seam call order needs adjustment
- .opencode/command/adv-apply.md
- ADV_INSTRUCTIONS.md
- docs/temporal-worker-stuck-investigation.md if incident notes need final update

Scope:
- Add tool-level detection/reuse for existing `branch refs/heads/change/<change-id>` worktree before any workflow-backed registry recovery or `git worktree add` path.
- If branch record exists but path is missing, prune stale git worktree metadata and continue bounded create.
- If path exists, return success with existing path/branch/base/head and mark output as reused; do not require Temporal worker recovery first.
- Ensure command/agent guidance says reuse existing worktree is mandatory before diagnosing worker locks.
- Preserve merge-before-delete safety and registry update semantics.

Red phase:
- Add failing tests where `adv_worktree_create` sees an existing change branch/path and returns reuse without invoking project-workflow recovery or `git worktree add`.
- Add failing stale-path test: missing path causes prune/create path, not in-place fallback.
- Add guidance/assertion test if existing command assets cover worktree reuse.

Green phase:
- Implement reuse detection and structured reused output.
- Re-run worktree create/state tests and relevant asset tests.

Acceptance:
- Transcript failure class cannot recur: existing worktree is discovered and reused before worker recovery.
- `adv_worktree_create` never suggests in-place edits fallback.
- Stale/missing worktree entries are pruned/bounded before fresh create.
  > Implemented git-authoritative worktree reuse preflight in advWorktreeCreate. The tool now parses `git worktree list --porcelain` before base resolution, stale-basis checks, flock, workflow registry writes, or `git worktree add`; if the requested branch already has an on-disk worktree, it returns success with `reused:true`, existing path, branch, baseRef, and headSha. If git worktree metadata points at a missing path, it runs `git worktree prune` and proceeds to bounded fresh create with `reused:false`. Added regression tests proving reuse avoids workflow updates/base checks and stale metadata is pruned before fresh create.
- ✅ Harden checkpoint ledger recovery and reconnect guidance

TDD intent: inline
Delegation hint: inline_required
Touched files:
- plugin/src/tools/checkpoint.ts
- plugin/src/tools/checkpoint.test.ts
- plugin/src/tools/temporal-ops.ts
- plugin/src/tools/temporal-ops.test.ts
- .opencode/command/adv-apply.md
- ADV_INSTRUCTIONS.md
- docs/temporal-recovery.md

Scope:
- Ensure `adv_task_checkpoint` returns `checkpointRecorded:false` with actionable remediation when git commit/clean checkpoint succeeds but task-run ledger update fails.
- Ensure `/adv-apply` guidance treats `checkpointRecorded:false` as blocking task completion: run `adv_task_run_status`, retry checkpoint/ledger event, then only mark done after checkpoint recorded.
- Ensure `adv_temporal_reconnect` guidance remains STSL/client-only and is not recommended as a worker-registration or queue-serviceability fix when the expected queue is not serviceable.
- Preserve existing auto-verification-before-checkpoint behavior and strict ledger state machine.

Red phase:
- Add failing/reconfirming tests for dirty-tree committed checkpoint with ledger write failure and clean-tree checkpoint with ledger write failure.
- Add failing tests that diagnose/recommendation text for worker-not-serviceable does not route through `adv_temporal_reconnect`.
- Add command/guidance assertion if existing asset tests cover apply-loop checkpoint semantics.

Green phase:
- Implement/remediate checkpoint outputs, apply guidance, and reconnect recommendation ordering.
- Run targeted checkpoint, temporal-ops, and asset tests.

Acceptance:
- #26 shape cannot be marked done after `checkpointRecorded:false`.
- #27 shape recommends verified worker recovery / owner restart / approval path as appropriate, not STSL reconnect.
- Remediation text gives exact next actions and no blind retry loop.
  > Hardened checkpoint ledger recovery for both dirty commit and clean-tree paths. `adv_task_checkpoint` remediation now states `checkpointRecorded:false` blocks task completion until `adv_task_run_status` plus retry/missing ledger recovery yields `checkpointRecorded:true`. `/adv-apply` and ADV instructions now explicitly prohibit `adv_task_update status: done` after `checkpointRecorded:false`. Temporal recovery docs now separate STSL reconnect from worker-registration/queue-serviceability recovery and document fresh-v2 unserviceable lock approval-gated handling.
- ✅ Run final cross-scope recovery verification for #22/#23/#24/#25/#26/#27

TDD intent: separate_verification
Delegation hint: inline_required
Touched files:
- tests touched by re-entry tasks
- docs/temporal-worker-stuck-investigation.md if final evidence summary needs update

Scope:
- Extend the existing regression guard to cover both original #22/#23/#24 stuck-worker shape and re-entry #25/#26/#27 shapes.
- Verify old v1 suspect lock, fresh-v2 unserviceable lock, self-owned unserviceable lock, existing-worktree reuse, checkpointRecorded:false ledger recovery, and reconnect-not-worker-recovery recommendations compose correctly.
- Run targeted suites from all touched areas, then `pnpm run check` from plugin/.
- If feasible, run full `pnpm test`; otherwise document targeted evidence plus source-vs-dist build/fresh-session caveat.

Red phase:
- Add failing composed regression(s) for any uncovered cross-scope incident path.
- Run chosen targeted regression command.

Green phase:
- Confirm all implemented paths return structured diagnose/restart/worktree/checkpoint results.
- Run target suites, `pnpm run check`, and full suite if feasible.

Acceptance:
- Regression coverage names #22, #23, #24, #25, #26, and #27.
- Targeted tests for serviceability, heartbeat, restart, lock, diagnose/status, worktree, checkpoint, specs/docs pass.
- `pnpm run check` passes from plugin/.
- Final notes clearly state source-tested vs build/fresh-session live tool validation status.
  > Ran final cross-scope recovery verification for #22/#23/#24/#25/#26/#27. Verified original v1 suspect lock handling, fresh-v2 unserviceable lock handling, self/peer diagnostics, worktree reuse/prune preflight, checkpointRecorded:false ledger blocking, reconnect-not-worker-recovery boundary, spec drift, command assets, status/plugin-init paths, and full repo tests. Fixed final full-suite findings by preserving ADV_INSTRUCTIONS line ceiling and adding `rq-checkpointLedger01` citation.

## Specs Modified


## Wisdom Accumulated

- **[gotcha]** Spec-drift tests may preserve exact legacy phrases such as `v1 fallback` even when the semantic spec rewrite is correct. When changing spec law text, update assertions and keep continuity tokens intentionally where tests/docs rely on them.
- **[gotcha]** Registry timeout-override tests extract only the `toolName: registerTool(...)` block, so the `rq-toolTimeoutOverride01` rationale token must appear inside that block, not only in the preceding comment.
- **[pattern]** When adding health diagnostics to `adv_status`, update all three planes together: raw `fullOutput`, `applyStatusView('health')` projection, and `formatStatusOutput()` labels. Otherwise new raw fields exist internally but disappear from user-facing health output.
- **[gotcha]** When a readiness check uses `getTemporalWorkerAliveness() && getRegisteredTemporalWorkerQueues().includes(...)`, JS short-circuit will skip the queues call when aliveness is false. Tests that rely on `vi.fn().mockReturnValueOnce([])...mockReturnValue([...])` to model recovery cycles will silently miscount. Preserve the historical eager-call pattern (compute `queues` first, then check `alive`) so each readiness check consumes one mock value from each helper.
- **[gotcha]** `adv_run_test` can execute a command successfully but fail to persist final evidence with `WorkflowUpdateFailedError` even when Temporal server/worker/queue and project/change workflows diagnose healthy. Do not complete the task from the shell pass alone: retry once after `adv_temporal_diagnose`; if it still fails, use `adv_task_evidence` with captured output, then require `adv_task_checkpoint` to return `checkpointRecorded:true` before `adv_task_update done`.
- **[pattern]** For worktree-create recovery paths, use `git worktree list --porcelain` as the first authority before Temporal registry access. Existing branch/path reuse can complete without project-workflow recovery, base resolution, flock, or `git worktree add`; missing paths should run `git worktree prune` before fresh create.
