## Summary

Extend the existing TMPRL1100 disk-fallback path in `reseedChangeFromDisk` to also cover non-terminal changes when re-seed itself fails, by returning `withProjectionRecovery(change, "disk", reason)` from the catch block instead of `null`.

## Rationale

`classifyTemporalError` at `plugin/src/temporal/retry-wrapper.ts:60-65` already classifies TMPRL1100 as `fallback`. The orchestration in `getTemporalChange` (`plugin/src/storage/store-temporal/index.ts:457`) already routes `fallback` errors through `reseedChangeFromDisk`. The archived/closed branch at line 367 already returns the disk projection without re-seeding.

The remaining gap is the **non-terminal re-seed failure path**: when re-seed throws (e.g. terminated workflow with same ID prevents `ensureChangeWorkflowStarted` from creating a new run), the catch at line 398-409 logs and returns `null`, which causes `getTemporalChange` line 466 to rethrow the original TMPRL1100.

The fix mirrors the existing archived/closed pattern: if re-seed fails AND the original error was a `fallback`-classified one (TMPRL1100, etc.), return the disk projection marked `_source: "disk"` instead of `null`.

## Success Criteria

1. `adv_change_show` for a non-terminal change with poisoned workflow history returns the disk projection with `_source: "disk"` instead of throwing.
2. `adv_gate_status`, `adv_change_archive`, `adv_reflect` succeed against the same change (they all route through `getTemporalChange` and gate-status recovery).
3. New regression test in `plugin/src/storage/store-temporal/index.test.ts` covers the active+poisoned+failed-reseed case, parallel to the existing archived+poisoned test (line 67).
4. No regression: all existing tests pass (`pnpm test`), specifically:
   - Archived+poisoned disk projection (existing test line 67)
   - Archive bundle projection when source absent (line 81)
   - Gate recovery on poisoned history (line 106)
5. Disk fallback is non-destructive: does not start a new workflow run, does not emit summary signals, does not interact with archive purge.
6. Spec requirement `rq-replayFallback01` is extended to mandate non-terminal coverage; assets test catches future regressions.

## In Scope

| File | Change |
|---|---|
| `plugin/src/storage/store-temporal/index.ts` | Modify `reseedChangeFromDisk` catch path (line 398-409) to return `withProjectionRecovery(change, "disk", reason)` when the re-seed failure was triggered by a `fallback`-classified error. |
| `plugin/src/storage/store-temporal/index.test.ts` | Add active+poisoned+failed-reseed regression test. |
| `.adv/specs/temporal-storage/spec.md` (or equivalent) | Extend `rq-replayFallback01` to cover non-terminal status. |

## Out of Scope

- "Force-disk-read" tool mode (issue #58 proposal #2) — defer to future change if needed
- `adv_workflow_reset` migration tool (issue #58 proposal #3) — separate scope
- Workflow history culling improvements
- Telemetry around fallback frequency (covered by #61)
- Any change to `classifyTemporalError` regex (already correct)

## Constraints

- × MUST NOT start a new workflow run when falling back
- × MUST NOT emit `ChangeSummary` signal from fallback path
- × MUST NOT undo `adv_archive_purge`
- ✓ MUST mark fallback returns with `_source: "disk"` and a `ProjectionRecoveryReason`
- ✓ MUST keep healthy-workflow path unchanged

## Acceptance Criteria

| AC | Verifiable by |
|---|---|
| `adv_change_show` returns disk projection on TMPRL1100 for active changes | New test in `index.test.ts` |
| `adv_gate_status` returns recovered gates on TMPRL1100 for active changes | Gate-recovery test extended |
| Disk return marked `_source: "disk"` | Test assertion |
| Fallback does not start a new workflow run | Test mock asserts `start` not called |
| Existing archived+poisoned tests still pass | Existing tests unchanged |
| `pnpm run check` and `pnpm test` pass | CI |

## Estimated effort

Small. ~10 lines of code change + 1 test. Single-file fix.