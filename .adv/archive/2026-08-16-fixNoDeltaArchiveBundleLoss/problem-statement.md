## Defect

`adv_change_archive` on a change with zero spec deltas never writes the archive bundle, then deletes the active record. The change becomes unresolvable: `adv_change_show` → "Change not found", `adv_reflect` fails, `adv_worktree_cleanup --mode archived_branches` fails, and post-archive `adv_worktree_delete` cannot load terminal proof.

Observed 2026-08-16 on `restoreVendoredDesignSkills` (deltas: {}): archive returned `success:true`, `errors:[]`, `archivePath: .../archive/restoreVendoredDesignSkills`; finalization shipped and pushed; but no bundle directory exists in any shard, and `changes/restoreVendoredDesignSkills/` was removed by `removeChangeDir`. Summary shard revision 44 (`mutation:archive_transition`) is the only residue.

## Root Cause Analysis

- Symptom: archived no-delta change record vanishes; archive bundle absent everywhere on disk.
- Causal path: `plugin/src/tools/change/handlers-archive.ts` (~:677-718) gates `archiveChange()` (the sole bundle writer, via `createArchive` → `writeArchiveBundleFiles`) on `Object.values(change.deltas).some(d => d.length > 0)`. With zero deltas it substitutes a synthetic `archiveResult` `{success:true, archivePath: join(archivePaths.archive, changeId), errors:[]}` that writes nothing. Both the `existingBundlePath === null` and repair branches do this.
- Root cause: an optimization ("no deltas → nothing to project") incorrectly scoped the skip to the whole archive write instead of only spec projection. `archiveChange` already no-ops projection for empty deltas (preflight loop skips empty capability entries), so the guard is redundant AND destructive.
- Why undetected: archive handler tests exercise delta-ful changes for bundle assertions; no test asserts bundle existence for a zero-delta archive. Read-side self-heal (`hasArchiveBundle` / `loadArchivedChanges`) masks partial losses but cannot heal a bundle that was never written.
- Trigger scope: any delta-less archive — increasingly common as spec-law work moves to direct doc edits.