# Executive Summary: Flip Worker Singleton to Multi-Worker Default

## What was delivered
Flipped the `worker_singleton_enforce` feature flag default from `true` to `false`, making multi-worker the default operating mode for ADV Temporal workers. Each OpenCode session now spawns its own worker by default, eliminating false "degraded" diagnostic alarms in multi-session setups.

## Key changes
- **Default flip** — `withStabilityFeatureDefaults` in `types/project.ts` now returns `false` for `worker_singleton_enforce` when not explicitly set
- **Smarter diagnostics** — `adv_temporal_diagnose` no longer recommends worker restart when the local worker is dead but the queue has active peer pollers
- **Spec relaxation** — `rq-workerSingleton01` downgraded from MUST to SHOULD; `rq-advcfg01.2` updated to reflect new default; `rq-temporalConcurrentLoad01` scoped to opt-in mode
- **Full backward compatibility** — setting `worker_singleton_enforce: true` in project.json restores identical singleton behavior

## Verification
- `pnpm run check`: typecheck + lint + format all clean
- `pnpm test`: 2916/2917 pass (1 pre-existing failure in adv-tron-assets.test.ts unrelated to this change)
- All contract items (5 AC, 4 constraints, 3 avoidances): pass/respected
- Both singleton=true and singleton=false test modes verified

## Impact
Multi-session setups (the standard development pattern) will immediately see accurate "serviceable" status instead of false "degraded" labels. Resource usage increases by ~270MB per additional session (one Node worker process each), which is negligible on workstations already running 700-850MB OpenCode processes.