# Design — fixSignalHandlerThrow

## Goal

Convert all signal handlers in `plugin/src/temporal/workflows.ts` from throw-based error handling to state-mutation rejection, per Temporal LBP (https://docs.temporal.io/handling-messages#exceptions) and existing canonical ADV examples (`applyGateStuckToState`, KD-8 Layer 2).

## Independent Validation

Validator: `adv-researcher` (session `ses_18fa5c39bffeWEpmif2Ay8UbBw`)
Verdict: **CAUTION** — proceed with three corrections incorporated below.

Validator sources: Temporal handling-messages, deterministic-constraints, safe-deployments, SDK PR #519, SDK issue #1390.

## Key Decisions

### KD-1: Payload digest implementation — pure-JS only

**Constraint:** `node:crypto` is on the Temporal SDK's known-problematic list per SDK PR #519 and issue #1390. Webpack cannot bundle Node built-ins into the workflow sandbox. `createHash` will fail the worker bundle.

**Decision:** Use a hybrid digest:
```ts
{
  payload_size: sortedJsonString.length,
  payload_sample: sortedJsonString.slice(0, 256),  // truncated for size
  payload_fnv1a: fnv1a32(sortedJsonString),         // 32-bit FNV-1a hash, pure JS
}
```

Pure-JS FNV-1a is fast, deterministic, replay-safe under the Temporal sandbox, and bundles cleanly. A 32-bit hash is fine for diagnostic correlation (NOT cryptographic identity). Sorted-key JSON ensures stable input across object-key insertion-order variation.

Helper lives in new `plugin/src/temporal/digest.ts` (workflow-safe, no Node built-ins). Bundle-boundary test (`workflow-bundle-boundary.test.ts`) asserts `digest.ts` is reachable from `workflows.ts` and imports nothing from `node:*` or `storage/`.

### KD-2: CancelledFailure / TemporalFailure passthrough

**Constraint:** Workflow cancellation depends on `wf.CancelledFailure` and `wf.TemporalFailure` propagating through handler error paths. Catching them silently masks cancellation, which is a different antipattern.

**Decision:** Inside the new wrapper's catch block:
```ts
catch (err) {
  if (err instanceof wf.CancelledFailure || err instanceof wf.TemporalFailure) {
    throw err;  // propagate Temporal-system errors
  }
  applySignalRejectionToState(state, { signalName, error: err, payload, rejectedAt: ... });
}
```

This matches Temporal's recommendation: catch programmer errors, propagate framework errors.

### KD-3: Convert ALL 4 direct `safeUpdateHandler` call sites too

**Original plan:** Leave the 4 direct call sites (`gateCompleted`, `archiveRequested`, `changeCancelled`, `archiveChange`) alone because their inner logic implements state-mutation rejection for expected failures.

**Validator finding:** Their `safeUpdateHandler` wrapper still throws `ApplicationFailure.nonRetryable` on unexpected errors (e.g., bugs in the inner async logic, transient activity failures that bubble up unexpectedly). These throws still fail the workflow per Temporal docs.

**Decision:** Extend the conversion to the 4 direct call sites. We introduce a `signalAsync` wrapper that handles async signal handlers correctly, and migrate those 4 sites to use it. `safeUpdateHandler` itself is **renamed and repurposed** for future `wf.defineUpdate` use only (currently unused).

Concretely:
- `safeUpdateHandler` → renamed to `__reservedForFutureUpdateHandlers` with a TODO comment, or removed entirely (since it has zero active callers after the migration). Decision: **remove entirely**, plus add a structural test asserting no `setHandler` call site uses anything except `signalMutation` or `signalAsync`. Adding it back later is cheap if we ever adopt `wf.defineUpdate`.
- New `signalAsync(signalName, asyncHandler)`: catches sync + async errors, applies state-mutation rejection, never throws (except `CancelledFailure`/`TemporalFailure`).
- `signalMutation` becomes a thin convenience over `signalAsync` for sync apply functions.

### KD-4: Telemetry surfaces

Add two telemetry hooks:
1. `wf.log.warn("signal-rejected", { signalName, errorMessage, payloadDigest })` for every rejection — visible in Temporal Web UI and structured logs.
2. `signal_rejections_total: number` counter alongside the ring buffer — un-bounded counter (small numeric, no history-size concern) so operators can see "this workflow has rejected 47 signals" even after older entries are evicted.

### KD-5: Ring buffer bound = 20

Per validator: 20 entries × ~512 bytes per entry (size + 256-char sample + fnv1a + metadata) ≈ 10 KB per workflow. Well under Temporal's 50 MB per-workflow limit. Sufficient for "what recently went wrong" diagnostics; total counter handles long-tail.

### KD-6: Replay-safety contract

`signal_rejections` and `signal_rejections_total` are both additive-optional fields per https://docs.temporal.io/develop/safe-deployments. Histories predating this change replay cleanly with both fields undefined. No `wf.patched()` marker required.

Confirmed against `workflow-bundle-boundary.test.ts:45-54` import boundary — new `digest.ts` must be workflow-safe.

### KD-7: TDD-first sequence

Test order (per C5 and AC6/AC7):
1. **RED test A (AC6):** Register a failing apply function for an existing signal; signal the workflow; assert workflow does NOT fail, `state.signal_rejections` has exactly 1 entry, subsequent signals process normally. Expected: fails currently because workflow throws.
2. **RED test B (AC7):** Structural test parsing `workflows.ts` source for `wf.setHandler(*Signal, ...)` call sites; asserts all use `signalMutation(...)` or `signalAsync(...)`. Expected: passes currently for 34 sites, fails for the 4 direct-`safeUpdateHandler` sites.
3. **GREEN:** Implement `digest.ts`, `applySignalRejectionToState`, `SignalRejection` type, rewrite `signalMutation`, add `signalAsync`, migrate the 4 sites, remove `safeUpdateHandler`.
4. **EXTRA:** Replay test with a pinned history that exercises a signal rejection. Per Safe Deployments contract, an old history without the field MUST replay cleanly post-change.

## Module Layout

```
plugin/src/temporal/
├── digest.ts                       # NEW — FNV-1a + sorted-JSON serializer; workflow-safe
├── digest.test.ts                  # NEW — determinism + bundle-boundary check
├── change-state.ts                 # +applySignalRejectionToState helper
├── contracts.ts                    # +SignalRejection type + signal_rejections field
├── workflows.ts                    # rewrite signalMutation; add signalAsync; remove safeUpdateHandler; migrate 4 direct sites
└── workflows.signal-handlers.test.ts  # +AC6 test + AC7 structural test + replay test

docs/adr/
└── 0003-signal-handlers-must-not-throw.md   # NEW
```

## Risks

**R1.** Removing `safeUpdateHandler` is a wider blast radius than the original plan. Mitigation: structural test pins the new contract; the 4 sites already have internal state-mutation rejection for expected failures, so the migration is mechanical.

**R2.** FNV-1a is a non-cryptographic hash; collisions are possible (1 in ~4B). Acceptable for diagnostic correlation. Mitigation: the size + 256-char sample fields provide additional distinguishing evidence.

**R3.** A bug in `signalAsync` could mask real errors. Mitigation: AC6 test asserts state contains the rejection; `wf.log.warn` per rejection ensures observability; the bundle-boundary + replay tests catch deeper regressions.

**R4.** The structural test (AC7) parses `workflows.ts` source. Source rewrites (e.g. moving handlers to a separate file) will need to update the test. Acceptable trade-off for the durability win.

## Spec Citations

No new spec requirements needed. This change references existing wisdom `pw-TPaAlADl` and existing canonical examples (`applyGateStuckToState`, KD-8 Layer 2). ADR 0003 is the durable artifact.
