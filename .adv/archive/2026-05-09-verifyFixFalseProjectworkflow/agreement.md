# Discovery Agreement

## Facts

- Issue #67 is open, labeled bug/priority:low/needs-verify.
- Current `adv_temporal_diagnose` in this session reports success: server reachable, worker alive, STSL initialized, recommended action "Temporal is healthy".
- The bug is verify-first: fix only if false `projectWorkflow NOT_FOUND` still reproduces or source/test inspection shows a gap.

## Decisions

- Treat this as verification-first; avoid code churn if current behavior is healthy.
- Plan must capture direct live diagnostic evidence and add/fix tests only if source-level gap remains.
- Preserve actionable diagnostics for true missing workflow states.

## Risks / Unknowns

- Live session health may not cover startup/race states reported by the issue.
- Cached plugin dist can differ from source after self-modification.

## Out of Scope

- Broad Temporal diagnosis redesign.
- Restarting worker unless verification indicates need.