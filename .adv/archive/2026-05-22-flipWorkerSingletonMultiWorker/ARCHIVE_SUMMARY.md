# Archive: Flip worker singleton to multi-worker default

**Change ID:** flipWorkerSingletonMultiWorker
**Archived:** 2026-05-22T07:32:43.232Z
**Created:** 2026-05-22T06:46:28.220Z

## Tasks Completed

- ✅ Flip `worker_singleton_enforce` default from `true` to `false`
  > Flipped worker_singleton_enforce default from true to false in withStabilityFeatureDefaults. Updated project.test.ts assertion. RED/GREEN verified.
- ✅ Fix `adv_temporal_diagnose` recommendation for server-serviceable case
  > Added server-serviceable branch to adv_temporal_diagnose recommendation. Now distinguishes dead-worker-with-peers from dead-worker-no-pollers. 8 tests pass including new multi-worker case.
- ✅ Relax spec requirements in advance-meta.md
  > Relaxed 3 spec requirements: rq-workerSingleton01 MUST→SHOULD with opt-in preamble, rq-advcfg01.2 default text updated, rq-temporalConcurrentLoad01 scoped to singleton=true.
- ✅ Update test assertions and docs to reflect new default
  > Updated 6 files: adv-stability-docs-assets.test.ts (2 assertions), deploy-local.test.ts (1 assertion), status.test.ts (1 fixture), ADV_INSTRUCTIONS.md, docs/temporal-recovery.md, .adv/specs/advance-meta/spec.json. All targeted tests pass.
- ✅ Run full test suite and verify both modes
  > pnpm run check: clean (typecheck+lint+format). pnpm test: 2916/2917 pass. 1 failure is pre-existing (adv-tron-assets.test.ts - old lgrep tool names), confirmed failing on main. All worker-singleton related tests pass in both singleton=true and singleton=false modes.

## Specs Modified

