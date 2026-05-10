# Design

## Implementation Plan

1. Locate hygiene detector and synthetic worktree/test helper paths that construct project/worktree external-state directories.
2. Add failing regression coverage for the leak and false-positive hygiene behavior.
3. Fix test helper isolation so synthetic worktree dirs land under temp-owned roots or are cleaned via marker-protected teardown.
4. Adjust hygiene detector classification so current in-repo archive/changes policy is not reported as legacy drift.
5. Keep any cleanup recommendation dry-run-only and approval-gated.

## Contracts

- Never read or mutate ADV external state directly in production logic; use storage/path helpers and ADV tooling boundaries.
- Deletion-capable hygiene findings must expose `deletion_requires_approval: true` or equivalent structured safety signal.
- Test-created synthetic dirs must be marker-owned or temp-root-scoped before cleanup.

## Test Strategy

- Red test for synthetic worktree/test state isolation.
- Red test for hygiene detector not flagging valid in-repo archive policy as legacy drift.
- Green with implementation.
- Run focused tests, then `pnpm run check` from `plugin/`.

## Rollback

Changes are limited to detector/test-helper logic. Revert code changes if detector output regresses; no manual external-state deletion is part of this change.