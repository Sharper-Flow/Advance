# ADV Task Status Report

When the `/apply` or `/ralph` loop stops, or during `/compaction`, emit a task status report.

## Trigger Events

| Event | Description |
|-------|-------------|
| **Loop Stop** | `/apply` or `/ralph` terminates (success, error, doom loop, or user cancel) |
| **Compaction** | OpenCode runs `/compaction` to reduce context |

## Report Format

```
╔══════════════════════════════════════════════════════════════╗
║ TASK STATUS REPORT                                           ║
╠══════════════════════════════════════════════════════════════╣
║ Change: {change-id}                                          ║
║ Trigger: {loop_stop | compaction}                            ║
║ Timestamp: {ISO timestamp}                                   ║
╠══════════════════════════════════════════════════════════════╣
║ COMPLETED THIS SESSION:                                      ║
║   ✓ tk-abc123: Task description                              ║
╠══════════════════════════════════════════════════════════════╣
║ IN PROGRESS (interrupted):                                   ║
║   ⚡ tk-ghi789: Task description                              ║
╠══════════════════════════════════════════════════════════════╣
║ CANCELLED (with reasoning):                                  ║
║   ✗ tk-jkl012: Task description                              ║
║     → Reason: Why task was cancelled                         ║
╠══════════════════════════════════════════════════════════════╣
║ REMAINING:                                                   ║
║   ○ tk-mno345: Task description                              ║
╚══════════════════════════════════════════════════════════════╝
```

## Report Contents

| Section | Description |
|---------|-------------|
| **COMPLETED** | Tasks marked `done` during this session |
| **IN PROGRESS** | Tasks with `in_progress` status when stopped |
| **CANCELLED** | Tasks marked `cancelled` with full reasoning |
| **REMAINING** | Tasks still `pending` for future work |

## Cancelled Task Requirements

For ANY cancelled task, provide:
- Why the task was cancelled (superseded, duplicate, out of scope)
- What alternative approach was taken, if any
- Related tasks that replaced this work

## Usage

Emit `[ADV:TASK_STATUS_REPORT]` marker before the report:

```
[ADV:TASK_STATUS_REPORT]
╔══════════════════════════════════════════════════════════════╗
...
```
