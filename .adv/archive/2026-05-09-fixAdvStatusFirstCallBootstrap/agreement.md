# Discovery Agreement

## Facts

- Issue #56 is open and labeled bug/priority:low.
- `adv_status` first-call bootstrap can be nondeterministic around scoped ADV instruction loading / TMPRL1100 timing.
- Current session `adv_status` is healthy, so issue likely needs deterministic startup/race coverage rather than live reproduction only.

## Decisions

- Treat this as startup/bootstrap determinism bug.
- Preserve scoped ADV instruction loading behavior.
- Add deterministic regression/harness coverage for first-call status readiness if feasible.

## Risks / Unknowns

- Race may be timing-sensitive and require a seam/mocked readiness state rather than sleeps.
- Must avoid masking real bootstrap failures with broad retries.

## Out of Scope

- Disabling scoped instruction loading.
- Broad status architecture redesign.