# Archive: Eliminate phantom active-change pointers

**Change ID:** eliminatePhantomActiveChange
**Archived:** 2026-06-17T15:38:45.178Z
**Created:** 2026-06-17T13:32:35.177Z

## Tasks Completed

- ✅ Add recordTerminalChange post-tool-output hook to plugin/src/index.ts for AC2/AC3.
  > Task checkpoint completed
- ✅ Add rq-activeChangePointer01 to advance-meta spec with 4 Given/When/Then scenarios.
  > Task checkpoint completed
- ✅ Add adv_change_forget MCP tool + tool-registry binding.
  > Task checkpoint completed
- ✅ Add isChangeReachable helper to plugin/src/tools/_adapters.ts with three-tier reachability check.
  > Task checkpoint completed
- ✅ Remove dead state.activeChange.objective field + system-block objective suffix + compaction fallback.
  > Task checkpoint completed
- ✅ Add recordForgetChange post-tool-output hook to plugin/src/index.ts for AC1 mismatch behavior.
  > Task checkpoint completed
- ✅ Modify handleToolExecuteBefore in plugin/src/index.ts to gate re-pointing via isChangeReachable.
  > Task checkpoint completed
- ✅ Run full check + latency benchmark + final validation for AC9 + DDC2.
  > Task checkpoint completed

## Specs Modified

