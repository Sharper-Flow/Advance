# Fix archive recovery when external bundle already exists

## Intent

Resolve bug #53: `adv_change_archive` recovery should still create/update the in-repo archive when an external archive bundle already exists.

## Scope

- Inspect archive recovery path around external bundle detection and `createInRepoArchive` invocation.
- Add regression coverage for pre-existing external bundle plus missing/stale in-repo archive.
- Fix recovery ordering/idempotence so in-repo archive is reconciled.
- Preserve external archive integrity and no-duplicate semantics.

## Success Criteria

- Existing external bundle no longer causes in-repo archive creation to be skipped.
- Archive recovery is idempotent across reruns.
- Regression tests cover external-bundle/pre-existing recovery case.
- Relevant checks pass.