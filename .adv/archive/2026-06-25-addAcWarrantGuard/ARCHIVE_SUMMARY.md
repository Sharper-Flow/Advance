# Archive: Add AC warrant guard

**Change ID:** addAcWarrantGuard
**Archived:** 2026-06-25T15:00:57.212Z
**Created:** 2026-06-25T14:09:33.756Z

## Tasks Completed

- ✅ Warrant parse + pure resolver (KD1/KD3)
  > Task checkpoint completed
- ✅ Live tool-surface wiring + no-cycle guard (KD2)
  > Task checkpoint completed
- ✅ Discovery classification + spec law + asset tests (KD4)
  > Task checkpoint completed
- ✅ Backfill fixStaleCloseVisibility AC6 (KD5)
  > Task checkpoint completed
- ✅ Wisdom capture + ADR draft + full gate verification (AC7)
  > Task checkpoint completed

## Specs Modified


## Wisdom Accumulated

- **[gotcha]** A failed reproduction attempt is NOT a requirement. In discovery, classify every reproduction-sourced finding as broken_capability | unwarranted_operation | unverified before it can seed an acceptance criterion; unwarranted_operation/unverified findings must never seed a "must-work" criterion. Never harden a hedged/unverified observation into a firm AC. Capability-presuming criteria (those asserting a tool/arg/spec surface exists or must work) must declare a `[warrant: tool:<name>#<arg> | spec:<rq-id>]` tag, verified structurally against the live tool surface at contract mint (CONTRACT_UNRESOLVED_WARRANT fail-fast). Behavioral criteria need no warrant (proportionality). Real defect that motivated this: fixStaleCloseVisibility AC6 asserted adv_change_archive target_path routing — archive has no target_path and shouldn't (phase9 git finalization is repo-local). Caught only by the late design validator; the guard moves the catch to discovery + mint. Source-of-truth for "does this surface exist": tool-registry getToolSurface() injected via runtime dynamic import to keep the pure validator cycle-free.
