# Context Display

> **Version:** 1.2.0
> **Updated:** 2026-04-23

## Purpose

Structured formatting patterns that make agent internal state visible to the user, closing the context agreement gap between what the agent knows and what the user sees.

## Requirements

### Context Snapshot Content

**ID:** `rq-ctxsnap1` | **Priority:** **[MUST]**

The Context Snapshot MUST display: change ID and title, success criteria count, gate progress (inline visual), task counts by status, and current workdir. The snapshot MUST fit within 10 lines for quick scanning.

**Tags:** `context-display`, `snapshot`

#### Scenarios

**Snapshot includes all required fields** (`rq-ctxsnap1.1`)

**Given:**
- An active change with tasks, gates, and a proposal

**When:** A context snapshot is rendered

**Then:**
- The output includes the change ID and title
- The output includes gate progress as an inline visual
- The output includes task counts grouped by status
- The output includes the current workdir path

**Snapshot fits within 10 lines** (`rq-ctxsnap1.2`)

**Given:**
- A change with 20 tasks across 4 sections and all 7 gates

**When:** A context snapshot is rendered

**Then:**
- The total output is 10 lines or fewer

---

### Context Snapshot Emission Triggers

**ID:** `rq-ctxsnap2` | **Priority:** **[MUST]**

The Context Snapshot MUST be emitted at defined trigger points: when a change is first loaded for work, when a gate transitions, when the active task switches, when tasks are cancelled, when tasks are created, when gates are reopened via re-entry, and when a session resumes with an active change. Emission is automatic — not only on user request.

**Tags:** `context-display`, `snapshot`, `triggers`

#### Scenarios

**Snapshot emitted on change load** (`rq-ctxsnap2.1`)

**Given:**
- An agent begins work on a change via adv_change_show or /adv-apply

**When:** The change data is loaded

**Then:**
- A context snapshot is included in the tool output

**Snapshot emitted on gate transition** (`rq-ctxsnap2.2`)

**Given:**
- A gate is marked complete via adv_gate_complete

**When:** The gate status changes

**Then:**
- The updated gate progress is visible in subsequent tool output

**Snapshot emitted on task switch** (`rq-ctxsnap2.3`)

**Given:**
- An agent completes one task and starts another

**When:** adv_task_update changes a task to in_progress

**Then:**
- The tool output reflects the new current task context

**Snapshot emitted on task cancellation** (`rq-ctxsnap2.4`)

**Given:**
- An active change with tasks

**When:** adv_task_cancel successfully cancels one or more tasks

**Then:**
- The tool output includes an updated _contextSnapshot
- The snapshot task counts reflect the cancellations

**Snapshot emitted on task creation** (`rq-ctxsnap2.5`)

**Given:**
- An active change where the planning gate is not yet complete

**When:** adv_task_add successfully creates a new task

**Then:**
- The tool output includes an updated _contextSnapshot
- The snapshot task counts reflect the new task

**Snapshot emitted on gate re-entry** (`rq-ctxsnap2.6`)

**Given:**
- A change with completed gates

**When:** adv_change_reenter reopens gates from a specified point

**Then:**
- The tool output includes an updated _contextSnapshot
- The snapshot gate progress shows the reset gate state

---

### Cross-Repo Switch Indicator

**ID:** `rq-ctxswitch` | **Priority:** **[MUST]**

When the agent switches workdir to a different repository during a change, a formatted indicator MUST be emitted showing the from/to paths and the task that triggered the switch. This prevents the user from losing track of which repository context the agent is operating in.

**Tags:** `context-display`, `cross-repo`

#### Scenarios

**Switch indicator shows from/to paths** (`rq-ctxswitch.1`)

**Given:**
- A change with cross-repo tasks
- The agent is switching workdir from repo A to repo B

**When:** The cross-repo switch indicator is rendered

**Then:**
- The output shows the source repository path
- The output shows the target repository path
- The output shows the task that triggered the switch

---

### Context Display Format Constraints

**ID:** `rq-ctxformat` | **Priority:** **[MUST]**

All context display formatting MUST use box-drawing characters consistent with existing ADV patterns (banner.ts). The format MUST be deterministic — identical state produces identical output. The snapshot MUST NOT include interactive prompts or block execution.

**Tags:** `context-display`, `format`

#### Scenarios

**Deterministic output** (`rq-ctxformat.1`)

**Given:**
- A change with known state (fixed tasks, gates, workdir)

**When:** A context snapshot is rendered twice with the same input

**Then:**
- Both outputs are identical

**Non-blocking display** (`rq-ctxformat.2`)

**Given:**
- A context snapshot is being rendered

**When:** The formatter is called

**Then:**
- No interactive prompts are displayed
- Execution is not blocked waiting for user input

---

### Context Display Graceful Degradation

**ID:** `rq-ctxfallback` | **Priority:** **[MUST]**

The context snapshot formatter MUST gracefully handle missing or partial data: absent gate info, empty task lists, missing proposal, unavailable workdir. Partial snapshots are emitted with placeholder values rather than errors.

**Tags:** `context-display`, `error-handling`

#### Scenarios

**Missing gates handled gracefully** (`rq-ctxfallback.1`)

**Given:**
- A change with no gate data

**When:** A context snapshot is rendered

**Then:**
- Gate progress shows all gates as unknown/pending
- No error is thrown

**Empty task list handled gracefully** (`rq-ctxfallback.2`)

**Given:**
- A change with zero tasks

**When:** A context snapshot is rendered

**Then:**
- Task counts show 0 for all statuses
- No error is thrown

---
