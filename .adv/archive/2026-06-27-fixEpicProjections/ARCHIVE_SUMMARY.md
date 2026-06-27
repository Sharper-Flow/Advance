# Archive: Fix epic projections

**Change ID:** fixEpicProjections
**Archived:** 2026-06-27T20:38:27.506Z
**Created:** 2026-06-27T01:19:37.980Z

## Tasks Completed

- ✅ Add atomic Epic retarget workflow primitive
  > Added atomic Epic retarget primitive across typed payloads, Epic workflow signal names/messages, workflow handler, pure Epic reducer, Temporal store operation, Store interface, disk compatibility stub, and focused reducer/store tests. Reducer preserves entry identity/order, updates child reference/status/audit fields, rejects source mismatch and duplicate target, and supports idempotent retry.
- ✅ Implement parent-only Epic repair modes
  > Implemented `remove_stale_entry` and `retarget_stale_entry` repair modes. Removal branches before stale-child load and calls parent unlink. Retarget validates `new_change_id`, loads only target child, refuses conflicting membership before parent mutation, calls `retargetChange`, and sets/refreshes target child membership/terminal status. Existing sync/clear/mark/terminal behavior remains covered by tests.
- ✅ Implement Epic link recovery for matching child membership
  > Updated `adv_epic_link_change` to reconcile exact matching child `epic_membership` before rejecting. Missing parent is rebuilt through `linkChange`; stale parent with explicit entry intent retargets through `retargetChange`; mismatched `epic_id` or `entry_id` returns current-membership output with no mutation. Added tests for rebuild, retarget, and mismatch refusal.
- ✅ Update Epic repair schemas and documentation checks
  > Verified schema artifacts are current and touched Epic repair files conform to Prettier. No documentation/schema update was required beyond implementation already present. Unrelated Epic warrant-surface issue remains out of scope as planned.
- ✅ Run integrated Epic repair verification
  > Task checkpoint completed

## Specs Modified

