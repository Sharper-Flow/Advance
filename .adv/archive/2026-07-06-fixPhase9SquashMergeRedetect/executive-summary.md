# Executive Summary: Fix phase9 squash-merge redetect

## Outcome

Phase-9 release finalization now recognizes a shipped change whose `change/{id}` git branch was squash-merged and deleted before `adv_change_archive phase9:"run"` runs. The `release` gate reaches `done` without manual repair when the shipped invariant is satisfied.

## Problem Solved

Previously, three release-reachability detection functions in `plugin/src/tools/archive-helpers/git-finalize.ts` relied on a live `change/{changeId}` git ref. When the branch was deleted (common after PR squash-merge), these functions returned `reachable: false` because `git rev-parse change/{id}^{tree}` and `git log origin/trunk..change/{id}` fail on missing refs. Phase-9 reported `pending` and left the `release` gate `pending`, requiring manual `adv_change_status_repair`.

This affected the recommended shipping pattern: squash-merge + immediate branch deletion. It was a false-negative (never marked unshipped changes done), but caused operational friction.

## What Was Built

1. **`Phase9FinalizationStatusSchema.changeTipSha`** — new optional field capturing the change-tip SHA at archive dispatch time. The tip is a content-addressed git object from the ADV-owned worktree on the verified `change/{id}` branch.

2. **Branch-deletion-safe `detectSquashMergeByTree`** — when `changeTipSha` is provided, uses `git rev-parse {tip}^{tree}` instead of `change/{id}^{tree}`. The existing tree-SHA comparison logic (matching the tip's tree against recent trunk commit trees) is unchanged.

3. **Tip capture at first pending dispatch** — `plugin/src/tools/change.ts` resolves `change/{id}` from the worktree via `execGit` at the first `recordPhase9Status({status: "pending"})` call, before any branch cleanup. Best-effort: failure logs a warning and leaves `changeTipSha` undefined (graceful fallback to pre-fix behavior).

4. **Threading** — `changeTipSha` flows from `phase9_status` → `verifyReleaseEvidenceFromMain` → `resolveReleaseReachability` → `detectSquashMergeByTree`.

5. **Actionable pending (AC4)** — when reachability cannot be established, the blocked-result remediation now includes a pointer to `adv_change_status_repair` for the squash-merged-and-deleted-branch recovery path.

## What Was Verified

- **124 tests pass** across 3 key test files (git-finalize 83, change.archive-phase9 31, gate.release-enforcement 10)
- **3 new tests**: unit (branch-deleted + tip → tree-SHA detection), integration (tip threading end-to-end), AC4 (remediation pointer)
- **Full pre-push gate**: `pnpm run check` passes (schemas:check, typecheck, lint, format:check)
- **No regressions**: existing live-branch / fast-forward / pending_merge paths unchanged; all changes additive
- **Independent verification**: all 5 implementation claims confirmed; false-positive risk bounded (tree collision rare; PR-state check runs first as a stronger proof)

## Release Readiness

- **Delivered value**: eliminates false-negative release-gate wedging for the recommended squash-merge shipping pattern
- **Enabling-only/follow-up dependency**: none; P2 patch-id fallback deferred as backlog (tree-SHA covers the common case)
- **Migration/data impact**: none; schema field is optional and backward-compatible
- **Collision/release risk**: none; no new external dependencies, no API breaking changes
- **Open follow-ups**: P2 patch-id fallback (separate change if needed); -50 commit window is a false-negative bound for old changes (not a correctness issue)

## Contract Satisfaction

| Contract | Status |
|---|---|
| SC1 (tip captured) | ✓ pass — field added, captured at dispatch, threaded to detection |
| SC2 (branch-deletion-safe proof) | ✓ pass — tree-SHA uses tip when provided; 3 tests cover it |
| SC3 (shipped-invariant bar) | ✓ pass — tree-SHA is positive structural proof; no false positives |
| C1 (no weakened bar) | ✓ respected — blocked path still fails closed |
| C2 (no new deps) | ✓ respected — only git CLI and existing utilities |
| C3 (read-only detection) | ✓ respected — rev-parse and log only |
| C4 (trusted tip source) | ✓ respected — ADV-owned worktree HEAD, content-addressed |
