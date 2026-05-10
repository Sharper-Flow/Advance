# Archive: Fix hot-change recommendation self-worker attribution

**Change ID:** fixHotChangeRecommendationSelf
**Archived:** 2026-05-09T21:31:41.759Z
**Created:** 2026-05-09T07:54:03.838Z

## Tasks Completed

- ✅ Implement self-vs-peer hot-change attribution before rendering another-agent warning while preserving privacy boundaries.
  > Updated hot recency recommendation logic to distinguish self-owned from peer-owned work when session identity is available.
- ✅ Add failing status/session regression for caller-owned hot change rendered as self-owned and peer-owned change still warning appropriately.
  > Added status test for caller-owned vs peer-owned hot change recommendation wording.
- ✅ Run focused status/session tests and plugin check; document verification evidence.
  > Task checkpoint completed

## Specs Modified

