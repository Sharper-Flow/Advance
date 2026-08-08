## Outcome

Archive can now recover from a state it previously could not exit: a change whose code shipped but whose spec projection was never committed in-repo. Previously this returned a permanent `MANIFEST_UNREADABLE` refusal. Now it routes to reconcile — staging the bundle, applying deltas, and committing the projection.

## Value

A stuck archive no longer requires manual state surgery. The fix unblocks `fixWorktreeDeletionReliability` (stuck since 2026-08-08) and prevents the same trap for any future change whose release gate records a code-shipping commit before the archive bundle is committed.

## How it works

The error code `MANIFEST_UNREADABLE` conflated two conditions needing opposite responses: *absent* (projection never committed — unstarted work, should reconcile) and *invalid* (manifest corrupt — integrity failure, should refuse). The fix splits these into distinct codes using a structural git `ls-tree` probe (not stderr text matching), then routes absent to the existing reconcile path that was already 60 lines below the refusal.

A lost spec requirement (`rq-archiveDeltaReconciliation01` — cited by 6 code returns but absent from spec law since 2026-07-20) is restored and extended with a scenario covering the external-store-vs-in-repo authority distinction.

## Verification

- 16/16 projection-proof tests pass (3 composition tests chaining classify + route on real git fixtures)
- 112/112 archive + handler regression tests pass (0 regressions)
- Plugin check fully green: schemas, typecheck, manifests, lint, format
- Independent reviewer: APPROVED (READY) after composition-test remediation

## Risks and Follow-ups

- AC5 (`fixWorktreeDeletionReliability` retry) requires deploy + restart; retry command recorded for post-deploy execution
- Layers 1–2 from the root-cause analysis (independent projection commit anchor; gating release-gate recording on projection durability) filed as separate changes — this fix routes around the structural impossibility rather than resolving it at the source
- 3 other lost spec requirements (`rq-archiveConflictDisposition01`, `rq-archiveConflictDispositionScope01`, `rq-deployAssetContinuation01`) remain unfiled — each needs its own evidence review before backfill
