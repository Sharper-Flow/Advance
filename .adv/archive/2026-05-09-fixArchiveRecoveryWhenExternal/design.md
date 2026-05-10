# Design

## Implementation Plan

1. Locate archive recovery branch around external bundle existence checks and `createInRepoArchive`.
2. Add failing regression coverage for pre-existing external bundle plus missing/stale in-repo archive.
3. Refactor recovery ordering so external bundle presence does not skip in-repo archive reconciliation.
4. Preserve idempotence on rerun and no duplicate external bundles.
5. Run focused archive tests and plugin check.

## Planned Tasks

1. Add failing regression coverage for external-bundle-present recovery creating/reconciling missing in-repo archive.
2. Implement idempotent archive recovery ordering so in-repo archive reconciliation is not skipped.
3. Run focused archive recovery tests and plugin check; document verification evidence.

## Contracts

- Existing external bundle remains authoritative external record.
- In-repo archive is reconciled if missing/stale.
- Recovery reruns remain idempotent.

## Test Strategy

- Red test for external bundle present + missing in-repo archive.
- Regression test for idempotent rerun.
- Focused archive tests, then `pnpm run check` from `plugin/`.