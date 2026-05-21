# Archive: Fix worktree terminal-status gate

**Change ID:** fixWorktreeTerminalStatusGate
**Archived:** 2026-05-21T03:45:49.419Z
**Created:** 2026-05-21T03:26:44.138Z

## Tasks Completed

- ✅ Widen primary integration guard + rename literal in branch-integration.ts
  > Widened primary integration guard in branch-integration.ts from `status === "archived"` to `status ∈ {"archived","closed"}`. Renamed failure-reason literal `change_not_archived` → `change_not_terminal` in union type (line 31) and fail() call (line 131). Updated header docstring to reflect terminal-set semantics. Detail string now says `(expected "archived" or "closed")`; hint says `Archive or close the change via /adv-archive or /adv-cancel`. Added closed-accept test; renamed 3 existing assertion sites + 2 test descriptions. 12/12 tests in branch-integration.test.ts pass.
- ✅ Widen drift-recovery guard + rename literal in tools/worktree/index.ts
  > Widened drift-recovery guard in tools/worktree/index.ts:1458-1467 to accept both archived and closed; introduced local `status` extraction for readability. Renamed reason literal to `change_not_terminal`; updated hint to "Archive or close change <id>...". Updated three correlated surfaces: (a) static fallback hint at line 1632 to "Branch must be archived or closed, merged, and clean"; (b) appendDebugLog message at line 1604 to "(terminal+merged verified)"; (c) inline 4-case comment block at lines 1560-1574 to reflect terminal semantics for cases (a) and (c). Added closed-accept drift-recovery test; renamed 3 existing assertion sites + 1 test description. 27/28 tests pass in index-delete.test.ts; the 1 failure is a pre-existing warp-workspace HTTP test unrelated to this change (verified by git stash + rerun on baseline).
- ✅ Full verification: pnpm test + pnpm run check
  > Full verification complete. (1) `rg "change_not_archived" plugin/src` returns zero matches. (2) `pnpm test` full suite: 2526 passed | 5 failed | 2 skipped (2533 total). Baseline 8808dd0: 2524 passed | 6 failed. Net: +2 passing (my new closed-accept tests in both code paths). All 5 remaining failures are pre-existing warp-workspace HTTP family — none touch the terminal-status gate (captured in wisdom ws-dI_fYL). (3) `pnpm run typecheck` clean. `pnpm run lint` clean. (4) `pnpm exec prettier --write src/tools/worktree/index.ts` applied to fix the one format warning I introduced; 3 remaining format warnings on adv-autonomy-quality-assets.test.ts, adv-skill-backed-commands-assets.test.ts, change.test.ts are pre-existing on baseline and out-of-scope. Net: changeset introduces zero new failures, lint clean, typecheck clean, format clean for files I touched.
- ⏭️ [meta] Blocking edge: T3 depends on T1+T2 completion. (Handled via blockedBy on this no-op task added before planning gate. Actually: add blockedBy to T3 directly.)

## Specs Modified


## Wisdom Accumulated

- **[gotcha]** Related upstream defect surfaced during this change: adv_change_close errors with "workflow execution already completed" when the change workflow has already terminated, instead of treating the terminated workflow as a successful close and writing the closed state. Out of scope for fixWorktreeTerminalStatusGate (which only widens the worktree-delete integration gate). Follow-up candidate: make adv_change_close idempotent — if the workflow is already terminated/completed, write the closed change.json projection and return success rather than surfacing the Temporal error. Without this fix, the new closed-accept path in the worktree-delete gate cannot be exercised end-to-end against a change that was closed after its workflow already completed.
- **[gotcha]** Pre-existing test failures on baseline 8808dd0 (unrelated to this change, verified via git stash + rerun): (1) index-delete.test.ts:326 "does not call workspace HTTP when the warp flag is disabled at delete time" — fetchImpl called once unexpectedly; (2) index-create.test.ts:632 timeout in "worktree_create defaults to warp but downgrades to terminal when workspace flag is off"; (3) workspace-warp.test.ts:291 similar HTTP-called-unexpectedly. All three center on the warp-workspace HTTP integration. Follow-up candidate: separate change to fix workspace flag suppression in worktree create/delete paths.
