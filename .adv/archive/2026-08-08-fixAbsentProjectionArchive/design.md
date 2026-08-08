## Architecture

### Current flow (buggy)

`handlers-archive.ts:278` — `existingBundlePath = findArchiveBundle(archivePaths.archive, changeId)` resolves against the **external store**. Truthy if the bundle directory exists on disk under `~/.local/share/opencode-projects/…`.

`:326` — retry branch gated on `!dryRun && status === "archived" && existingBundlePath`. Enters for our state.

`:328-372` — reads manifest from external bundle (`readProjectionManifest`), verifies release evidence, calls `verifyProjectionAtGitCommit({ manifest, repo, releasedCommitSha, manifestGitPath })`.

`projection-proof.ts:333-375` — `verifyProjectionAtGitCommit` calls `readGitPathBounded(repo, sha, path)` which runs `git show <sha>:<path>`. On ANY failure (missing path, corrupt content, schema failure) returns `MANIFEST_UNREADABLE`. No distinction between absent and invalid.

`:363-372` — proof failure → hard refusal. Control never reaches `:386` where `reconcileInRepoArchive` + `archiveChange({ reuseExistingBundlePath })` would stage and commit the projection.

### Fixed flow

**Layer A — `projection-proof.ts`: typed classification**

Replace the single catch-all in `verifyProjectionAtGitCommit` with a two-phase probe:

1. **Commit validity** — `git rev-parse --verify <sha>^{commit}`. Failure → new error code `REPO_ERROR` (repository/revision failure, fail closed, NOT absence).
2. **Structured existence** — `git ls-tree -z --full-tree --format='%(objectmode)%x09%(objecttype)%x09%(objectname)%x09%(path)' <sha> -- <manifestPath>`. Parse NUL-delimited records.
   - Zero records → `MANIFEST_ABSENT`
   - One record, mode `100644` + type `blob` → proceed to read + parse
   - One record, other mode/type (tree/symlink/gitlink) → `MANIFEST_INVALID`
   - Nonzero exit → `REPO_ERROR`
3. **Read + validate** — `readGitPathBounded` on the confirmed blob. JSON parse failure or Zod `SpecProjectionManifestSchema` failure → `MANIFEST_INVALID`. Content mismatch with expected manifest → `MANIFEST_MISMATCH` (unchanged).

Error union widens: `"MANIFEST_UNREADABLE"` → `"MANIFEST_ABSENT" | "MANIFEST_INVALID" | "MANIFEST_MISMATCH" | "REPO_ERROR"`. Call sites switch with `never` exhaustiveness — adding a code fails compilation until handled.

**Layer B — `handlers-archive.ts:326-384`: route absent to reconcile**

Hoist `verifyReleaseEvidenceFromMain` above the retry-branch guard (currently at :329, inside the branch). Then:

```ts
if (!dryRun && change.status === "archived" && existingBundlePath) {
  if (deltas non-empty) {
    const proof = await verifyProjectionAtGitCommit({...});
    if (proof.ok) { /* no-op path unchanged */ }
    else if (proof.code === "MANIFEST_ABSENT") {
      /* fall through to :386 reconcile — do NOT return refusal */
    } else {
      /* MANIFEST_INVALID | MANIFEST_MISMATCH | REPO_ERROR → refusal unchanged */
    }
  }
  // ... no-op return for projection-committed case
}
```

The absent case breaks out of the retry branch and falls through to `:386` where `reconcileInRepoArchive` + `archiveChange({ reuseExistingBundlePath })` runs — the normal path that stages the bundle, applies deltas, and commits.

### Why this satisfies AC1-AC6

| AC | How |
|---|---|
| AC1 absent → reconcile | Layer B routes MANIFEST_ABSENT to :386 |
| AC2 corrupt → refuse | Layer A returns MANIFEST_INVALID; Layer B refusal path unchanged |
| AC3 matched → no-op | Layer A reads valid blob, proof passes; existing no-op path at :374 |
| AC4 exhaustive union | Layer A `never` exhaustiveness; adding code = compile error |
| AC5 unblocks stuck change | AC1 fix lets fixWorktreeDeletionReliability archive |
| AC6 spec law restored | Spec deltas: restore rq-archiveDeltaReconciliation01 + scenario .5; modify rq-archiveRetryIdempotence01 |

### Risk assessment

- **Fallthrough idempotence** — re-running Phase 9 with release gate already `done`. Mitigated by RED test (task tk-3) proving the flow is safe; `archiveRetryIdempotence01` already specifies retries reconcile metadata without rewriting bundles.
- **ls-tree parsing** — NUL-delimited format is stable across git versions. Test covers empty/single/multi-record.
- **Blast radius** — 6 citations of rq-archiveDeltaReconciliation01 become valid once the requirement is restored. No code change needed for them — they already implement the (correct) behavior; they were citing non-law.

### Test strategy

RED before GREEN per P24:
- RED: reproduce the refusal — set up `status: archived` + external bundle + no in-repo projection → assert `MANIFEST_UNREADABLE` today, then after fix assert it does NOT refuse
- GREEN: absent routes to reconcile; invalid still refuses; matched no-ops; exhaustiveness compiles
- Integration: full `adv_change_archive` on a synthetic stuck change reaches terminal state
