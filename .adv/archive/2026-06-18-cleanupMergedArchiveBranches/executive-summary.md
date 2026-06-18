# Executive Summary — cleanupMergedArchiveBranches

## Outcome

Closed the post-merge cleanup gap for PR-mode ADV archives described in [GitHub issue #173](https://github.com/Sharper-Flow/Advance/issues/173). Operators can now clean up stale local `change/{id}` branches left behind after PR-mode archive merges via a single operator-explicit command, without manual `git branch -d` loops.

## What Was Built

Extended the existing `adv_archive_repair` MCP tool with a new `cleanup_merged` action. The action scans local `change/*` branches tied to ADV-archived changes, detects fully-merged ones (squash-merge-safe via tree-SHA match primary + `git cherry` diff-equivalence fallback), excludes any checked out in an active worktree, and deletes the safe ones using the existing `deleteChangeBranch()` primitive (safe `git branch -d` semantics — never `-D`).

Five existing primitives were reused (zero new abstractions):
1. `deleteChangeBranch()` — safe local delete + best-effort remote
2. `detectSquashMergeByTree()` — squash-merge-safe tree-SHA detection
3. `detectArchivedUnmergedBranches()` pattern — scan + act shape
4. `appendQueueServiceabilityRecommendations()` appender shape — status integration
5. `worktree/triage.ts:155` porcelain parser — extracted to `worktree/porcelain-parser.ts` for reuse

Surface visibility: `adv_status view:"summary"` shows a recommendation line when ≥1 archived-change local branch is safely deletable; `adv_status view:"hygiene"` shows a full `archived_branch_hygiene` section with per-branch merge proof.

## How It Was Verified

- **153 tests pass** across affected surfaces (archive-repair 11, git-finalize 80, status 42, porcelain-parser 5, triage 13).
- **`pnpm run check` green** (schemas:check + typecheck + check-test-isolation + check-lockfile-policy + lint + format:check).
- **Independent design validator** (adv-researcher): VALIDATED, 4 dimensions all info-level, 4 refinements folded (R1-R4).
- **Independent acceptance reviewer** (adv-reviewer): verdict READY, 3 in-scope remediations applied:
  - `git cherry` patch-equivalence handling (- lines count as merged; + lines as unmerged)
  - Worktree path surfacing in checked-out branch refusals
  - `adv_status` hygiene/summary reuses worktree safety before claiming "safely deletable"
- **Contract review matrix**: 30/30 rows passing (4 SC + 12 AC + 5 C + 5 DONT + 4 OOS).

## Contract Coverage

| Category | Count | Status |
|---|---|---|
| Success Criteria (SC1-SC4) | 4 | 4 pass |
| Acceptance Criteria (AC1-AC12) | 12 | 12 pass |
| Constraints (C1-C5) | 5 | 5 respected |
| Avoidances (DONT1-DONT5) | 5 | 5 respected |
| Out of Scope (OOS1-OOS4) | 4 | 4 not_applicable |
| **Total** | **30** | **30 passing** |

## Spec Law

New requirement family `rq-archiveBranchCleanup01` added to `advance-workflow` capability (version 1.17.0 → 1.18.0), with 5 Given/When/Then scenarios:
- `.1` Squash-merge-safe detection
- `.2` Worktree-checked-out refusal
- `.3` Dry-run preview
- `.4` Status observability
- `.5` Non-regression of direct-archive path

Sibling to existing `rq-releaseFinalization01` (which governs REMOTE reachability/PR re-drive); the new family governs LOCAL stale-branch post-merge cleanup (orthogonal problem).

## Remaining Concerns

- **Live runtime validation deferred**: source changes do not take effect in the current OpenCode session until rebuild + restart (`pnpm run build` + session restart). Verified via tests only.
- **No outstanding reviewer suggestions deferred to harden** — reviewer verdict was clean READY.
- **Coordination with #169**: distinct problems (pre-PR sync vs post-merge cleanup); coordinate at PR review time if both ship near-simultaneously.
