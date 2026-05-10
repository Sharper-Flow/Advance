# Discovery Agreement

## Facts

- Issue #33 is open, labeled bug/priority:low/needs-verify.
- Current live `adv_temporal_diagnose` reports success: server reachable, worker alive, STSL initialized, recommended action "Temporal is healthy".
- `adv_status` startup also reports Temporal server alive and worker healthy/serviceable.
- This is verify-first; code change should happen only if false-negative path is reproducible or insufficiently covered.

## Decisions

- Capture live healthy evidence and inspect health-check source/test coverage before changing code.
- Preserve actionable diagnostics for truly dead/wedged workers.
- Prefer source-level regression over timing sleeps if a false-negative seam exists.

## Risks / Unknowns

- Live healthy evidence may not cover stale PID/lock or startup race conditions.
- Cached dist can differ from source after self-modifying changes.

## Out of Scope

- Restarting or reconfiguring worker unless verification requires it.
- Broad Temporal health subsystem redesign.