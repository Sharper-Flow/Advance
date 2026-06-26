# Archive: Simplify dashboard view

**Change ID:** simplifyDashboardView
**Archived:** 2026-06-26T06:04:10.656Z
**Created:** 2026-06-26T04:50:24.877Z

## Tasks Completed

- ✅ Implement typed dashboard grouping in lane builder
  > Extended the typed dashboard lane item model with `GroupedLaneItem`. Added deterministic grouping for duplicate workflow_run/deployment items by kind, status, title, and branch/ref metadata. Added latest timestamp selection, open PR priority in unmatched, and draft ADV inventory summarization when draft count exceeds 5. Preserved lane keys: attention, active, unmatched, inventory.
- ✅ Render grouped and compact dashboard lanes safely
  > Updated dashboard UI to render typed grouped lane items as read-only `<details class="group-card">` disclosures. Summaries show count/status/latest text without links; member cards render inside details through existing item renderers. Inventory groups preview at most 5 members and report hidden count. Existing `safeUrl`, `escapeHtml`, metadata, and no-mutation rendering paths remain in use.
- ✅ Verify live-shape dashboard compactness end to end
  > Task checkpoint completed

## Specs Modified


## Wisdom Accumulated

- **[pattern]** For dashboard compactness, compress duplicate source history in the typed lane-builder layer, not in UI heuristics. Group by structural display identity (kind + status + title + branch/ref), keep count/latest/member details in typed lane items, and leave the UI as a safe renderer.
- **[gotcha]** Static HTML-template tests can become brittle when they assert exact JavaScript expressions. For dashboard UI behavior, assert durable rendering contracts (uses groupHtml/details/safeUrl/escapeHtml/no forms) but avoid overfitting to equivalent implementation expressions.
- **[gotcha]** Deployment status objects can contain the useful status timestamp even when the deployment object itself lacks `updated_at`. When grouping deployment history, propagate status `updated_at` into the projected deployment item so group latest-time reflects the status event, not an empty deployment shell.
