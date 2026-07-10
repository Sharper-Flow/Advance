# Acceptance

Reviewed at: 2026-07-10T23:18:31.213Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| AC1 | acceptance_criterion | **AC1:** Archive Step 5.0 states that `./scripts/deploy-local.sh --fix` from repository root is the primary local deploy command and, when output is stale, it rebuilds plugin distribution before syncing the runtime copy. | pass | Focused archive asset test GREEN 32/32 (run tr_mrfjycml_b05f78f9) asserts deploy-local.sh --fix from repo root and stale-distribution rebuild before sync; reviewer READY confirmed source match. |
| AC2 | acceptance_criterion | **AC2:** Step 5.0 states that `deploy-local.sh --fix` attempts to bounce matching deployed Temporal workers; it does not direct operators to manually terminate a worker. If that bounce cannot complete, the callout routes worker recovery to `adv_temporal_worker_restart`. | pass | Focused GREEN 32/32 asserts automatic deployed-worker bounce, manual-termination prohibition, and adv_temporal_worker_restart recovery route; reviewer READY. |
| AC3 | acceptance_criterion | **AC3:** Step 5.0 requires restart of the relevant OpenCode session/plugin host before claiming host-loaded plugin code is active, then directs the operator to re-invoke the affected tool. It does not claim automatic host restart or live-reload proof. | pass | Focused GREEN 32/32 asserts OpenCode session/plugin-host restart, affected-tool re-invocation, and no-auto-restart wording; reviewer READY. |
| AC4 | acceptance_criterion | **AC4:** Phase 8 records pending OpenCode activation through the existing `Local deploy` field using a defined `ran; OpenCode activation pending restart` state; it does not add an unstructured report line or a new report row. | pass | Attempt-2 RED failed while unstructured advisory wording remained; GREEN 32/32 proves existing Local deploy row uses ran; OpenCode activation pending restart and test asserts no appended advisory line. |
| AC5 | acceptance_criterion | **AC5:** Archive autonomy asset coverage fails if the deploy-script behavior, OpenCode-host restart/re-invocation instruction, worker-recovery route, or structured `Local deploy` activation state is removed. | pass | Behavior-level static asset test covers AC1–AC4 and negative assertion for the removed contradictory phrase; RED then GREEN run evidence recorded. |
| C1 | constraint | Keep the callout in the existing Local Deploy Gate and reuse existing deploy visibility and `rq-deployWorkerBounce01` behavior. | respected | Reviewed two-file diff changes only existing Local Deploy Gate and its existing Phase 8 Local deploy field. |
| C2 | constraint | No new spec law, tool, worker logic, config, or archive/PR finalization behavior. | respected | Checkpoint 0988178f touches only .opencode/command/adv-archive.md and plugin/src/adv-autonomy-quality-assets.test.ts; reviewer found no runtime/tool/spec/config/git/PR changes. |
| C3 | constraint | Keep `docs/temporal-recovery.md` as the canonical source for surface-specific reload and recovery guidance. | respected | Callout routes failed worker bounce to adv_temporal_worker_restart and preserves docs/temporal-recovery.md as source-specific recovery authority. |
| OOS1 | out_of_scope | Changing `scripts/deploy-local.sh` behavior. | not_applicable | Reviewed diff does not modify scripts/deploy-local.sh; this behavior remains intentionally out of scope. |
| OOS2 | out_of_scope | Adding automatic OpenCode host restart or worker process management beyond existing deploy/recovery tooling. | not_applicable | No automatic OpenCode host restart or new worker lifecycle management was introduced; documentation describes existing behavior only. |
| OOS3 | out_of_scope | Changing release, merge, push, or PR finalization semantics. | not_applicable | No release, merge, push, or PR finalization semantics changed; reviewer confirmed scoped docs/test diff only. |

