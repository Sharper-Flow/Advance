# ADV Context Agreement

Closes the gap between the agent's internal state and what the user can see. Two formatting patterns make agent state visible and verifiable.

## Problem

The agent holds rich structured state (gates, tasks, workdir, current task) that the user cannot inspect without explicit formatting. The agent proceeds with an implicit understanding that the user cannot verify or correct.

## Solution

Two formatted outputs, each with distinct triggers:

| Pattern | Purpose | Trigger |
|---------|---------|---------|
| Context Snapshot | Compact state summary | `adv_change_show` output |
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

Full gate IDs are abbreviated for compactness:

| Gate ID | Label |
|---------|-------|
| `proposal` | `proposal` |
| `discovery` | `discovery` |
| `design` | `design` |
| `planning` | `planning` |
| `execution` | `exec` |
| `acceptance` | `accept` |
| `release` | `release` |

### Rendered Example

```
╔═══════════════════════════════════════════════════════════╗
║ CONTEXT: improveContextAgreement                         ║
║ Improve context agreement                                ║
║                                                          ║
║ Gates: [✓ proposal] [✓ discovery] [○ design] [○ exec]...║
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
| Change loaded for work | `adv_change_show` |
| Gate transitions | `adv_gate_complete` response and next `adv_change_show` call |
| Task switches | Reflected in next `adv_change_show` call |
| Project overview | Recent entries in `adv_status` |

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
║ From: /home/user/dev/frontend                            ║
║ To:   /home/user/dev/backend                             ║
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
| `plugin/src/tools/change.ts` | Builds snapshot from change/gates/tasks/proposal, adds `_contextSnapshot` to output |
| `plugin/src/tools/status.ts` | Adds `_contextSnapshot` to each recent change in `adv_status` |
| `plugin/src/tools/gate.ts` | Emits updated `_contextSnapshot` in `adv_gate_complete` responses |

## Spec

Requirements defined in `.adv/specs/context-display/spec.json`:

| Requirement | Summary |
|-------------|---------|
| `rq-ctxsnap1` | Snapshot content (change ID, title, success criteria, gates, tasks, workdir) |
| `rq-ctxsnap2` | Emission triggers (change load, gate transition, task switch) |
| `rq-ctxswitch` | Cross-repo switch indicator format |
| `rq-ctxformat` | Box-drawing format, max 10 lines, deterministic |
| `rq-ctxfallback` | Graceful degradation for missing data |
