# Archive: Fix archive release-without-merge

**Change ID:** fixArchiveReleaseWithoutMerge
**Archived:** 2026-06-07T14:08:29.098Z
**Created:** 2026-06-07T00:42:11.101Z

## Tasks Completed

- ✅ Add origin-aware release routing primitives
  > Task checkpoint completed
- ✅ Integrate pending-merge Phase 9 finalization
  > Added `pending_merge` GitFinalizeOutcome/phase9_status support with PR metadata. Direct-mode protected default branch push failure now classifies branch protection, resets main to origin/default, pushes change branch, creates/reuses a PR, arms `gh pr merge --squash --auto`, re-reads PR state, returns `pending_merge` when auto-merge is armed, and collapses immediately merged PRs to shipped. Archive tool records pending_merge without completing release, archiving, closing issues, deleting branches, or cleanup. Added RED/GREEN coverage for protected push PR handoff, immediate PR merge collapse, sync archive pending_merge, and async callback pending_merge.
- ✅ Harden release gate, skip, and recovery evidence paths
  > Release gate completion now uses route-aware `resolveReleaseReachability` instead of local-only ancestry/push checks, so direct remote-backed release completion requires origin/default proof and PR pending states remain blocked. Release poisoned/completed-workflow recovery revalidates the same release proof before writing recovered gate state. `adv_change_archive phase9:"skip"` now validates main-checkout release evidence before archive/status/issue-closure and blocks missing origin/default or PR-merged proof. Existing bundle reconciliation now uses origin-aware evidence, including PR merge proof when phase9_status carries PR metadata.
- ✅ Add archived-but-unmerged detector and idempotent re-drive tool
  > Added git-finalize detector for archived `change/*` branches on origin that are not reachable from `origin/<default>`, filtered to archived changes. Added idempotent re-drive helper that verifies remote branch existence, reuses an existing PR when present, creates one when needed, arms `gh pr merge --squash --auto`, re-reads PR state, returns `pending_merge` or `shipped`, and never force-pushes. Added `adv_archive_repair` tool with `scan` and `redrive` actions, registered it in createToolMap/ADV_TOOL_NAMES, added title/preflight/matrix coverage, and tests for scan/redrive behavior.
- ✅ Update archive spec, command, and terminal voice contracts
  > Task checkpoint completed
- ✅ Run cross-cutting release-finalization validation
  > Task checkpoint completed

## Specs Modified


## Wisdom Accumulated

- **[gotcha]** When adding fields to public Zod-backed schemas, run `pnpm run schemas:generate` after any Prettier pass on generated JSON. Formatting `plugin/schemas/*.schema.json` manually can make `schemas:check` fail even when source schemas are correct.
- **[pattern]** Release-state checks should go through the same route-aware reachability proof (`classifyFinalizationRoute` + `resolveReleaseReachability`) in archive, gate completion, and recovery paths. Duplicating local ancestry + push checks creates bypasses for origin/default and PR states.
- **[gotcha]** Adding a new ADV MCP tool requires more than createToolMap registration: update `ADV_TOOL_NAMES`, `cli-bridge-contract` frozen snapshot, `docs/cli-surface-matrix.md`, `FIELD_POLICIES` for strict-mode placeholders, and `utils/tool-title.ts`. Tool-registry tests enforce the display-title piece.
