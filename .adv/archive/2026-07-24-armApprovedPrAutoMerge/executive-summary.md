# Executive Summary

## Outcome
ADV now treats an explicit user merge grant as continuing authority across matching remediation PRs within the current active orchestration session. It immediately arms GitHub squash auto-merge rather than waiting for CI green and manually merging again.

## Why it matters
Same-session delivery chains no longer stall at every remediation PR. The rule directly fixes the observed orchestration miss while remaining narrow and reversible.

## Safety boundary
- Explicit merge grant required; push-only and generic gate approval do not authorize merge.
- Bound to same change, repository, change branch, default base, requested end-state, and active session.
- Exact command: `gh pr merge <number> --repo <owner/repo> --squash --auto`.
- Re-read PR identity/state and verify `autoMergeRequest.enabledAt`.
- CI green remains nonterminal; require `MERGED` or default reachability.
- Authority ends on revocation, stop/cancel, drift, unrelated scope, completion, restart, compaction, or approval-context loss.
- A new session requires a new explicit merge grant.
- Tier-B archive sign-off remains unchanged; no delete flags before post-merge cleanup.

## Verification
- Re-entry RED failed on missing active-session scope.
- GREEN focused suite: 34 tests, 187 assertions.
- Full plugin check passed: schemas, TypeScript, manifests, isolation, lock policy, ESLint, Prettier.
- Independent review: READY, no blocking findings after chosen session boundary.
- Final contract review matrix: 19/19 passing/respected.
- Diff is clean; only intended agent/spec/test files committed.

## Activation
Requires merge to Advance trunk, local deploy from merged trunk, and OpenCode restart. The current running session cannot hot-reload the changed agent prompt.