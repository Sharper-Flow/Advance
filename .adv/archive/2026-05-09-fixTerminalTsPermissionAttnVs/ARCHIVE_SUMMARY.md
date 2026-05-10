# Archive: Fix terminal.ts permission-ATTN vs idle-ATTN distinction

**Change ID:** fixTerminalTsPermissionAttnVs
**Archived:** 2026-05-09T22:29:58.386Z
**Created:** 2026-05-09T21:18:16.114Z

## Tasks Completed

- ✅ Add failing regression tests for permission-ATTN (immediate ring) vs idle-ATTN (debounce/armed) distinction.
  > Regression tests updated: ATTN always rings immediately, IDLE uses armed/debounce. TODO comment removed. Committed in worktree.
- ✅ Implement separated ATTN/IDLE bell logic in updateTerminalStatus.
  > Implemented: separated ATTN (permission, always immediate) from IDLE (armed/debounce) in updateTerminalStatus bell logic.
- ✅ Run focused terminal tests and verify bell behavior.
  > Verification: typecheck clean, lint clean, all 1993 tests pass. Only pre-existing overlay-sync failure.

## Specs Modified

