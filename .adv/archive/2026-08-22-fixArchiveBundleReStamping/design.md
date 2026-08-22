# Design — fix archive bundle re-stamping

## Decision 1: one owner for the terminal-summary read

The read that resolves an authoritative `archived_at` already existed, inside `refreshArchiveBundleProjectionUnderLock`. A second copy had also grown inside `reconcileInRepoArchive` (added by PR #428). The main archive path had neither and used the clock.

Three call sites needing the same policy, with two existing implementations and one missing, is the shape that produces exactly this class of drift. Extracted `readArchiveBundleArchivedAt(changeId, archivePath)` as the single owner and pointed all three at it. `reconcileInRepoArchive` lost its duplicate.

Rejected: passing `archivedAt` down from the handler. That would put the policy in the caller and leave each future caller free to get it wrong — the same failure mode PR #428 hit when it fixed one path and left the other stamping.

## Decision 2: fail closed, report structurally

`readArchiveBundleArchivedAt` throws when the summary is missing, unreadable, or carries a mismatched `change_id`. It never invents a timestamp. That mirrors the precedent already set at `archive.ts:226-238`.

Throwing out of a tool handler is the wrong *report* shape, though. `findArchiveBundle` can legitimately return a bundle that an interrupted archive left without a terminal summary, so the condition is reachable, and every other durability failure on this path returns structured output. `archiveChangeUnderLock` therefore catches the helper and returns an unsuccessful `ArchiveOperationResult` carrying `requirement: "rq-archiveTerminalDurability01.1"`, which the existing `if (!archiveResult.success)` branch already formats.

The refusal is unchanged. Only its delivery changed.

## Decision 3: refresh both bundles at one seam

Phase-9 completion already refreshed the external bundle in two places in `archive-gate.ts` — the already-done recovery branch and `afterCommit`. Rather than add in-repo handling at each, `refreshArchiveBundleProjectionsUnderLock` takes both paths and iterates, and `inRepoBundlePath` threads through `completeReleaseGateAfterFinalization` and `reconcileArchivedBundleRetry`.

Rejected: moving the in-repo bundle write to after finalization. That would reorder a write the handler depends on for `commitPaths`, widening blast radius for no gain over refreshing.

## Decision 4: remove the sibling default rather than leave it armed

`createArchive` carried `archivedAt: string = new Date().toISOString()`. Every caller now passes a value, so the default was unreachable — but it is the identical footgun one call away from being live again. Removed it, and made three adjacent optional params required so the signature states its real contract.

## Known residue

The structured-failure branch sets `archivedAt: ""` because `ArchiveOperationResult` requires the field. It is unreachable — the only consumer, `handlers-archive.ts:1053`, sits behind the `!archiveResult.success` early return at `:726`. A discriminated union on success/failure would type the sentinel away; that refactor is larger than this change warrants and is not attempted here.
