# Executive Summary

## Outcome

Added the operator-only `adv_worktree_detach` capability for directory-only removal of selected stale ADV worktrees. Local branches, commits, and durable ADV change records remain recoverable.

## Value

Operators can reclaim stale worktree directories without weakening terminal cleanup or discarding unmerged work.

## Verification

- Acceptance reviewer verdict: READY after remediation.
- 67 targeted detach/state/message/tool tests passed after rebase (`tr_ms898ppl_19b17ff7`).
- 207 tool/lifecycle/registry/policy tests passed (`tr_ms89dt6c_6ce38a88`).
- 24-item contract review matrix: all pass/respected.

## Safety

The operation requires an exact approved batch and dual staleness checks, refuses unavailable/unsafe state, records every outcome, and compensates when post-removal state signaling fails.

## Remaining concern

`store-temporal/index.test.ts` failures reproduce unchanged on trunk and this branch; they are unrelated baseline failures.