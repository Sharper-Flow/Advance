# Executive Summary

## Outcome

Worktree cleanup no longer blocks when the remote OpenCode workspace-list API is unreachable. The local `/proc/*/cwd` scan (`isWorktreeInUse`) upstream in `advWorktreeDelete` is now the documented sole safety authority for the "no live process CWD" invariant. The remote workspace-list lookup is advisory: when reachable, it still cleans up stale OpenCode workspace registry entries; when unreachable, deletion proceeds with a logged warning and is not blocked.

## Value

Before this change, every post-archive `adv_worktree_cleanup` and `adv_worktree_delete` could wedge with `WORKSPACE_OWNERSHIP_UNCERTAIN: workspace list request failed: Unable to connect` whenever the OpenCode workspace API was unreachable — even when the worktree was fully merged, the tree was clean, and no process held it as CWD. The only recovery was a manual `git worktree remove` bypassing ADV entirely. The structural defect (P35 architecture-over-hacks) — a local deletion decision gated on a remote dependency — is removed.

## What Changed

- `plugin/src/tools/worktree/index.ts`: `cleanupOpenCodeWorkspaceForWorktree`'s `!lookup.ok` branch returns `{ok: true, warning}` instead of `{ok: false, error: WORKSPACE_OWNERSHIP_UNCERTAIN}`. Two nearby preflight comments refreshed to match the new advisory semantics.
- `plugin/src/tools/worktree/index-delete.test.ts`: two existing tests updated to assert advisory-warning behavior; one new explicit regression test; two new `log.warn` assertions prove the warning is observable.
- `.adv/specs/worktree-lifecycle/spec.json`: `rq-terminalCleanupSafety01` body extended with authority-split clarification; new scenario `rq-terminalCleanupSafety01.3` documents the advisory failure mode.
- `docs/specs/worktree-lifecycle.md`: mirrored spec amendment.

## Verification

- Targeted worktree suite (16 files, 239 tests): pass / 0 fail (`tr_mrtxeg8b_c323a60d`).
- TDD red → green: red `tr_mrtxcaag_60d1f144` (3 fail) → green `tr_mrtxcuxd_5eb23a55` (113 pass).
- Reviewer remediation re-verify: `tr_mrtxk1j6_058d8953` (59 pass).
- `pnpm run schemas:check` passed (`tr_mrtxdsi7_779fd1c0`).
- Spec jq validation: `rq-terminalCleanupSafety01.3` present, body extended, JSON valid.
- Independent acceptance review: READY, 0 blocking findings, scoped remediation applied (preflight comments + log-warn assertions).
- Contract matrix: 17/17 required rows passing/respected; 0 failures.

## Remaining Behavior

`WORKSPACE_CLEANUP_FAILED` is still a real blocker — when the remote lookup succeeds and returns a workspace handle but `deleteAdvWorkspace` fails, deletion is retained. This preserves stale-registry-entry cleanup authority. The `WORKSPACE_OWNERSHIP_UNCERTAIN` error code remains in the type union for backward compatibility but is no longer produced by the remote-failure path.

## Risks and Follow-ups

No release blocker. Potential follow-up: a reconciliation sweep for stranded workspace registry entries left by past unreachable-during-delete events (registry hygiene only, not a correctness issue). Out of scope for this change.