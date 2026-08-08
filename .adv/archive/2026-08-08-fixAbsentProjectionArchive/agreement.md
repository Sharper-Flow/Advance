## Objectives

1. An archive whose code shipped but whose in-repo projection was never committed MUST reconcile (stage bundle, apply deltas, commit) rather than refuse with `MANIFEST_UNREADABLE`.
2. The absent-vs-invalid distinction MUST be structural (git `ls-tree` + `100644 blob`), never stderr text matching.
3. Corrupt and mismatched manifests MUST continue to be refused. This change loosens no integrity guarantee.
4. `rq-archiveDeltaReconciliation01` — cited by 6 code returns but absent from spec law since 2026-07-20 — MUST be restored to law, extended to cover the absent-in-repo trigger.
5. `rq-archiveRetryIdempotence01` "bundle present on disk" MUST be qualified as *committed in-repo projection* so `noOp` cannot fire on an unapplied delta set.

## Acceptance Criteria

- **AC1** Given `status: archived` + external-store bundle present + deltas non-empty + in-repo `spec-projection.json` absent at released commit, when `adv_change_archive phase9:"run"` runs with a valid `worktreePath`, then it stages the bundle in-repo, applies deltas, regenerates docs, commits, and proceeds to finalization — no `MANIFEST_UNREADABLE` refusal.
- **AC2** Given the same state but a manifest that exists in-repo and is corrupt/unparseable/schema-violating, then archive refuses with `MANIFEST_INVALID` and performs no spec/version/doc/bundle/status mutation.
- **AC3** Given the same state but a manifest present and matching the expected projection, then archive returns the idempotent no-op path (`.4` of restored requirement).
- **AC4** `MANIFEST_ABSENT` and `MANIFEST_INVALID` form a `never`-exhaustive union at the call site; adding a third code fails to compile until handled.
- **AC5** `fixWorktreeDeletionReliability` reaches terminal archive after this change ships and deploys.
- **AC6** `rq-archiveDeltaReconciliation01` is present in `advance-workflow` spec with scenario `.5` covering in-repo-vs-external-store authority; `rq-archiveRetryIdempotence01` body qualifies "bundle present on disk" as committed in-repo projection.

## Constraints

- Existence probe MUST use `git ls-tree -z --full-tree --format` after independently verifying `<sha>^{commit}`. Do NOT use `git cat-file -e` (no stable absent-path exit code per git docs). Do NOT match stderr text.
- Require mode `100644` and type `blob`; tree/symlink/gitlink entries classify as `MANIFEST_INVALID`.
- Use Node `spawn` with exit-code inspection; `stdio: "ignore"` for the existence-only probe.
- Restore `rq-archiveDeltaReconciliation01` from the approved 2026-07-20 `fixArchiveDeltaReconciliation` bundle text; extend, do not rewrite.
- Fail closed on repository/revision errors — they are NOT absence.

## Avoidances

- Do NOT fold in layers 1–2 (independent projection commit anchor; gating release-gate recording on projection durability). Separate changes.
- Do NOT backfill `rq-archiveConflictDisposition01`/`Scope01` (cited by no code) or `rq-deployAssetContinuation01` (different subsystem) in this change. File separately.
- Do NOT remove the 6 `rq-archiveDeltaReconciliation01` citations and replace with a new ID — that discards approved intent. Restore and extend.
- Do NOT assume Phase 9 fallthrough idempotence without a test. Idempotence is the property that already failed here.
- Do NOT treat Temporal-era lost requirements as in scope; they are moot after Temporal removal and were addressed in today's cleanup pass.

## Spec-Law Obligations

**Restore + extend (add)** — `advance-workflow` / `rq-archiveDeltaReconciliation01`:
- Restore from 2026-07-20 approved text (4 scenarios intact)
- Add scenario `.5`: bundle presence in the external store does NOT establish in-repo projection durability; absent in-repo projection MUST route to reconcile, not refusal; external-store presence is advisory metadata, never authority for in-repo facts

**Modify** — `advance-workflow` / `rq-archiveRetryIdempotence01`:
- Qualify "archive bundle is present on disk" as "archive bundle's projection is committed in-repo at the released commit"
- `noOp: true` MUST NOT fire when the in-repo projection is absent but the external-store bundle exists
