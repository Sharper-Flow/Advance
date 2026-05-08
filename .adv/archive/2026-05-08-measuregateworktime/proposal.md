## Intent

Add task-derived active work-time metrics without breaking existing wall-clock investment/reflection fields. Today `computePerGateDurations()` measures wall-clock deltas between gate completion timestamps, and `active_elapsed_ms` is the sum of those deltas. That makes overnight waits, user-approval pauses, and session idle time look like active work. Validator feedback: keep current fields for compatibility and add explicit work-time fields.

This is part 4 of umbrella tracker `ag-55f13852-56ba-4829-937b-051b42917788` (Telemetry & Temporal follow-ups from fixTemporalContextMismatch).

## Scope

In scope:
- `plugin/src/tools/investment.ts` — compute and expose task-derived `per_gate_work_ms` and `active_work_ms`.
- `plugin/src/tools/reflection.ts` — include the same work-time metrics in reflection plane 1.
- `plugin/src/storage/reflection.ts` — persist optional work-time fields without breaking old reflections.
- Tests for idle gaps, overlapping task intervals, missing timestamps, cancelled tasks, and backward-compatible wall-clock output.

Out of scope:
- Persisting new per-gate start/end events.
- Changing gate completion semantics.
- Rewriting historical archived reflections.
- Changing `elapsed_ms`, `per_gate_ms`, or `active_elapsed_ms` semantics.
- Other umbrella items (#3, #6).

## Success Criteria

- `per_gate_ms` remains available as wall-clock gate deltas for backward compatibility.
- `active_elapsed_ms` remains the sum of wall-clock `per_gate_ms` for backward compatibility.
- New `per_gate_work_ms` reports task work time by gate, computed from task intervals clamped to gate windows.
- New `active_work_ms` equals sum of `per_gate_work_ms`.
- Concurrent overlapping task intervals are unioned, not double-counted.
- Idle gaps between gate completions inflate `per_gate_ms` but not `active_work_ms`.
- Reflection plane 1 persists `per_gate_work_ms` and `active_work_ms` consistently.
- Tests cover wall-clock vs work-time divergence, interval overlap clamping, overlap union, missing timestamps, cancelled tasks, and reflection persistence shape.
- `pnpm run check` and targeted tests pass.

## Out of Scope

- Inferring work time for tasks without `started_at`/`completed_at`.
- Adding UI/report formatting beyond structured tool/reflection output.