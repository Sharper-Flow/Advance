# Fix external-state hygiene leftovers and test-isolation leak

## Intent

Resolve bug #60: `adv_status view: hygiene` reports stale post-Temporal-cutover artifacts and synthetic test worktree directories leaked into the real external state root.

## Scope

- Root-cause tests or helpers that write synthetic worktree state into the real project external root instead of temp sandboxes.
- Reconcile hygiene detector output with current in-repo archive policy.
- Add or update tests to prevent regression.
- Clean safe stale external-state artifacts only through supported hygiene/tooling paths, not direct state-file edits.

## Success Criteria

- Synthetic test worktree directories no longer leak into the real external state root.
- Hygiene detector no longer flags current in-repo archive/changes policy as legacy drift unless actual drift exists.
- Safe stale artifacts have a clear cleanup path.
- Relevant tests/checks pass.