# Archive: Improve dashboard lanes

**Change ID:** improveDashboardLanes
**Archived:** 2026-06-26T04:43:01.394Z
**Created:** 2026-06-26T03:32:23.717Z

## Tasks Completed

- ✅ Implement deterministic actionability lane classifier and typed lane item model
  > Replaced implementation-first lanes with actionability lanes: `attention`, `active`, `unmatched`, and `inventory`. Added typed `DashboardLaneItem` union and `SummaryLaneItem`. Draft/non-actionable ADV changes now route to inventory; pending/active ADV changes route to active; failed/cancelled source items route to attention; running source items route to active; successful/skipped workflow/deployment history is summarized into inventory.
- ✅ Project GitHub source metadata into safe lane card summaries
  > Added deterministic GitHub source metadata projection into lane items. PR cards now carry number/title, URL, updated time, repo, branch, and SHA metadata when present. Workflow-run cards carry workflow/display title, URL, updated time, repo, branch, conclusion, and SHA metadata when present. Deployment cards carry environment/ref/status/SHA metadata. `buildDashboardState` now passes project GitHub owner/repo into lane building for repo metadata.
- ✅ Update dashboard UI for actionability lanes and metadata cards
  > Updated dashboard UI to render actionability lanes (`Attention`, `Active work`, `Unmatched source`, `Inventory`) and project stats for those lanes. Added generic metadata, URL, updated-at, subtitle, and unmatched-source rendering over typed lane item fields. Preserved compact ADV cards, degraded setup card, HTML escaping, and no mutation controls/forms.
- ✅ Wire server state and live dashboard verification for new lanes
  > Task checkpoint completed

## Specs Modified


## Wisdom Accumulated

- **[pattern]** For dashboard lanes, use a separate actionability predicate instead of reusing broad active-status constants meant for lifecycle listings. In this dashboard, `draft` is inventory/noise, while active work is only `pending`/`active`; pin the split with lane-classifier tests.
- **[pattern]** When a backend correlator preserves raw `unknown` source payloads, add a typed view-model projection before UI rendering. Use deterministic field extraction at the lane-builder boundary (repo, branch, URL, recency, status/conclusion) so the UI stays a dumb escaped formatter and does not infer source shapes heuristically.
- **[success]** Keeping the dashboard UI as a formatter over lane item fields made the lane taxonomy change small: update lane definitions, stats labels, and generic metadata rendering without adding source-shape logic to the browser script.
- **[gotcha]** Full `bun test bin/` can fail when the installed dashboard service is already occupying fixed port 8765 because the collision test binds that port first. For local verification after installing the service, stop `adv-dashboard-pokeedge.service`, run tests, then restart and doctor-check the service.
