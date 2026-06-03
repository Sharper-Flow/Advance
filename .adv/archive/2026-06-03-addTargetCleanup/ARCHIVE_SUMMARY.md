# Archive: Add target cleanup

**Change ID:** addTargetCleanup
**Archived:** 2026-06-03T19:04:55.704Z
**Created:** 2026-06-03T18:30:15.356Z

## Tasks Completed

- ✅ Update worktree-lifecycle spec for target cleanup
  > Updated worktree-lifecycle spec and markdown docs with target-project cleanup routing requirement covering unconfirmed target mutation rejection, approved target store/Temporal routing, preserved safety gates, and actionable target triage recommendations.
- ✅ Add target-path support to worktree delete and cleanup tools
  > Added target worktree mutation args and routed delete/cleanup target_path calls through `withTargetPathStore` with `temporal-required` target state. Existing delete/cleanup safety functions remain sole authorities. Added tests for target store routing and unconfirmed target mutation rejection.
- ✅ Make worktree triage recommendations target-aware
  > Extended triage with current-project context so target-project inspections include `target_path`, `target_confirmed`, and confirmation evidence guidance in delete/cleanup recommendations. Updated wrapper to pass current root and tests to cover target recommendations.
- ✅ Regenerate schemas and run verification
  > Ran schema check, targeted worktree tests, smoke validation, and full repo validation. Applied Prettier formatting for touched TypeScript files after smoke identified formatting drift.

## Specs Modified


## Wisdom Accumulated

- **[pattern]** When a read-only ADV triage tool accepts a target project/root and recommends a mutation tool, the mutation tool must support the same target context or the recommendation becomes non-actionable from cross-project sessions. Capture this as spec law, not only operator guidance.
- **[success]** Passing the current store root into read-only triage let recommendation formatting distinguish same-project vs target-project inspections without making triage mutate state or introducing heuristic path guessing.
- **[gotcha]** `bin/oc-test smoke` catches Prettier drift after targeted tests pass; run formatter on touched TypeScript before smoke/full to avoid false implementation regressions.
