# Archive: Close cross-project mutation safety + ergonomics gaps: fix structural target_path routing on holdout task tools, add uniform dryRun preview, and ship non-LLM CLI for ergonomic cross-project ADV tool execution. Establishes the operational completeness of the multirepoproductlinking foundation so ADV agents can safely + fluently work across linked-product repos (e.g. pokeedge-web ↔ pokeedge) without context loss or per-call LLM tax.

**Change ID:** closeCrossProjectMutation
**Archived:** 2026-05-11T23:21:25.786Z
**Created:** 2026-05-11T20:41:59.191Z

## Tasks Completed

- ✅ T1 — Add shared target_path schema and dryRun-safe mutation override in target-project.ts.
  > Added shared `targetPathSchema` in target-project.ts and added dryRun-safe `mutation` override behavior to `withTargetPathStore`, scoped only to trust-gate resolution. Added target-project tests for temporal-required dry-run target reads without mutation confirmation and shared schema parsing.
- ✅ T2 — Add target_path routing parity to adv_task_add.
  > Added shared `targetPathSchema` usage to `adv_task_add` and wrapped the entire add-task flow in `withTargetPathStore` when `target_path` is provided. Target routing now covers planning-gate lock, blockedBy validation, priority calculation, taskAddedSignal, and context snapshot, with `_projectContext` returned for target calls.
- ✅ T3 — Add target_path routing parity to adv_task_cancel and adv_task_reclassify_tdd.
  > Added shared `targetPathSchema` usage to `adv_task_cancel` and `adv_task_reclassify_tdd`. Wrapped both flows in target-store closures so validation, task lookup, change resolution, signals, and snapshots use the target store when `target_path` is provided. Added `_projectContext` output for target calls.
- ✅ T4 — Add same-shape dryRun to change mutation tools.
  > Added same-shape `dryRun` support to `adv_change_close`, `adv_change_bulk_close`, and `adv_change_reenter`. DryRun branches now validate inputs/selection/status and return preview responses with `dryRun: true` while skipping Temporal signals and disk cleanup/sweep.
- ✅ T5 — Add same-shape dryRun to adv_task_cancel, including target_path dryRun behavior.
  > Added same-shape `dryRun` support to `adv_task_cancel`. DryRun validates approval, reasons, and task IDs, returns `wouldCancel` preview with `dryRun: true`, and skips taskCancelledSignal. Target-path dryRun now routes through target store with `mutation: false` so validation can read target Temporal state without untrusted mutation confirmation.
- ✅ T6 — Add same-shape dryRun to worktree deletion/cleanup tools.
  > Added `dryRun` args to `adv_worktree_delete` and `adv_worktree_cleanup`, passed dryRun into underlying worktree functions, and added no-delete guards. Delete dryRun returns success preview after integration/uncommitted checks and before hooks/removal. Cleanup dryRun reports retained pending deletions without deleting or clearing registry entries.
- ✅ T7 — Add same-shape dryRun to conformance override/unlock actions.
  > Added `dryRun?: boolean` support to `adv_conformance` unlock/override. DryRun now validates audit inputs and tracked spec, computes normal same-shape response plus `dryRun: true`, and skips state save, audit append persistence, and conformance signals. Added tests proving unlock dryRun leaves locked state/audit unchanged and override dryRun skips audit write/signal.
- ✅ T8 — Add spec deltas for cross-project task mutation routing, dryRun mutation behavior, and non-LLM execution investigation outcome.
  > Added advance-workflow requirements `rq-crossProjectTaskMutation01`, `rq-dryRunMutation01`, and `rq-nonLlmToolExec01`; bumped spec version to 1.8.1. Added external citations in task/conformance implementation comments and F10 investigation doc so spec-citation invariant passes. Formatted touched files.
- ✅ T9 — Update ADV docs and GitHub issue context for F10/#71 and cross-project tool matrix.
  > Updated ADV_INSTRUCTIONS target_path support list to include adv_task_reclassify_tdd, added dryRun/non-LLM execution guidance, compressed Cross-Project Coordination to pass line guard. Updated AGENTS cross-project gotchas with task mutation routing, dryRun, and non-LLM execution notes. Updated docs/f10-investigation.md with 2026-05-11 #71 outcome and supported paths. Added GitHub issue #71 comment and corrected ADV linked issue URL from Advance#71 to Advance#71.
- ✅ T10 — Cross-project integration and dogfood verification.
  > Ran cross-project/product dogfood reads against `/home/jrede/dev/pokeedge` and `/home/jrede/dev/pokeedge-web` using target_path/product scope; both returned target project context and active changes/tasks. Ran full `pnpm run check`, targeted changed-surface Vitest suite (151 tests), instruction asset suite (70 tests), and `pnpm run build`. Repaired compressed ADV target_path matrix asset test and formatted source files flagged by repo check. Isolated remaining full-suite failure to known unrelated overlay runtime-canary environment test. Built plugin/worker dist successfully; live tool mutation E2E must be re-run in fresh host due OpenCode plugin dist caching.

## Specs Modified


## Wisdom Accumulated

- **[gotcha]** GitHub issue URLs in ADV change metadata can point at stale/renamed repositories. Before updating issue context, verify with `gh issue view` against the actual `git remote` repo; correct ADV links via `adv_change_update_issues` so archive automation targets the reachable issue.
