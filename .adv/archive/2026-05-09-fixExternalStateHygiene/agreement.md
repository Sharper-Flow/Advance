# Discovery Agreement

## Facts

- Issue #60 is open, high-priority bug and already linked to this ADV change.
- Proposal scope targets external-state hygiene leftovers and test-isolation leaks.
- Project wisdom `pw-czhnVFX4` records prior pattern: test-run cleanup should snapshot synthetic project/worktree dirs before Vitest, delete only newly-created synthetic dirs, keep real project IDs untouched, and honor `.adv-test-owner` marker mismatches as no-op.
- Project wisdom `pw-9Z1w2ENt` records hygiene findings that imply deletion must be dry-run-only and require approval.
- ADV state must be accessed only through ADV tools; direct external state file reads/mutations are out of bounds.

## Decisions

- Discovery confirms this is implementation-sized and bug-fix scoped.
- Treat cleanup of stale artifacts as tool-mediated/dry-run-safe behavior, not manual direct deletion.
- Preserve current in-repo archive policy; detector should only flag actual drift.
- Regression tests should prove temp/test isolation and hygiene output semantics.

## Risks / Unknowns

- Need code inspection to identify exact helper or test path writing synthetic worktree data into real external root.
- Existing hygiene formatting may be consumed by status tests; updates should preserve structured fields where possible.

## Out of Scope

- Re-architecting external state storage.
- Removing compatibility handling for legacy `db_dir` config.
- Direct deletion of external state paths outside supported cleanup/hygiene APIs.