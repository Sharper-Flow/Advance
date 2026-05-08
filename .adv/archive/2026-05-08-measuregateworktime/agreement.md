## Objectives

1. Keep existing wall-clock timing fields stable (`per_gate_ms`, `active_elapsed_ms`).
2. Add explicit task-derived work-time fields (`per_gate_work_ms`, `active_work_ms`).
3. Use interval union to avoid double-counting concurrent work.
4. Persist the new work-time fields in reflections.

## Acceptance Criteria

| AC | Statement | Verification |
|----|-----------|--------------|
| AC1 | `per_gate_ms` keeps existing wall-clock gate delta semantics | Existing/new tests |
| AC2 | `active_elapsed_ms` still equals sum of `per_gate_ms` | Existing/new test |
| AC3 | `per_gate_work_ms` is emitted by `adv_investment_report` | Unit test |
| AC4 | `active_work_ms` equals sum of `per_gate_work_ms` | Unit test |
| AC5 | Idle gap between gate completions inflates `per_gate_ms` but not `active_work_ms` | Unit test |
| AC6 | Task intervals crossing gate windows are clamped to gate overlap | Unit test |
| AC7 | Concurrent overlapping task intervals are unioned, not double-counted | Unit test |
| AC8 | Tasks missing `started_at` or `completed_at` do not contribute work time | Unit test |
| AC9 | Cancelled tasks with valid intervals contribute work time | Unit test |
| AC10 | Reflection plane 1 stores `per_gate_work_ms` and `active_work_ms` | Unit/storage test |
| AC11 | `pnpm run check` passes | Verification task |
| AC12 | targeted investment/reflection tests pass | Verification task |

## Dependencies

None.