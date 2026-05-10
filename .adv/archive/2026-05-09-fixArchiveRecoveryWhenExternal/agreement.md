# Discovery Agreement

## Facts

- Issue #53 is open and labeled bug/priority:medium.
- Archive recovery can skip in-repo archive reconciliation when external bundle already exists.
- Project wisdom states archive listing/identity must handle archive bundles idempotently and prefer canonical change IDs.

## Decisions

- Treat this as archive recovery ordering/idempotence bug.
- Preserve external bundle integrity and duplicate prevention.
- Ensure in-repo archive creation/reconciliation runs even when external bundle exists.

## Risks / Unknowns

- Need code inspection to identify exact early-return or branch that skips `createInRepoArchive`.
- Archive recovery touches git-tracked files; tests should use temp repos/fixtures.

## Out of Scope

- Changing archive storage model.
- Manual direct external-state mutation.