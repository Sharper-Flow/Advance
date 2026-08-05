# Archive: Fix finding routing

**Change ID:** fixFindingRouting
**Archived:** 2026-08-05T04:56:31.829Z
**Created:** 2026-08-05T01:08:03.670Z

## Tasks Completed

- ✅ Add backlog routing to the apply, review, and harden command contracts; add drift-guard asset tests for each.
  > Task checkpoint completed
- ✅ Add per-finding progress-vs-retry discrimination to the retry reducer so a BLOCKED verdict reporting NEW findings is recorded as progress, not a retry.
  > Task checkpoint completed
- ✅ Add backlog routing to the prep MoSCoW Won't path and reframe the design risk-table idiom; add drift-guard asset tests for both.
  > Task checkpoint completed
- ✅ Add a bounded portfolioState field to adv_change_create results: stats + soft warning above threshold, degrading to an explicit unavailable marker on read failure.
  > Task checkpoint completed
- ✅ Make the report-submission clamp emit an explicit budget_warning marker (not silent), and surface it in the doom-loop UX. Report submission never refuses at/over budget.
  > Task checkpoint completed
- ✅ Enforce the already-declared evidencePolicy on avoidance items: extend the gate-readiness evidence check so a task's contract_refs.respects claim on an avoidance/out_of_scope item requires review-evidence authority from a non-claiming agent (adv-reviewer, task-scoped). Self-asserted compliance alone fails. Applies to ALL tasks (no grandfathering); completed tasks' recorded evidence is not re-litigated.
  > Task checkpoint completed
- ✅ Stage the advance-workflow spec deltas, add CHANGELOG entries, and verify cross-cutting consistency (drift-guard anchors fail-on-removal, schemas/manifests green).
  > Task checkpoint completed

## Specs Modified

- **advance-workflow**: 4 delta(s)
