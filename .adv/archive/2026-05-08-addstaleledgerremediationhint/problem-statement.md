## Problem

During session compaction, ADV preserves state through a compact context block. If the compacted resume context has no active task while execution is still incomplete, the next agent needs a recovery instruction. Without a concrete hint, the agent/user must infer whether to refresh state, pick a ready task, or move to acceptance.

## Evidence

- `plugin/src/index.ts:803-805` documents stale-ledger detection intent: replace stale resume hint with explicit warning when referenced task is cancelled or done.
- `plugin/src/utils/compaction-context.ts` currently builds only the context snapshot plus specs summary.
- `plugin/src/__tests__/compaction.test.ts` validates current in-progress task compaction, but no stale ledger recovery hint cases exist.
- Independent validator found the naive condition (`no in_progress && any done/cancelled`) too broad; it would false-positive on healthy completed or idle states.