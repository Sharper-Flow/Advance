# Archive: Compress instruction prose

**Change ID:** compressInstructionProse
**Archived:** 2026-05-22T21:50:27.995Z
**Created:** 2026-05-22T15:11:13.154Z

## Tasks Completed

- ✅ Capture dirty-scope baseline and pre-compression contract-token snapshot
  > Captured 15-file dirty scope and 2010 token-bearing lines before further edits. Snapshot command/pattern is embedded in the executed Python script and output artifacts in /tmp/opencode/compressInstructionProse. adv_task_checkpoint recorded commit f84df1b for the baseline state.
- ✅ Finish caveman-full label normalization
  > Updated docs/command-voice-standard.md line 496 from `Caveman-lite matches global config` to `Caveman-full matches global config`, preserving surrounding handoff example tokens. Verified no active non-archive `caveman-lite|caveman-light` matches and confirmed `Caveman-full composition` expectations in docs/test. Checkpoint commit 4e66813.
- ✅ Update prose-load inventory for this compression pass
  > Changed inventory lifecycle to `POST-COMPRESSION ARCHIVE — pass 3`, extended the pass list to include T7, and added `Pass 3 Delta: compressInstructionProse (T7)` with rows covering active touched instruction/test surfaces. Verification rg found header, pass section, and T7 rows. Checkpoint commit 4e59aa1.
- ✅ Audit and complete obvious-win compression across active instruction assets
  > Audited active instruction surface inventory: 82 files, with 15 baseline-changed files. Report written to /tmp/opencode/compressInstructionProse/compression-audit-report.json. Confirmed no uncommitted diffs remained for this audit task; no extra edits were safer than the existing baseline compression under C5.
- ✅ Run stale-label and contract-token verification
  > Generated `/tmp/opencode/compressInstructionProse/contract-tokens-post.json`, `scope-files-post.json`, and `token-diff-report.json`. Active-surface case-insensitive grep for `caveman-lite|caveman-light` passed with historical paths excluded. Token-diff report: 16 post files, 2268 token-bearing lines, unexpected_diff_count=0, added_files_after_pre_snapshot=[docs/prose-load-inventory.md].
- ✅ Run focused asset/drift checks and full plugin check
  > Ran `pnpm exec vitest run src/adv-skill-backed-commands-assets.test.ts src/manifest-doc-drift.test.ts` successfully (71 tests). Ran `pnpm run check` successfully (typecheck, isolation/lockfile scripts, lint, format:check). Confirmed final git status clean. Checkpoint recorded at 4e59aa1.

## Specs Modified


## Wisdom Accumulated

- **[gotcha]** For label-normalization checks, use case-insensitive stale-label grep. A prior case-sensitive search missed `Caveman-lite` in an active docs example even though lowercase `caveman-lite` was gone.
