# Executive Summary

## Outcome

Advance can now detect — and tell you about — a stale loaded plugin bundle. Every production build stamps an opaque generation into the bundle and writes an atomic sidecar manifest (`dist/plugin-bundle-manifest.json`, schema v1: generation, index.js SHA-256, ISO built_at). At runtime the loaded generation is compared against the deployed manifest.

## Value

The "deployed new code but the session silently runs old code" failure mode — which caused real confusion during this very release cycle — becomes visible and actionable. No more guessing whether a restart is needed.

## Delivered

- Build-time generation stamping + atomic manifest publication (same-directory temp copy + rename; reviewer hardened this so a partial sidecar can never be observed)
- Typed staleness states: `current`, `PLUGIN_BUNDLE_STALE` (both generations + restart recommendation), bounded `unknown` for missing/malformed manifests — never throws, never blocks init
- `adv_status view:"health"` reports loaded/deployed generations, freshness, recovery action
- Exactly one `[ADV:PLUGIN_BUNDLE_STALE]` system-block section after confirmed replacement; none otherwise
- Deploy refuses build output missing the required manifest
- Docs: no hot reload; restart is the remedy; mtime is advisory only; one-restart bootstrap limitation

## Verification

- Independent reviewer verdict: READY, 0 blocking / 0 nonblocking findings
- 295 scoped tests across 9 files green; `pnpm run check` + production build green
- Contract review matrix: 20/20 rows passing/respected/not-applicable
- Generation equality (not mtime) proven authoritative by dedicated mtime-preserving-deployment test

## Risks / follow-ups

- Bundles loaded before this feature existed report `unknown` until one restart (documented bootstrap limitation)
- Deploy fails closed if `jq` or a SHA-256 utility is unavailable on the host