# Design: Flip Worker Singleton to Multi-Worker Default

## Architecture Overview

This is a **default-flip change** — the existing multi-worker code path (already exercised when `worker_singleton_enforce: false` or `ADV_FORCE_IN_PROCESS_WORKER=1`) becomes the default, and the singleton path becomes opt-in.

```
BEFORE (current):
  tryInitStore → resolveWorkerSingletonPlan → lock acquisition
    → owned? host (spawn worker) : client (no worker)

AFTER (proposed):
  tryInitStore → readBooleanFeatureFlag("worker_singleton_enforce", false)
    → false: always host (spawn worker, no lock)
    → true: resolveWorkerSingletonPlan → lock acquisition (unchanged)
```

No new modules, no new interfaces, no new feature flags. One default value changes, one diagnostic branch gets smarter, spec requirements are relaxed.

## Key Decisions

### KD1: Default flip location — `withStabilityFeatureDefaults`

**Decision:** Change `true` → `false` at line 177 of `types/project.ts`.

**Rationale:** This is the single source of truth for the default value. All consumers read from `withStabilityFeatureDefaults()` output. One line change propagates everywhere.

**Alternative rejected:** Changing `readBooleanFeatureFlag` callsites — would require touching multiple files and risk missing one.

### KD2: Init path — unconditional host role when singleton is off

**Decision:** The existing fast path at `plugin-init.ts:92` already handles this correctly:
```typescript
if (options.forceInProcessWorker || !options.workerSingletonEnforce) {
  return { shouldSpawnWorker: true, workerRole: "host" };
}
```
No code change needed in `resolveWorkerSingletonPlan` — it already does the right thing when the flag is false.

### KD3: Diagnostic fix — server-serviceable branch in `recommendedNextAction`

**Decision:** Add a third branch to the recommendation logic in `temporal-ops.ts:367-371`:

```typescript
const recommendedNextAction = !serverReachable
  ? "Temporal server is unreachable — check that the Temporal service is running"
  : !workerAlive && !serverServiceable
    ? "Temporal worker is not alive and queue has no active pollers — run adv_temporal_restart to restart the worker"
    : !workerAlive && serverServiceable
      ? "Local worker not running; queue is serviceable via peer workers"
      : "Temporal is healthy";
```

Where `serverServiceable` is derived from a lightweight queue poller probe (reuse existing `probeTaskQueuePollers` helper, already imported at line 23).

### KD4: Spec relaxation — complete scope

**Decision:** Relax the following spec requirements:

1. **`rq-workerSingleton01`** — change priority from `MUST` to `SHOULD`. Add preamble: "When `worker_singleton_enforce` is set to `true` in project configuration, singleton enforcement MUST apply as specified below. When omitted or `false`, each plugin instance MAY spawn its own worker."
2. **`rq-advcfg01.2`** — change scenario "then" from "worker_singleton_enforce defaults true when omitted" to "worker_singleton_enforce defaults false when omitted; singleton enforcement is opt-in"
3. **`rq-temporalConcurrentLoad01`** — add scope clause: "Scenarios apply when `worker_singleton_enforce: true` is set in project configuration"

**Rationale:** Three separate spec requirements reference the singleton default. All three must be updated for consistency. The validator identified `rq-advcfg01.2` and `rq-temporalConcurrentLoad01` as missing from the original scope.

### KD5: `worker_role` field — keep reporting honestly

**Decision:** Don't change the `worker_role` field behavior. When singleton is off, every session reports `"host"`. The `getTemporalWorkerRole()` getter continues to return the actual role.

## Implementation Strategy

1. **Flip default** — `types/project.ts` line 177: `true` → `false`
2. **Fix diagnostic** — `temporal-ops.ts`: add server-serviceable branch to recommendation using `probeTaskQueuePollers`
3. **Relax spec** — `docs/specs/advance-meta.md`:
   - `rq-workerSingleton01`: MUST → SHOULD with opt-in preamble
   - `rq-advcfg01.2`: update "then" text
   - `rq-temporalConcurrentLoad01`: add scope clause
4. **Update docs** — `ADV_INSTRUCTIONS.md` line referencing "default true" → "default false"
5. **Update tests** (5 files):
   - `adv-stability-docs-assets.test.ts` (lines 44, 88) — "default true" → "default false"
   - `deploy-local.test.ts` (line 676) — "default true" → "default false"
   - `plugin-init.worker-singleton.test.ts` — verify both modes
   - `status.test.ts` — feature flag default assertions
   - `types/project.test.ts` — default assertion
6. **Run full test suite** — verify no regressions

## LBP Analysis

This change aligns with Temporal's designed operating model (multiple competing workers on a shared task queue). The singleton was introduced as a defensive measure against an assumed coordination problem that doesn't exist in Temporal's architecture. Removing it as the default is the correct long-term position because:

1. Temporal's at-most-once task dispatch makes multi-worker inherently safe
2. N workers provide N× fault tolerance for queue serviceability
3. The lock file coordination adds operational complexity (stale locks, suspect classification, approval flows) that will only grow
4. The "degraded" false alarm erodes trust in diagnostic surfaces

The singleton remains available as a SHOULD for resource-constrained environments.

## Affected Components

| Component | Change Type | Risk |
|-----------|------------|------|
| `types/project.ts` | Default value change | Low — existing explicit configs unaffected |
| `plugin-init.ts` | No code change | None |
| `tools/temporal-ops.ts` | Add diagnostic branch | Low — additive |
| `docs/specs/advance-meta.md` | 3 spec requirement updates | Low — editorial |
| Test files (5) | Assertion updates | Low — mechanical |

## Risks / Mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Resource exhaustion on CI | Medium | CI sets `worker_singleton_enforce: true` or mocks workers |
| Stale project.json silently changes behavior | Low | Intended — explicit `true` configs unaffected |
| Health monitor can't detect local-worker death with peers | Low (existing gap) | Acceptable; not in scope |

## Design Leverage Scout

Scout: skipped — trivially scoped default-flip with no architectural opportunity surface.

## Validation

Validator: CAUTION — resolved inline. Findings addressed:
- `rq-advcfg01.2` default assertion added to spec scope (KD4.2)
- `rq-temporalConcurrentLoad01` conditional scoping added (KD4.3)
- Test file count expanded from 4 to 5 to include `deploy-local.test.ts` and `adv-stability-docs-assets.test.ts`
- No architectural changes needed — scope enumeration only