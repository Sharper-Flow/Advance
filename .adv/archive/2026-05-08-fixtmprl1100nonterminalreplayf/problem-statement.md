## Problem

`adv_change_show`, `adv_gate_status`, `adv_change_archive`, and `adv_reflect` fail with `[TMPRL1100] Nondeterminism error: No command scheduled for event HistoryEvent(WorkflowExecutionUpdateAccepted)` for non-terminal changes whose workflow history was written under pre-R1 code that used `wf.defineUpdate`. The R1 cutover collapsed updates to signals, but the existing event-231 records in workflow history are unreplayable.

## Concrete reproduction

The audit-session 2026-05-07 case: change `refactorChangeWorkflowsSignal` (38 tasks done, 7 gates done, status `active` not `archived`) was terminated by migration matrix Tier 5. Disk projection captured the full state. Tool calls failed:

```
adv_change_show changeId: "refactorChangeWorkflowsSignal"
→ [TMPRL1100] Nondeterminism error: No command scheduled for event HistoryEvent(id: 231, WorkflowExecutionUpdateAccepted)

adv_gate_status changeId: "refactorChangeWorkflowsSignal" → same error
adv_change_archive changeId: "refactorChangeWorkflowsSignal" → same error
adv_reflect changeId: "refactorChangeWorkflowsSignal" → same error
```

Workaround used: manually assembled in-repo archive bundle by copying disk projection files; committed to trunk. Work was preserved but the Temporal-side state is permanently unreachable via tools.

## Why this matters

1. **Read-tool blockage.** The four affected tools are critical-path for inspecting, archiving, and reflecting on completed work. No code-level escape hatch exists today.
2. **Silent corruption surface.** TMPRL1100 is recognized in `classifyTemporalError` and the archived/closed branch correctly returns disk projection — but the active-status branch falls through to a `null` re-seed and rethrows the error.
3. **Recovery requires shell manipulation.** Outside ADV's tool surface, defeating the design goal of self-contained recovery.

## Who is affected

- Anyone with non-terminal changes whose workflow histories pre-date R1 (still on disk pending culling)
- Future migrations that cull workflow updates risk reproducing this class of failure

## Constraints

- Disk fallback MUST be non-destructive: no new workflow run, no summary-signal re-emit, no archive-purge interaction
- Returned data MUST carry `_source: "disk"` so callers can distinguish stale from live state
- Healthy workflows MUST keep current path; fallback only triggers on TMPRL1100/replay failure
- Spec deltas to `rq-replayFallback01` to extend coverage to non-terminal changes

## Linked GitHub issue

Sharper-Flow/Advance#58