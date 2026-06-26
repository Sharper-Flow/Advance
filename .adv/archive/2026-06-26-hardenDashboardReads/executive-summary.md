# Executive Summary

Hardened the local ADV dashboard read path so routine `/api/state` refreshes use Temporal Visibility/read-model summaries instead of per-change workflow `getState` fan-out. ADV cards now expose safe local click-through detail pages with compact context, optional expandable deeper data, bounded one-change detail degradation, and copyable `adv_change_show` inspection commands.

Key outcomes:
- Added durable spec law `rq-dashboardWorkerFree01` plus docs mirror and contract test coverage.
- Decoded `AdvWorktreeBranches` and `AdvWorktreePaths` from Visibility into dashboard summaries.
- Removed routine ops/head-SHA enrichment fan-out from dashboard ADV reads; base cards remain visible when optional enrichment is unavailable.
- Added read-only detail API/page routes: `/api/change/{projectId}/{changeId}` and `/change/{projectId}/{changeId}`.
- Updated dashboard UI for local detail links, compact/deeper detail rendering, and source-health degradation cards.
- Preserved local-only/read-only/no-secret/no-raw-state-link constraints.

Verification:
- `bun test bin/lib/dashboard bin/lib/live-status.test.ts` — 68 pass.
- `bin/oc-test targeted -- src/cli-bridge-contract.test.ts` — 19 pass.
- `pnpm run schemas:check` — pass.
- Static source check — no `loadLiveStatus` or `getState` references under `bin/lib/dashboard`.
- Independent acceptance reviewer verdict — READY, no findings.