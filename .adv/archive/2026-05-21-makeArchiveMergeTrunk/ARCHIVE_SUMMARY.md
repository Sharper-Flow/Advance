# Archive: Make archive merge to trunk

**Change ID:** makeArchiveMergeTrunk
**Archived:** 2026-05-21T18:13:19.212Z
**Created:** 2026-05-21T04:40:45.463Z

## Tasks Completed

- ✅ RED: Failing tests for git-finalize helpers
  > Added `plugin/src/tools/archive-helpers/git-finalize.test.ts` covering Phase 9 helper contracts: main checkout resolution from linked worktree, default-branch detection, main checkout invariants, change branch reachability, clean merge, conflict abort/no-stash behavior, push policy failure/skip reporting, archive mode defaults/PR gh validation, and dirty-trunk finalization blocking.
- ✅ GREEN: Implement git-finalize.ts helpers
  > Created `plugin/src/tools/archive-helpers/git-finalize.ts` with Phase 9 helper exports: `resolveMainCheckout`, `detectDefaultBranch`, `verifyMainInvariants`, `verifyChangeBranchReachable`, `mergeChangeBranch`/`mergeToTrunk`, `pushToOrigin`, `detectArchiveMode`, and `finalizeRelease`. Helpers use `spawnSync`-backed git operations, use `git -C`/cwd main checkout semantics, hard-block dirty/mismatched main, avoid stash/checkout/switch, report push failures as `merged_locally`, and preserve idempotent already-reachable handling.
- ✅ Add archive_mode + auto_push config + types
  > Extended `ProjectConfigSchema` with `archive_mode: "direct" | "pr"` defaulting to `direct` and `auto_push` defaulting to true. Added structural tests for defaults, PR opt-out, auto-push override, and invalid archive-mode rejection. Updated `store-disk.ts` manual default project config and SETUP project initialization docs to mention optional archive finalization overrides.
- ✅ RED: Failing test for release-gate precondition
  > Added `plugin/src/tools/gate.release-enforcement.test.ts` with tests for release-gate reachability enforcement. The red test mocks git-finalize reachability as false and expects `RELEASE_REQUIRES_TRUNK_MERGE`, `rq-releaseFinalization01`, and `/adv-archive {id}` remediation with no signal fired; current implementation fails that rejection path, as intended.
- ✅ GREEN: Wire release-gate precondition in gate.ts
  > Updated `plugin/src/tools/gate.ts` so `adv_gate_complete` blocks `gateId: "release"` in direct archive mode when `change/{id}` is not reachable from the default branch. The structured error uses code `RELEASE_REQUIRES_TRUNK_MERGE`, cites `rq-releaseFinalization01`, lists unmerged commits, and points to `/adv-archive {id}` remediation. Added passing release-enforcement tests and adjusted an existing gate cache-refresh unit test to use acceptance rather than release because release now has a structural precondition.
- ✅ RED: Failing test for adv_change_archive Phase 9 integration
  > Added `plugin/src/tools/change.archive-phase9.test.ts` asserting the archive tool imports shared Phase 9 finalization helpers, exposes `phase9: "run" | "skip"`, runs finalization after bundle creation in bundle-first order, and returns a `finalization` outcome. Current source fails those assertions as intended.
- ✅ GREEN: Wire adv_change_archive to finalizeRelease()
  > Updated `adv_change_archive` args with optional `phase9: "run" | "skip"` (default run; slash-command path uses skip), imported `detectArchiveMode`/`finalizeRelease`, invokes `finalizeRelease` after successful non-dry-run archive bundle creation, and includes `finalization` in the response. Added source-level integration assertions for helper import, phase9 arg, bundle-first ordering, and finalization response.
- ✅ Add rq-releaseFinalization01.5 + .6 spec scenarios and update Phase 9 contract
  > Added `rq-releaseFinalization01.5` for structural release-gate trunk-merge enforcement and `rq-releaseFinalization01.6` for PR-mode opt-out to `.adv/specs/advance-workflow/spec.json`, mirrored them in `docs/specs/advance-workflow.md`, updated `/adv-archive` Phase 9 to reference `git-finalize.ts`, `phase9: "skip"`, and runtime enforcement, updated `ADV_INSTRUCTIONS.md` worktree cleanup/release note, and added CHANGELOG entries.
- ✅ Full verification + backward-compat smoke
  > Task checkpoint completed

## Specs Modified


## Wisdom Accumulated

- **[gotcha]** When adding defaulted fields to `ProjectConfigSchema`, Zod's parsed output type treats them as required. Any code constructing a parsed `ProjectConfig` manually (e.g. `store-disk.ts` default config passed to `saveProjectConfig`) must add the new defaulted fields too, or `tsc` fails even though parser callers are fine.
