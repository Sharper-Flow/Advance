## Implementation Strategy

### Validator result

Independent validator returned **CAUTION**: changing `active_elapsed_ms` would break current consumers/tests. Adopt additive approach:
- keep `per_gate_ms` and `active_elapsed_ms` unchanged (wall-clock gate deltas)
- add `per_gate_work_ms` and `active_work_ms` as explicit task-derived active-work metrics

### Current behavior

`computePerGateDurations(change)` computes wall-clock deltas:
- proposal: `proposal.completed_at - change.created_at`
- discovery: `discovery.completed_at - proposal.completed_at`
- etc.

`active_elapsed_ms` remains sum of `per_gate_ms`.

### New helper

Add pure helpers in `plugin/src/tools/investment.ts`:

```ts
export function computePerGateWorkDurations(change: {
  created_at?: string;
  gates?: Record<string, { status?: string; completed_at?: string } | undefined>;
  tasks?: Array<{ started_at?: string | null; completed_at?: string | null }>;
}): Record<string, number>
```

Algorithm:
1. Build completed gate windows using existing gate order:
   - each completed gate gets `[previousCompletedAtOrCreatedAt, gate.completed_at]`.
2. For each task with valid `started_at` and `completed_at`, compute interval `[started, completed]`.
3. For each gate window, compute positive overlap interval:
   - `[Math.max(taskStart, gateStart), Math.min(taskEnd, gateEnd)]`.
4. Collect overlaps per gate.
5. Merge overlapping intervals per gate before summing (interval union), so concurrent tasks are not double-counted.
6. Include every completed gate in `per_gate_work_ms`, using `0` when no task work overlaps.
7. Ignore invalid/missing/non-positive task intervals.
8. Include cancelled task intervals because attempted work time is real work.

### Output shape

`adv_investment_report` returns:
- `per_gate_ms`: existing wall-clock record
- `active_elapsed_ms`: existing wall-clock sum of `per_gate_ms`
- `per_gate_work_ms`: new task-derived record
- `active_work_ms`: sum of `per_gate_work_ms`
- `elapsed_ms`: unchanged wall-clock since change creation

`adv_reflect` stores the same in `plane1.efficiency`:
- existing `per_gate_ms`
- existing `active_elapsed_ms`
- new optional `per_gate_work_ms`
- new optional `active_work_ms`

### Compatibility

- Existing `per_gate_ms` and `active_elapsed_ms` consumers continue to work.
- Reflection schema uses `.passthrough()`, but update TypeScript interface and Zod schema for `per_gate_work_ms` and `active_work_ms` optional fields.
- Historical reflections without new fields remain valid.

### Tests

Investment unit tests:
- wall-clock and work-time diverge when gate windows include idle gaps.
- `active_elapsed_ms` still equals wall-clock sum.
- `active_work_ms` equals work-time sum.
- task interval crossing gate boundary clamps overlap into each gate.
- concurrent overlapping tasks use union, not sum.
- missing task timestamps ignored.
- cancelled task interval included.

Reflection/storage tests:
- reflection schema accepts `per_gate_work_ms` and `active_work_ms`.
- reflection builder persists both fields.

### Risk

Medium-low. Adds new metrics while preserving old semantics. Main implementation risk is interval double-counting; mitigated by interval-union tests.