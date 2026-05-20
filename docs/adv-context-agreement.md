# ADV Context Agreement

Closes the gap between the agent's internal state and what the user can see. The `chat-output-display` spec is canonical; this doc summarizes the user-visible surfaces and trigger split.

## Problem

The agent holds rich structured state (gates, tasks, workdir, current task) that the user cannot inspect without explicit formatting. The agent proceeds with an implicit understanding that the user cannot verify or correct.

## Solution

Four visible surfaces, each with distinct triggers:

| Pattern | Purpose | Trigger |
|---------|---------|---------|
| Context Snapshot | Full-box phase/change state summary | Change creation, gate completion, gate re-entry, primary `adv_status`, session resume |
| Context Ticker | Compact task-state summary | Transient task tools (`adv_task_update`, `adv_task_ready`, `adv_task_add`, `adv_task_cancel`) |
| Cross-Repo Switch | Workdir change indicator | Agent switches `workdir` to a different repo |
| Status/title notification policy | Non-audible terminal title/status behavior | Terminal status/title update paths |

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

The full-box snapshot is included at phase/change boundaries. Per the Context Freshness Policy in `ADV_INSTRUCTIONS.md`, agents load full change context once with `adv_change_show`, then refresh per-task context via task tools. Transient task tools emit the compact ticker instead of the full-box snapshot.

| Trigger | Surface | Mechanism |
|---------|---------|-----------|
| Change created | Context Snapshot | `adv_change_create` response |
| Gate transitions | Context Snapshot | `adv_gate_complete` response |
| Gate re-entry | Context Snapshot | `adv_change_reenter` response |
| Project overview | Context Snapshot for primary change; Context Ticker for non-primary changes | `adv_status` recent entries |
| Session resume | Context Snapshot | Active-change resume context |
| Task started | Context Ticker | `adv_task_update` → `in_progress` |
| Task completed | Context Ticker | `adv_task_update` → `done` |
| Task cancelled | Context Ticker | `adv_task_cancel` → batch cancellation |
| Task created | Context Ticker | `adv_task_add` → successful creation |
| Task ready for work | Context Ticker | `adv_task_ready` |

> **Note:** `adv_change_show` does not emit a snapshot — it returns structured JSON for direct LLM consumption. `adv_status` emits a full-box snapshot for the primary change only; non-primary changes receive a compact ticker.

> **rq-ctxsnap2 / rq-ctxticker2 compliance:** Gate/change triggers emit the full-box snapshot directly. Task-level triggers (`adv_task_update` → `in_progress`, `adv_task_update` → `done`, `adv_task_ready`, `adv_task_cancel`, `adv_task_add`) emit the compact ticker directly rather than deferring to the next `adv_change_show` call.

## Context Ticker

A compact single-line `_contextSnapshot` used for transient task-state tools. It summarizes the current change ID, gate arrow, and task progress without flooding scrollback.

Example:

```text
║ removeTerminalBells · execution ✓→acceptance · 4/4 ║
```

## Status/Title Notification Policy

ADV owns deterministic status markers and terminal title updates only. It does not emit BEL (`\x07`) or replacement terminal notification protocols for status/title paths; completion/attention notifications are host/tool-owned.

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
| `plugin/src/tools/task.ts` | Emits compact ticker `_contextSnapshot` on `adv_task_update` (→ `in_progress` / → `done`), `adv_task_ready`, `adv_task_cancel`, and `adv_task_add` |
| `plugin/src/tools/change.ts` | Emits `_contextSnapshot` on `adv_change_create` and `adv_change_reenter` (via `buildReentryResult`) |

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
| `rq-idleMarker03` | IDLE host-owned notifications; ADV status transitions do not emit BEL or replacement notification protocols |
| `rq-titleBell01` | Terminal status/title paths do not emit BEL; OSC titles use ST terminators and control-byte-normalized payloads |
| `rq-ctxswitch` | Cross-repo switch indicator format (≤3 content lines) |
| `rq-ctxformat` | Box-drawing format, max 10 lines, ≤80 cols, deterministic |
| `rq-ctxfallback` | Graceful degradation for missing data |
| `rq-toolTitle01` | Deterministic ADV tool display titles with parseable structured output preserved |
| `rq-toolTitle02` | Tool display titles are presentation-only and never correctness authority |
| `rq-toolTitle03` | Tool display titles redact sensitive values and bound long snippets |
