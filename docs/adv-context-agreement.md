# ADV Context Agreement

Closes the gap between the agent's internal state and what the user can see. Two formatting patterns make agent state visible and verifiable.

## Problem

The agent holds rich structured state (gates, tasks, workdir, current task) that the user cannot inspect without explicit formatting. The agent proceeds with an implicit understanding that the user cannot verify or correct.

## Solution

Two formatted outputs, each with distinct triggers:

| Pattern | Purpose | Trigger |
|---------|---------|---------|
| Context Snapshot | Compact state summary | ADV tool responses (task/gate transitions, status) |
| Cross-Repo Switch | Workdir change indicator | Agent switches `workdir` to a different repo |

## Context Snapshot

A compact box (max 10 lines) included in `_contextSnapshot` output fields across ADV tools.

### Content

| Line | Content | Example |
|------|---------|---------|
| 1 | Change ID | `CONTEXT: improveContextAgreement` |
| 2 | Title | `Improve context agreement` |
| 3 | (blank separator) | |
| 4 | Gate progress | `Gates: [✓ proposal] [✓ discovery] [○ exec] ...` |
| 5 | Success criteria count | `Success: 3 criteria` |
| 6 | Task counts | `Tasks: 7 done | 1 active | 2 pending` |
| 7 | Current task (if any) | `Current: tk-abc123 (Implement feature X)` |
| 8 | Workdir | `Workdir: /home/user/dev/my-project` |

### Gate Symbols

| Symbol | Meaning |
|--------|---------|
| `✓` | Done |
| `⏭` | Skipped |
| `○` | Pending |

### Gate Labels

Gate IDs are rendered directly (no abbreviation map is currently defined):

| Gate ID | Label |
|---------|-------|
| `proposal` | `proposal` |
| `discovery` | `discovery` |
| `design` | `design` |
| `planning` | `planning` |
| `execution` | `execution` |
| `acceptance` | `acceptance` |
| `release` | `release` |

### Rendered Example

```
╔═══════════════════════════════════════════════════════════╗
║ CONTEXT: improveContextAgreement                         ║
║ Improve context agreement                                ║
║                                                          ║
║ Gates: [✓ proposal] [✓ discovery] [○ design] [○ execution]...
║ Success: 3 criteria                                      ║
║ Tasks: 7 done | 1 active | 2 pending                    ║
║ Current: tk-abc123 (Implement feature X)                 ║
║ Workdir: /home/user/dev/my-project                       ║
╚═══════════════════════════════════════════════════════════╝
```

### Emission Triggers

The snapshot is included automatically when ADV tools expose current change state. Per the Context Freshness Policy in `ADV_INSTRUCTIONS.md`, agents load full change context once with `adv_change_show`, then refresh per-task context via `adv_task_show` — so the snapshot is emitted at phase boundaries and task transitions.

| Trigger | Mechanism |
|---------|-----------|
| Task started | `adv_task_update` → `in_progress` |
| Task completed | `adv_task_update` → `done` |
| Task cancelled | `adv_task_cancel` → batch cancellation |
| Task created | `adv_task_add` → successful creation |
| Task ready for work | `adv_task_ready` |
| Gate transitions | `adv_gate_complete` response |
| Gate re-entry | `adv_change_reenter` response |
| Project overview | Recent entries in `adv_status` |

> **Note:** `adv_change_show` does not emit a snapshot — it returns structured JSON for direct LLM consumption. `adv_status` emits a full-box snapshot for the primary change only; non-primary changes receive a compact ticker.

> **rq-ctxsnap2.3–2.6 compliance:** Task-level triggers (`adv_task_update` → `in_progress`, `adv_task_update` → `done`, `adv_task_ready`, `adv_task_cancel`, `adv_task_add`) now emit the snapshot directly rather than deferring to the next `adv_change_show` call. Gate re-entry (`adv_change_reenter`) emits the snapshot showing the reset gate state.

### Graceful Degradation

| Missing Data | Behavior |
|--------------|----------|
| No gates | All gates shown as pending (`○`) |
| No tasks | Shows `0 done | 0 active | 0 pending` |
| No current task | Line omitted |
| No workdir | Shows `Workdir: (unavailable)` |
| No success criteria section | Shows `Success: 0 criteria` |
| No proposal text | Shows `Success: ? criteria` |

## Cross-Repo Switch Indicator

A formatted block emitted by the agent when switching `workdir` to a different repository during cross-repo task execution.

### Rendered Example

```
╔═══════════════════════════════════════════════════════════╗
║ 🔀 SWITCHING REPOSITORY CONTEXT                          ║
║ /home/user/dev/frontend → /home/user/dev/backend         ║
║ Task: tk-backend01 (Add /api/oauth/callback endpoint)    ║
╚═══════════════════════════════════════════════════════════╝
```

### When to Emit

Emit when the agent switches `workdir` to a different repository for a cross-repo task. Not emitted for workdir changes within the same repository.

## Implementation

| File | Exports |
|------|---------|
| `plugin/src/utils/context-snapshot.ts` | `formatContextSnapshot()`, `formatCrossRepoSwitch()` |
| `plugin/src/utils/context-snapshot.ts` | Types: `ContextSnapshotInput`, `CrossRepoSwitchInput` |
| `plugin/src/tools/status.ts` | Adds full-box `_contextSnapshot` to primary change; compact ticker to non-primary changes |
| `plugin/src/tools/gate.ts` | Emits updated `_contextSnapshot` in `adv_gate_complete` responses |
| `plugin/src/tools/task.ts` | Emits `_contextSnapshot` on `adv_task_update` (→ `in_progress` / → `done`), `adv_task_ready`, `adv_task_cancel`, and `adv_task_add` |
| `plugin/src/tools/change.ts` | Emits `_contextSnapshot` on `adv_change_reenter` (via `buildReentryResult`) |

## Spec

Requirements are defined in canonical JSON at `.adv/specs/chat-output-display/spec.json` and mirrored for humans at `docs/specs/chat-output-display.md` (renamed from `context-display` in v1.3.0 of change `consolidatechatoutputdisplay`):

| Requirement | Summary |
|-------------|---------|
| `rq-ctxsnap1` | Full-box snapshot content (change ID, title, success criteria, gates, tasks, workdir) |
| `rq-ctxsnap2` | Full-box emission triggers (change load, gate transition, re-entry, status query) |
| `rq-ctxticker1` | Compact ticker content (truncated change ID, gate arrow, done/total) |
| `rq-ctxticker2` | Ticker emission triggers (transient task tools — update, ready, add, cancel) |
| `rq-idleMarker01` | IDLE / ATTN status marker split |
| `rq-idleMarker02` | `STATUS_MARKERS.IDLE` constant + ⬜ emoji |
| `rq-idleMarker03` | IDLE bell policy (WORK/TOOLING→IDLE rings; IDLE↔IDLE / BLOCKED→IDLE / lateral IDLE↔ATTN do not) |
| `rq-ctxswitch` | Cross-repo switch indicator format (≤3 content lines) |
| `rq-ctxformat` | Box-drawing format, max 10 lines, ≤80 cols, deterministic |
| `rq-ctxfallback` | Graceful degradation for missing data |
