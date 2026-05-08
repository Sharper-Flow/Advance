## Problem

Investment and reflection reports currently have only wall-clock gate deltas. Example: if design completes Friday and prep completes Monday after no work happened over the weekend, `active_elapsed_ms` includes the whole weekend. That field is now compatibility-bound, but consumers still need a separate task-derived work-time signal to avoid confusing idle/user-wait time with active work.

## Evidence

- `plugin/src/tools/investment.ts:96-101` sets `activeElapsedMs = sum(Object.values(perGateMs))`.
- `computePerGateDurations()` in `plugin/src/tools/investment.ts:132-164` computes `gate.completed_at - previous_gate.completed_at`.
- `plugin/src/tools/reflection.ts:339-343` repeats the same `activeElapsedMs` derivation.
- Task types have `started_at` and `completed_at` (`plugin/src/types/tasks.ts:154-155`).
- Validator identified existing consumers and tests that rely on `active_elapsed_ms === sum(per_gate_ms)`, so a non-breaking additive metric is safer.