# Archive: Fix epic terminal projection

**Change ID:** fixEpicTerminalProjection
**Archived:** 2026-07-10T06:47:08.814Z
**Created:** 2026-07-10T02:09:45.002Z

## Tasks Completed

- ✅ Normalize terminal summary reducer state
  > `applyEntryTerminalSummaryToState` now sets `entry.membership_status = "terminal"` in the same state mutation that records `terminal_summary`. Reducer tests now assert archived and closed terminal summaries normalize membership status to terminal.
- ✅ Cover terminal projection caller paths
  > Added `terminalProjectionConsistencyFields` so terminal projection outputs report `repaired: true` only when typed membership status is OK/terminal. If a terminal summary returns stale membership, output keeps success but sets `repaired: false`, returns member status, and emits an explicit warning. Updated repair tests to assert sync_child_projection returns terminal membership/OK for normal terminal repair and warning/stale status when typed state remains inconsistent.
- ✅ Run terminal projection verification sweep
  > Verified terminal projection behavior across reducer, repair caller paths, and acceptance review remediation. Final evidence: bin/oc-test targeted -- src/temporal/epic-state.test.ts src/tools/epic.test.ts passed 138 tests; pnpm run format:check passed; pnpm run typecheck passed; adv_change_validate strict:true passed earlier with only NO_DELTAS warning. Reviewer found and fixed one in-scope issue: `memberStatusForEntry` can report `linked` as display OK, so repaired success now requires typed terminal membership directly.

## Specs Modified


## Wisdom Accumulated

- **[gotcha]** In this repo, `pnpm test -- src/temporal/epic-state.test.ts` can still run broader Vitest surfaces and surface unrelated asset failures. For tight task RED/GREEN loops, use `pnpm exec vitest run <file>` through `adv_run_test` for the targeted file, or `bin/oc-test targeted -- <file>` for broader repo-throttled verification.
- **[pattern]** For terminal projection/repair tool outputs, keep display health derived from typed `membership_status` and add an explicit warning when a terminal summary returns stale membership. This preserves structural correctness: reducers normalize the happy path, while tools refuse to label inconsistent typed state as repaired/OK by heuristic.
