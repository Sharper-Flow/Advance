# Archive: Doctor script: classify blank rows by orphan-vs-live, not just by age

**Change ID:** doctorScriptClassifyBlankRows
**Archived:** 2026-05-09T21:31:24.777Z
**Created:** 2026-05-09T03:58:47.248Z

## Tasks Completed

- ✅ Add failing regression tests for live_in_flight, idle_active_session, and orphan_ghost blank assistant row buckets plus apply deleting only orphan ghosts.
  > Updated opencode-session-debt tests to cover liveness buckets, fail-closed age-only handling, and orphan-only deletion selection.
- ✅ Implement live/orphan classification with injectable liveness and update doctor dry-run/apply behavior to fail closed and delete only orphan ghosts.
  > Added liveness bucket schema, fail-closed classifier behavior, orphan-only deletion helper, and doctor script wiring.
- ✅ Run focused doctor/session-debt tests and plugin check; document verification evidence.
  > Task checkpoint completed

## Specs Modified

