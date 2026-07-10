# Contract Traceability

**Change ID:** addArchiveDeployCallout
**Contract Version:** 1
**Rigor:** minimal
**Reviewed:** 2026-07-10T23:18:31.213Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | Focused archive asset test GREEN 32/32 (run tr_mrfjycml_b05f78f9) asserts deploy-local.sh --fix from repo root and stale-distribution rebuild before sync; reviewer READY confirmed source match. |
| AC2 | acceptance_criterion | pass | test | Focused GREEN 32/32 asserts automatic deployed-worker bounce, manual-termination prohibition, and adv_temporal_worker_restart recovery route; reviewer READY. |
| AC3 | acceptance_criterion | pass | test | Focused GREEN 32/32 asserts OpenCode session/plugin-host restart, affected-tool re-invocation, and no-auto-restart wording; reviewer READY. |
| AC4 | acceptance_criterion | pass | test | Attempt-2 RED failed while unstructured advisory wording remained; GREEN 32/32 proves existing Local deploy row uses ran; OpenCode activation pending restart and test asserts no appended advisory line. |
| AC5 | acceptance_criterion | pass | test | Behavior-level static asset test covers AC1–AC4 and negative assertion for the removed contradictory phrase; RED then GREEN run evidence recorded. |
| C1 | constraint | respected | static_check | Reviewed two-file diff changes only existing Local Deploy Gate and its existing Phase 8 Local deploy field. |
| C2 | constraint | respected | static_check | Checkpoint 0988178f touches only .opencode/command/adv-archive.md and plugin/src/adv-autonomy-quality-assets.test.ts; reviewer found no runtime/tool/spec/config/git/PR changes. |
| C3 | constraint | respected | static_check | Callout routes failed worker bounce to adv_temporal_worker_restart and preserves docs/temporal-recovery.md as source-specific recovery authority. |
| OOS1 | out_of_scope | not_applicable | not_applicable | Reviewed diff does not modify scripts/deploy-local.sh; this behavior remains intentionally out of scope. |
| OOS2 | out_of_scope | not_applicable | not_applicable | No automatic OpenCode host restart or new worker lifecycle management was introduced; documentation describes existing behavior only. |
| OOS3 | out_of_scope | not_applicable | not_applicable | No release, merge, push, or PR finalization semantics changed; reviewer confirmed scoped docs/test diff only. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-6b2c35708d71 | AC1, AC2, AC3 | AC4 | C1, C2 |  |
| tk-aa4973a8dde1 | AC1, AC2, AC3, AC4 | AC5 | C1, C2, C3 |  |
