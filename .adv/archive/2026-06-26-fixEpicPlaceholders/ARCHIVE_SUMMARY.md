# Archive: Fix Epic placeholders

**Change ID:** fixEpicPlaceholders
**Archived:** 2026-06-26T05:37:21.976Z
**Created:** 2026-06-26T04:50:58.911Z

## Tasks Completed

- ✅ Pin adv_change_create Epic placeholder preflight behavior
  > Added adv_change_create FIELD_POLICIES for epic_id, entry_id, epic_title, and epic_order; added cross-field validation requiring complete real create-time Epic membership; added regression matrix coverage for blank Epic fields, omission sentinels, partial membership rejection, and valid complete membership preservation.
- ✅ Implement adv_change_create Epic membership normalization
  > Changed adv_change_create to seed epic_membership only when complete epic_id, entry_id, and epic_title are present; partial direct handler calls return typed INVALID_EPIC_MEMBERSHIP_SEED before create. Verified with preflight and change tests.
- ✅ Implement missing-Epic stale projection repair fallback
  > Added a clearMissingEpicProjection fallback for adv_epic_repair_membership mode clear_stale_projection when the owner Epic row is missing. The fallback requires entry_id and change_id, loads the child through the existing target_path trust path, dry-runs safely, clears only exact matching epic_id+entry_id projections, and returns typed PROJECTION_MISMATCH on mismatch. Added repair tests and fixed formatting drift surfaced by format:check.

## Specs Modified

