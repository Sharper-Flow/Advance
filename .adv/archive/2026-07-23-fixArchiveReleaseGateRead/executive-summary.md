# Executive Summary — fixArchiveReleaseGateRead

## Outcome

Closed three read-path gaps that made `verifyReleaseGateDurableForArchive` unable to observe `release=done` for shipped changes, blocking the archive (release gate) of `fixArchiveDurableProof` across 6+ retries and two plugin-host restarts despite the change being fully shipped to origin/trunk.

## Why it matters

The archive durable-proof read is the final gate before a shipped change retires. When it cannot observe `done` (due to query timeouts, cache poisoning, or read-path disconnects), the change becomes permanently un-archivable — a hard blocker on the end of the ADV 7-gate lifecycle that also blocks the very change (`fixArchiveDurableProof`) that fixes the underlying #305 race.

## Root cause (verified live + against source)

A convergence of three independent read-path gaps:

1. **Query timeout too short** — `QUERY_TIMEOUT_MS = 5_000` (hardcoded) was exceeded variably by the SQLite-backed Temporal dev server under multi-worker load (observed 0.1s ↔ >20s replay). The store-backed read timed out and fell back to a stale projection.
2. **Cache poisoning on unfixed #305 branches** — `fireSignalAndRefresh` (gate.ts) and the archive `alreadyDone` branch (archive-gate.ts:1143) still used a racing `refresh` whose readback re-poisoned `changeCache` with stale `pending`. #305 only patched the postSignal branch.
3. **Gap 3 (disproven)** — the original "archive-store-vs-live-disk disconnect" hypothesis was disproven by the independent design validator: `loadChange` and `saveRecoveredGateCompletion` already use the identical `store.paths.changes` path. No third fix was needed.

## What changed

- **Gap 1 (AC1):** `QUERY_TIMEOUT_MS` env-configurable (`ADV_TEMPORAL_QUERY_TIMEOUT_MS`), finite-positive validation, default 5s→15s.
- **Gap 2 (AC2/AC3):** release-gate caller + archive `alreadyDone` branch now call `store.changes.invalidate` (cache-drop, #305 primitive).
- **Forge guard (AC5):** preserved + two-path regression-tested.

Deliberately NOT changed: durable proof authority, disk-fallback, recovery writer, allowlist, git-finalize.

## Verification

- TDD per gap: RED→GREEN AC1 (`tr_mrxy56xv`→`tr_mrxy5rgl`), AC3 (`tr_mrxy7c7z`→`tr_mrxy87k0`); forge-guard `tr_mrxyhs3b`.
- `pnpm run check` green (`tr_mrxyfrvr`); 153/154 tests pass (1 pre-existing, proven on trunk).
- Independent design validation: REVISE→APPROVE architecture; constraints preserved.

## Risks / follow-ups

- 15s default may mask stalls in healthier environments; env-config mitigates (CI pins tighter).
- Pre-existing retry-wrapper test failure (out of scope).
- Post-deploy (non-blocking): re-archive `fixArchiveDurableProof` converges.
- Strategic: `makeReadsDiskAuthoritative` is the broader fix; this is the minimal read-convergence patch.