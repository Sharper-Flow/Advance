# Archive: Improve dashboard cards

**Change ID:** improveDashboardCards
**Archived:** 2026-06-26T18:25:14.694Z
**Created:** 2026-06-26T18:05:59.735Z

## Tasks Completed

- ✅ Replace dashboard lifecycle status with gate progress and sort cards
  > Added structural `GATE_ORDER` and `completedGates` fields for ADV status cards. Each dashboard lane sorts `adv_change_status` items by completed gate count descending, then last activity descending, title ascending, and id ascending; degraded items remain first in `needs_attention`. Removed lifecycle status rendering from ADV status cards and legacy ADV change cards, replacing it with `Gate progress` display alongside the existing next-gate badge. Updated dashboard model/UI/server tests for new sort and rendering behavior.

## Specs Modified

