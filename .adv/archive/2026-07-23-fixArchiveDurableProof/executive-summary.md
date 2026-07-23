# Executive Summary — fixArchiveDurableProof

## Outcome

Fixed a systemic ADV archive blocker: no shipped change could complete `adv_change_archive phase9:"run"`. Every archive failed at the durable release-gate proof with `Store-backed durable release gate proof did not observe release done` (`rq-releaseProjectionDurability01`), even though Phase 9 git finalization succeeded and the workflow confirmed the release gate `done`.

## Why it matters

This was a hard blocker on the entire release/archive lifecycle — two shipped-to-trunk changes (`fixDurableProofFallback`, `fixAdvRunTestPipefailFalse`) were permanently unarchivable despite being merged and gate-done. Any future shipped change would hit the same wall. Unblocking archive restores the end of the ADV 7-gate lifecycle.

## Root cause (verified against source)

The archive release-gate flow's `completeReleaseGateAfterFinalization` called `store.changes.refresh(changeId)` after polling confirmed the release gate `done`. `refresh`'s `dualWriteAfterMutation` re-queries the workflow and can cache a stale pre-signal `pending` snapshot (the residual `fixPhase9StatusSignal` race), poisoning the in-memory `changeCache` that `getTemporalChange` serves. The subsequent `verifyReleaseGateDurableForArchive` then read `pending` from the poisoned cache and blocked.

## What changed

A single, minimal, spec-law-compliant fix:
- Added `store.changes.invalidate(changeId)` — a cache-drop-only operation (no readback query, no best-effort disk write) — to the Store interface, temporal store, and disk store (no-op).
- On the confirmed-done branch of `completeReleaseGateAfterFinalization`, replaced `store.changes.refresh` with `store.changes.invalidate`. The proof's `store.gates.get` → `getTemporalChange` now misses the cache and queries the workflow fresh → `release=done`.

Deliberately NOT changed: the durable proof, the disk-fallback, the audited recovery writer, and the `RELEASE_GATE_RECOVERY_REASONS` forge-guard allowlist. (An earlier design revision reused the recovery writer; the independent validator proved that violates `rq-releaseRepairRecovery01`, since the recovery writer is permitted only for completed/poisoned workflows. Rev 2 fixes the actual root cause — cache poisoning — instead.)

## Verification

- RED: a repro test models the #305 residual cache-poisoning race (refresh readback returns stale `pending` after the poll saw `done`) and fails on the pre-fix code; passes after the fix.
- GREEN/VERIFY: `archive-gate.test.ts` (15 tests) and `change.archive-phase9.test.ts` (47 tests) green — 62 total, including a new AC4 forge-guard regression (forged/unrecognized recovery audit still rejected).
- `pnpm run check` green: schemas, typecheck, lint, format, generated manifests, test-isolation, lockfile policy.
- Independent review (adv-reviewer): verdict READY, zero blocking findings, no scope drift.

## Spec-law compliance

- `rq-releaseProjectionDurability01.1` ✓ — store-backed read reports `done` (fresh query after cache drop).
- `rq-releaseRepairRecovery01` ✓ — recovery writer untouched; not used on a running workflow.
- `rq-cacheRefresh01` ✓ — cache dropped; next read is fresh.
- `fixDurableProofFallback` forge guard ✓ — proof/disk-fallback/allowlist unchanged.

## Release Readiness Summary

- **Static validation:** `pnpm run check` green (schemas, typecheck, lint, format:check, generated manifests, test-isolation, lockfile). `git diff --check` clean.
- **Test evidence:** 62 targeted tests pass (archive-gate 15 + change.archive-phase9 47), independently re-confirmed by the orchestrator (durable run IDs tr_mrxtk3k2, tr_mrxtl2fi). Includes the #305 RED→GREEN repro and the AC4 forge-guard regression.
- **Independent review:** adv-reviewer verdict READY (attempt 1), zero blocking/non-blocking findings, no scope drift, no required remediation.
- **Spec-law conformance:** all four governing requirements satisfied (above).
- **Change footprint:** +207/-30 across 6 files; 3 clean commits (ac8c3b9d, bed2f0db, 31448672).
- **CI:** not yet observed (no PR pushed); runs during archive Phase 9 (PR → adv-ci-waiter → merge).
- **Migration/data impact:** none — cache-drop only; no schema, data, or config migration.
- **Collision/release risk:** low — focused, additive (one new no-op-ish public method + one call-site swap); no breaking API change; no other `store.changes.refresh` caller shares the confirmed-poll→immediate-durable-proof pattern (reviewer-confirmed; all left unchanged).

## Risks & follow-ups

- **AC5 (live proof) — post-deploy ops obligation:** archive `fixDurableProofFallback` and `fixAdvRunTestPipefailFalse` AFTER this change is merged + deployed + plugin restarted. Operationally this is a *post-release* verification (the archive *is* the merge; AC5 needs the deployed fix). The enabling code is verified at acceptance (unit tests are Store-boundary-modeled; AC5 confirms live Temporal behavior). If AC5 fails post-deploy, it surfaces as a new defect — high confidence it will pass given the verified root-cause fix.
- **Residual-race fallback (documented, not triggered):** if a future case shows a fresh query returning `pending` despite the workflow holding `release=done` (a Temporal query-consistency issue independent of the cache), escalate to a bounded store-backed confirmation. The RED repro confirmed the cache-poisoning mechanism, so this fallback was not needed.
- **Adjacent `store.changes.refresh` callers:** reviewer confirmed none share the confirmed-poll→immediate-durable-proof pattern; left unchanged.

## Files

`plugin/src/storage/store-types.ts`, `plugin/src/storage/store-temporal/changes.ts`, `plugin/src/storage/store-disk.ts`, `plugin/src/tools/change/archive-gate.ts`, `plugin/src/tools/change/archive-gate.test.ts`, `plugin/src/tools/change.archive-phase9.test.ts` (+207/-30, 3 commits).
