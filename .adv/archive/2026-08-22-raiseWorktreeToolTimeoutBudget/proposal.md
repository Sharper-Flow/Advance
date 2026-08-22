## Cross-Project Origin

This change was created as a follow-up from **pokeedge**.

| Field | Value |
|-------|-------|
| Source project | pokeedge |
| Source path | `/home/jon/dev/pokeedge` |

> **Note:** The originating project should be consulted for context on why this change is needed.


# Raise worktree tool timeout budget

## Why
`adv_worktree_delete` and `adv_worktree_cleanup` fail closed on a repository with 40 worktrees and 320+ changes: their verification chain (plan → git census → branch integration proof → PR evidence) cannot complete inside the 8s `WORKTREE_TOOL_SAFE_TIMEOUT_MS`, which exists only to stay under the 10s default `safeExecute` ceiling. Observed from the pokeedge project on 2026-08-21: three stages timed out (`plan`, `git_census`, `integration_proof`) across quiet and busy conditions while `git worktree list` (11ms) and `gh pr view` (1.4s) were each fast — the budget, not the repo, is the blocker. Nine verified-merged worktrees are stuck in the retained queue because of it.

## What Changes
- `tool-registry.ts`: give `adv_worktree_delete` and `adv_worktree_cleanup` a `{ timeoutMs: 50_000 }` execute override — the same mechanism `adv_task_checkpoint` (35s), `adv_wip_state` (60s), and `adv_worktree_triage` (60s) already use.
- `adv-worktree.ts`: raise `WORKTREE_TOOL_SAFE_TIMEOUT_MS` 8_000 → 45_000, keeping the 5s response reserve beneath the 50s override; update the rationale docstring and the timeoutMs arg description.
- `workspace-warp.ts`: comment truthfulness only (drop the hardcoded "(8s)").
- Tests: update the two budget-pinning assertions to 45_000.

## Constraints
- The clamp mechanism itself stays (`rq-worktreeBoundedCleanup02`); only its ceiling moves, so the structural-ceiling guidance remains truthful.
- `DISCOVERY_GIT_BUDGET_CEILING_MS` (2s per git op) is untouched — per-op bounding is independent of the total budget.

## Validation Plan
- Targeted vitest on both touched test files; typecheck; lint; format check.
- Build + `deploy-local.sh --fix`; behavior verified after host restart by re-running `adv_worktree_cleanup` dry-run and confirming `effectiveTimeoutMs` reflects the raised budget.