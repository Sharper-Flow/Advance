# Archive: Update epic archive

**Change ID:** updateEpicArchive
**Archived:** 2026-06-26T21:13:58.248Z
**Created:** 2026-06-26T19:17:23.994Z

## Tasks Completed

- ✅ Runtime: project archived Epic child terminal summary
  > Added `Store.epics.setEntryTerminalSummary` backed by existing `entryTerminalSummarySignal`, disk fallback stub, and archive terminalization calls after durable release proof/status archive transition in both async and sync paths. Added failing-then-passing Phase 9 test asserting Epic terminal summary projection after archive proof and after change save.
- ✅ Docs/spec/agent: make archive Epic-aware
  > Updated `/adv-archive` Phase 1/7/8 guidance for Epic child archive verification, terminal_summary repair/backfill, and Epic report line. Updated ADV agent and ADV_INSTRUCTIONS Epic context guidance for archive/release repair evidence. Added `rq-epicArchiveSync01` to spec JSON and docs mirror. Extended asset tests for archive/release terminal projection and retroactive repair/backfill guidance.
- ✅ Verification: run targeted contract checks and validate change
  > Verified archive Phase 9 Epic terminal projection, retroactive Epic repair/backfill, and asset/spec/agent command contracts. `adv_change_validate strict:true` passed with non-blocking NO_DELTAS warning.
- ✅ Runtime: repair archived Epic children retroactively
  > Extended `adv_epic_repair_membership mode=sync_child_projection` so terminal child changes (`archived`/`closed`) project `terminal_summary` onto the parent Epic via existing `store.epics.setEntryTerminalSummary` instead of only refreshing child membership. Added archived-child and closed-child dry-run tests proving terminal backfill and no child workflow mutation.
- ✅ Docs/spec: include retroactive Epic repair contract
  > Expanded `rq-epicArchiveSync01` and mirror docs to cover retroactive repair/backfill of already archived/closed child changes, canonical child/archive evidence, terminal_summary projection, progress recomputation, and non-Epic/archive-order invariants. Command and agent guidance now mention typed repair/backfill for already-archived children still shown active.
- ✅ Verification: expanded Epic archive and repair coverage
  > Verified future archive terminal projection, retroactive archived/closed child repair, archive/spec/agent guidance, and ADV contract validation. No source edits required for this verification task.

## Specs Modified


## Wisdom Accumulated

- **[gotcha]** Epic membership repair status is not the same as terminal-history projection: `adv_epic_repair_membership` can make child projection `ok`, but compact Epic history depends on `entry.terminal_summary`. Archive paths must fire the existing terminal-summary signal after release proof to move archived children out of `next_work`.
- **[pattern]** For Epic repair/backfill, route terminal archived/closed child changes through the existing `entryTerminalSummarySignal`/`setEntryTerminalSummary` path instead of child membership projection. `recomputeEpicProgress` keys off `terminal_summary`, so membership repair alone cannot advance completed_entries or next_entry_id.
