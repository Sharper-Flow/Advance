# Archive: Raise worktree tool timeout budget

**Change ID:** raiseWorktreeToolTimeoutBudget
**Archived:** 2026-08-22T15:56:39.812Z
**Created:** 2026-08-22T01:46:23.510Z

## Tasks Completed

- ✅ Raise WORKTREE_TOOL_SAFE_TIMEOUT_MS 8s→45s and give adv_worktree_delete/adv_worktree_cleanup a 50s safeExecute override in tool-registry.ts (mirroring adv_worktree_triage's 60s pattern). Update docstrings (adv-worktree.ts rationale + timeoutMs arg description), the workspace-warp.ts comment, and the two budget-pinning test assertions. Validation: targeted vitest on both test files, tsc typecheck, eslint, prettier. Build + deploy-local.sh --fix afterward.

## Specs Modified

