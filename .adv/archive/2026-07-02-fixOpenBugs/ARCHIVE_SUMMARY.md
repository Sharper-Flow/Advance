# Archive: Fix open bugs

**Change ID:** fixOpenBugs
**Archived:** 2026-07-02T14:37:24.470Z
**Created:** 2026-07-01T23:38:23.752Z

## Tasks Completed

- ✅ Add live tool-surface coverage and reject active duplicate creates
  > Added epicTools to getToolSurface() so live contract warrant surface includes Epic tools. Added checkActiveDuplicateChange guard for same-project and cross-project adv_change_create paths so active same-summary/title duplicates reject with existing-change evidence while archived changes do not block recreation. Added regression tests for duplicate rejection, archived non-blocking behavior, cross-project duplicate rejection, and Epic warrant surface coverage.
- ✅ Add audited active-origin repair path
  > Added adv_change_repair_origin with audited approval fields, reason/evidence preflight, active/open-only enforcement, origin linkage validation, claim-collision rejection, target_path trust routing, dry-run support, and Temporal originRepairedSignal reducer/search-attribute update. Updated tool registry/surface lists, CLI/agent allowlists, tool titles/banner/preflight policies, and regression tests for repair success, dry-run, conflict rejection, closed/archived rejection, self-idempotence, and workflow state reduction.
- ✅ Fix status repair public read-path parity
  > Added archive-bundle pre-scan invalidation to store-temporal listSummary warm path so public adv_change_list no longer serves stale active cache entries after disk-only terminal repair. Updated status repair readback verification to exercise public listSummary path first. Added regression test proving detail/list archived/in-flight parity immediately after repair.
- ✅ Wire worktree stale registry cleanup through durable workflow state
  > Implemented removeWorktree() to dispatch existing worktreeDeletedSignal to the owning change workflow and refresh store cache. Gated missing_from_disk cleanup on terminal archived/closed state and retained non-terminal/unreachable/unsafe rows with integration-required evidence. Added regression tests for archived missing-from-disk cleanup and open/non-terminal retention.
- ✅ Project terminal Epic child state during direct link
  > Added terminal-state projection helper in adv_epic_link_change so archived/closed linked child changes receive terminal_summary and membership_status='terminal' during the same link/rebuild/retarget/refresh operation. Added parameterized archived/closed direct-link regression coverage.
- ✅ Add target_path routing to archive and checkpoint terminal lifecycle tools
  > Acceptance reviewer found caller workdir could override target store root in target_path checkpoint routing. Fixed checkpoint routing so target_path store/root wins even when caller passes workdir, and added regression for target_path + caller workdir.
- ✅ Make archived archive retry idempotent and bounded
  > Replaced unconditional archived+bundle no-op with bounded reconcileArchivedBundleRetry helper. Archived retries now re-verify release evidence, reconcile release gate and Phase 9 metadata, record pending/done phase9 status where needed, and still avoid rewriting bundles, branch deletion, issue closure, worktree cleanup, disk removal, or status re-save. Pure no-op retries short-circuit when release gate is already done.
- ✅ Align specs, schemas, and command/docs with fixed bug behavior
  > Updated advance-workflow, worktree-lifecycle, and advance-epics spec laws plus docs/spec mirrors for active duplicate rejection, audited active origin repair, status repair read parity, stale worktree registry cleanup, Epic terminal child projection, archive/checkpoint target_path routing, and archive retry idempotence. Added source citations in touched code to keep spec-citation invariant green.
- ✅ Run integrated regression, smoke, and contract verification
  > Re-ran integrated smoke/check and build after acceptance-review checkpoint routing fix. Smoke included schemas:check, typecheck, test-isolation, lockfile policy, lint, format:check, and 57 smoke tests. Build succeeded for plugin and Temporal worker bundles.
- ✅ Close fixed bug issues and regenerate final roadmap
  > Added evidence comments and closed GitHub issues #1, #127, #168, #174, #183, #185, and #191. Verified zero open bug-labeled issues. Regenerated ROADMAP.md and .adv/roadmap-snapshot.json from live GitHub Project state, showing 0 bugs / 25 features / 1 deferred, then committed and pushed trunk commit 1bb7b053 chore(roadmap): refresh after bug closures.

## Specs Modified

