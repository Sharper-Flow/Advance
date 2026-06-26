# Archive: Reframe dashboard status

**Change ID:** reframeDashboardStatus
**Archived:** 2026-06-26T17:45:21.880Z
**Created:** 2026-06-26T14:06:08.272Z

## Tasks Completed

- ✅ Implement ADV-centered latest-source reducer
  > Replaced source-event primary lanes with ADV-centered latest-status lanes: `needs_attention`, `running`, `ready_landed`, `backlog`, and secondary `unmatched_source`. Added `adv_change_status` lane item model and latest-source reducer. Workflow latest identity is `(workflow_id ?? name/title) + branch`; recency uses max valid `run_started_at`, `created_at`, `updated_at`; deployment identity is environment/title + ref. Same-identity newer success/running suppresses older failures; distinct workflows/branches remain visible; missing timestamps cannot suppress valid failures; degraded sources stay visible without false green.
- ✅ Wire server state and lane API to change-centered status board
  > Updated server integration tests and API expectations for the ADV-centered latest-status board. `buildDashboardState` now exposes new lane keys from the reducer (`needs_attention`, `running`, `ready_landed`, `backlog`, `unmatched_source`). Server tests verify linked deployment failure is attached to the ADV change card, live-shaped state uses primary ADV change cards, unmatched source remains secondary, degraded/read-only/cache behavior remains intact.
- ✅ Render ADV-centered dashboard columns and source details
  > Updated dashboard UI to render new ADV-centered columns and `adv_change_status` cards. Lane labels now show Needs attention, Running, Ready / landed, Backlog / inventory, and Unmatched source. Change cards render title/id/status/gate/overall plus latest PR, CI, deployment summaries and read-only source details. Existing safeUrl, escapeHtml, degraded setup, no forms, and no mutation controls are preserved.
- ✅ Verify latest-status board end to end with live-shaped fixtures
  > Verified latest-status dashboard end to end. Targeted dashboard tests cover latest-run precedence, same-identity suppression, distinct workflow/branch failures, missing timestamp conservatism, deployment landed state, secondary unmatched source, degraded fallback, server API shape, UI labels/cards, and read-only constraints. Full `bun test bin/` passed.

## Specs Modified


## Wisdom Accumulated

- **[pattern]** For CI dashboards, derive status via event-to-state fold before lane bucketing. Use stable source identity (`workflow_id ?? name` + branch) plus timestamp recency; never use run id for supersession because reruns/new pushes have different semantics. Pick representative source by overall state so attention cards show the failing current check, not merely newest green check.
- **[success]** For dashboard refactors that intentionally change lane keys, updating model/server/UI tests in sequence kept the blast radius controlled: first prove pure reducer semantics, then server API shape, then static UI contracts, then targeted/full bin verification.
