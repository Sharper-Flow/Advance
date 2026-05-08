## Implementation Strategy

### Validator result

Independent validator returned **CAUTION**: the initial detection condition (`no in_progress` and any `done`/`cancelled`) was too broad. It would warn on healthy completed changes or between-task states. Adopt stricter detection using task statuses and execution gate state, both already available to `buildCompactionContext()`.

### Helper

Add pure helper in `plugin/src/utils/compaction-context.ts`:

```ts
function formatStaleLedgerRemediation(
  tasks: CompactionTaskLike[],
  gates?: Record<string, GateInfo>,
): string | null
```

### Detection condition

Emit hint only when:

```ts
const executionIncomplete =
  gates?.execution?.status !== "done" && gates?.execution?.status !== "skipped";
const hasNoActiveTask = tasks.every((t) => t.status !== "in_progress");
const hasPendingWork = tasks.some((t) => t.status === "pending");
const hasAnyStartedOrTerminal = tasks.some(
  (t) => t.status === "done" || t.status === "cancelled",
);
const allTasksTerminal =
  tasks.length > 0 && tasks.every((t) => t.status === "done" || t.status === "cancelled");

shouldWarn =
  !!gates &&
  executionIncomplete &&
  hasNoActiveTask &&
  (hasPendingWork || allTasksTerminal) &&
  (hasAnyStartedOrTerminal || allTasksTerminal);
```

Interpretation:
- execution incomplete + pending work + no active task + some progress already happened → stale/between-turn recovery needed.
- execution incomplete + all terminal tasks → orphaned execution gate; agent should move to acceptance after refresh.
- skip fresh pending-only plan: no work started yet, not stale.
- skip missing gates: insufficient signal, avoid false warning.
- skip execution done: completed state is normal.
- skip active task: normal resume context already exists.

### Remediation text

Add section after snapshot and before specs:

```text
=== ADV STALE LEDGER REMEDIATION ===
⚠ No active task remains while execution is incomplete.
Remediation:
- call adv_change_show with include.snapshot=true and include.readyTasks=true
- if _readyTasks is non-empty, continue from the first ready task
- if all tasks are done/cancelled, complete acceptance after review
====================================
```

### Tests

Use focused tests around `buildCompactionContext()` rather than full plugin hook where possible:
- stale pending-after-progress emits hint.
- orphaned all-terminal execution-incomplete emits hint.
- active in-progress emits no hint and keeps `Current:`.
- fresh pending-only emits no hint.
- all-terminal execution done emits no hint.
- missing gates emits no hint.

### Risk

Low. Output-only pure helper, no storage mutation, no Temporal behavior change. Main risk is false positives; mitigated by gate-aware detection and explicit negative tests.