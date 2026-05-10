# Discovery Agreement

## Facts

- Issue #102 reports git mutation guard blocking canonical ADV archive push from default branch.
- Trunk-is-prod/default-branch protection must remain intact for unrelated writes.
- Canonical archive writes are expected, auditable ADV operations and may need to run from default branch during archive finalization.

## Decisions

- Add a narrow allow path for intended ADV archive mutation only.
- Preserve denial for unrelated default-branch mutations.
- Make allow/deny behavior machine-testable and auditable.

## Risks / Unknowns

- Guard policy may be shared by shell/bash sanitization and archive tool paths.
- Over-broad allowlist would weaken trunk protection.

## Out of Scope

- Removing default-branch mutation guard.
- Changing non-archive git workflows.