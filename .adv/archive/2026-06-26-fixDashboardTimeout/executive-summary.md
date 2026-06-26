# Executive Summary

Fixed the live local dashboard `/api/state` timeout discovered after `hardenDashboardReads` shipped. The dashboard default source-reader timeout was 10 seconds, while the live health check and user-visible expectation used an 8-second budget. Slow source reads could therefore make `/api/state` appear hung.

Implemented fix:
- Added `DEFAULT_DASHBOARD_READER_TIMEOUT_MS = 5_000`.
- Changed `buildDashboardState` to use the 5s default while preserving explicit overrides.
- Added a regression test that the default timeout fits the interactive `/api/state` health budget.

Verification:
- `bun test bin/lib/dashboard/server.test.ts` — 12 pass.
- `bun test bin/lib/dashboard bin/lib/live-status.test.ts` — 69 pass.
- Fast-forwarded trunk to commit `4d6a787b5b5cd1d7d00cc381acd7080b864971e4`.
- Restarted `adv-dashboard-pokeedge.service`.
- Live checks passed: `/` 200, `/api/state` 200 within 8s, `/api/change/pokeedge/fixDeployDependency` 200.

Live URL: http://127.0.0.1:8765/