# Chat Output Display

> **Version:** 1.3.0
> **Updated:** 2026-04-28
> **Supersedes:** `context-display` v1.2.0

## Purpose

Unified formatting for the chat-output surface — context snapshots (full box), context tickers (compact 1-line for transient transitions), cross-repo switch indicators, and status markers. Consolidates the previous `context-display` and `task-status-report` rules under one capability so all surfaces share a glyph vocabulary and emission policy. Closes the context-agreement gap between agent state and user visibility.

## Requirements

### Context Snapshot Content

**ID:** `rq-ctxsnap1` | **Priority:** **[MUST]**

The Context Snapshot (full box) MUST display: change ID and title, success criteria count, gate progress (inline visual), task counts by status, and current workdir. The snapshot MUST fit within 10 lines for quick scanning.

**Tags:** `chat-output-display`, `snapshot`

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

The Context Snapshot (full box) MUST be emitted by tools that represent major state transitions: `adv_change_create`, `adv_gate_complete`, `adv_change_reenter`, `adv_status` (primary change only — see `rq-ctxticker2.4`), and on session resume with an active change. `adv_change_show` provides structured JSON for direct LLM consumption and does NOT emit a snapshot. Transient task-state tools emit a Context Ticker instead — see `rq-ctxticker2`.

**Tags:** `chat-output-display`, `snapshot`, `triggers`

#### Scenarios

**Snapshot emitted on change creation** (`rq-ctxsnap2.1`)

**Given:**
- An agent creates a new change via `adv_change_create`

**When:** The change data is created

**Then:**
- A context snapshot (full box) is included in the tool output

**Snapshot emitted on gate transition** (`rq-ctxsnap2.2`)

**Given:**
- A gate is marked complete via `adv_gate_complete`

**When:** The gate status changes

**Then:**
- The updated gate progress is visible in subsequent tool output as a full-box snapshot

**Snapshot emitted on gate re-entry** (`rq-ctxsnap2.6`)

**Given:**
- A change with completed gates

**When:** `adv_change_reenter` reopens gates from a specified point

**Then:**
- The tool output includes an updated `_contextSnapshot` (full box)
- The snapshot gate progress shows the reset gate state

---

### Context Ticker Content

**ID:** `rq-ctxticker1` | **Priority:** **[MUST]**

The Context Ticker MUST be a single-line, ≤80-column compact summary with three segments separated by middle dots: change ID (truncated to ≤20 characters with `…` suffix on overflow), gate arrow (`{prev} ✓→{next}`, `release ✓` if all gates done, or `proposal ○→discovery` if none done), and task progress in `{done}/{total}` form. The ticker uses box-drawing rails (`║ … ║`) to share visual vocabulary with the full snapshot and remain deterministic.

**Tags:** `chat-output-display`, `ticker`

#### Scenarios

**Ticker is a single line** (`rq-ctxticker1.1`)

**Given:**
- An active change with at least one task and gates partially complete

**When:** The context ticker is rendered

**Then:**
- The output contains exactly one line
- The output is no more than 80 columns wide
- The output contains the box-drawing rail character `║`

**Ticker truncates long change IDs** (`rq-ctxticker1.2`)

**Given:**
- A change ID longer than 20 characters

**When:** The context ticker is rendered

**Then:**
- The change ID segment is truncated to at most 20 characters
- The truncated segment ends with the ellipsis character `…`

**Ticker shows compact gate arrow** (`rq-ctxticker1.3`)

**Given:**
- A change with proposal/discovery/design done and planning pending

**When:** The context ticker is rendered

**Then:**
- The output contains the gate arrow `design ✓→planning`
- The output does not contain the full gate-progress glyph list

---

### Context Ticker Emission Triggers

**ID:** `rq-ctxticker2` | **Priority:** **[MUST]**

The Context Ticker MUST be emitted (instead of the full snapshot) by transient task-state tools: `adv_task_update` transitioning to `in_progress` or `done`, `adv_task_ready`, `adv_task_add`, and `adv_task_cancel`. Other emission sites (`adv_change_create`, `adv_gate_complete`, `adv_change_reenter`, `adv_status`) MUST continue to emit the full snapshot per `rq-ctxsnap2`.

**Tags:** `chat-output-display`, `ticker`, `triggers`

#### Scenarios

**Ticker emitted by adv_task_update** (`rq-ctxticker2.1`)

**Given:**
- An active change with a pending task

**When:** `adv_task_update` transitions the task to `in_progress` or `done`

**Then:**
- The tool output includes a single-line context ticker as `_contextSnapshot`
- The output is not a multi-line full-box snapshot

**Ticker emitted by adv_task_ready** (`rq-ctxticker2.2`)

**Given:**
- An active change

**When:** `adv_task_ready` is invoked

**Then:**
- The tool output includes a single-line context ticker as `_contextSnapshot`

**Ticker emitted by adv_task_add and adv_task_cancel** (`rq-ctxticker2.3`)

**Given:**
- An active change

**When:** `adv_task_add` successfully creates a task or `adv_task_cancel` cancels one or more tasks

**Then:**
- The tool output includes a single-line context ticker as `_contextSnapshot`

**Full-box snapshot still emitted by gate / change tools** (`rq-ctxticker2.4`)

**Given:**
- An active change

**When:** `adv_change_create`, `adv_gate_complete`, or `adv_change_reenter` is invoked

**Then:**
- The tool output includes a multi-line context snapshot (full box) as `_contextSnapshot`

**adv_status emits full-box for primary change, ticker for non-primary** (`rq-ctxticker2.5`)

**Given:**
- `adv_status` with multiple active/draft/pending changes in `recentChanges`

**When:** `adv_status` is invoked

**Then:**
- The first active/draft/pending change (primary) includes a multi-line full-box `_contextSnapshot`
- Subsequent changes (non-primary) include a single-line context ticker as `_contextSnapshot`

---

### IDLE / ATTN Status Marker Split

**ID:** `rq-idleMarker01` | **Priority:** **[MUST]**

The status resolver MUST distinguish two distinct user-visible states: ATTN (user must act — permission pending, approval, or question) and IDLE (agent finished, no user action needed — session start or completed work). `resolveStatus` MUST return ATTN only when `permissionPending` is set, and IDLE when the session is idle without sub-agents or long tools. The initial status state MUST be IDLE so a fresh session is not falsely flagged as needing user attention.

**Tags:** `chat-output-display`, `status-marker`

#### Scenarios

**sessionIdle resolves to IDLE** (`rq-idleMarker01.1`)

**Given:**
- Plugin state where `sessionIdle` is true and `permissionPending` is false and no sub-agents are active

**When:** `resolveStatus` is called

**Then:**
- The returned marker is `IDLE`

**permissionPending resolves to ATTN** (`rq-idleMarker01.2`)

**Given:**
- Plugin state where `permissionPending` is true

**When:** `resolveStatus` is called

**Then:**
- The returned marker is `ATTN` regardless of other flags

**Initial state is IDLE** (`rq-idleMarker01.3`)

**Given:**
- A freshly initialised plugin status state

**When:** `getStatus` is called before any transitions

**Then:**
- `currentStatus` is `IDLE`

---

### IDLE Marker Constant

**ID:** `rq-idleMarker02` | **Priority:** **[MUST]**

The `STATUS_MARKERS` enum MUST contain an `IDLE` entry mapping to the textual marker `[ADV:IDLE]`. The IDLE emoji MUST be the white square (⬜) — visually distinct from ATTN's red square (🟥) and color-blind safe paired with the textual marker.

**Tags:** `chat-output-display`, `status-marker`, `enum`

#### Scenarios

**STATUS_MARKERS contains IDLE** (`rq-idleMarker02.1`)

**Given:**
- The `STATUS_MARKERS` constant is loaded

**When:** The `IDLE` key is read

**Then:**
- The value is the literal string `[ADV:IDLE]`

**IDLE emoji is distinct from ATTN** (`rq-idleMarker02.2`)

**Given:**
- The terminal status emoji map

**When:** `getStatusEmoji` is called for `IDLE` and `ATTN`

**Then:**
- `IDLE` returns `⬜`
- `ATTN` returns `🟥`
- The two values are not equal

---

### IDLE Bell Policy

**ID:** `rq-idleMarker03` | **Priority:** **[MUST]**

The terminal bell MUST ring on transitions from active work into the IDLE marker (`WORK→IDLE` and `TOOLING→IDLE`) using the same debounce/armed state machine as ATTN. The bell MUST NOT ring on `IDLE→IDLE` (no transition), on `BLOCKED→IDLE` (recovery without user action), or on lateral `IDLE↔ATTN` transitions (already user-visible state).

**Tags:** `chat-output-display`, `status-marker`, `bell`

#### Scenarios

**WORK → IDLE rings** (`rq-idleMarker03.1`)

**Given:**
- Previous status is `WORK`

**When:** Status transitions to `IDLE`

**Then:**
- The bell rings (immediately when not armed, debounced when armed)

**BLOCKED → IDLE does not ring** (`rq-idleMarker03.2`)

**Given:**
- Previous status is `BLOCKED`

**When:** Status transitions to `IDLE`

**Then:**
- The bell does not ring
- Any pending bell timer is cancelled

**IDLE ↔ ATTN does not double-ring** (`rq-idleMarker03.3`)

**Given:**
- Status has already transitioned into `IDLE` or `ATTN` and rung the bell

**When:** Status moves laterally between `IDLE` and `ATTN`

**Then:**
- The bell does not ring again for the lateral transition

---

### Cross-Repo Switch Indicator

**ID:** `rq-ctxswitch` | **Priority:** **[MUST]**

When the agent switches workdir to a different repository during a change, a formatted indicator MUST be emitted showing the from/to paths and the task that triggered the switch. The indicator MUST be ≤3 content lines (excluding box borders) so it stays compact when emitted alongside other context surfaces.

**Tags:** `chat-output-display`, `cross-repo`

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

**Switch indicator is at most 3 content lines** (`rq-ctxswitch.2`)

**Given:**
- A cross-repo switch with typical from-path, to-path, and task title

**When:** `formatCrossRepoSwitch` renders the indicator

**Then:**
- The rendered output has no more than 3 content lines (excluding `╔` and `╚` box borders)

---

### Context Display Format Constraints

**ID:** `rq-ctxformat` | **Priority:** **[MUST]**

All context display formatting (snapshot, ticker, cross-repo switch) MUST use box-drawing characters consistent with existing ADV patterns (`banner.ts`). The format MUST be deterministic — identical state produces identical output. The compact ticker and the cross-repo switch indicator MUST stay within 80 columns; long content (change IDs, paths, task titles) is truncated rather than wrapped. The full Context Snapshot prioritises gate-progress visibility (`rq-ctxsnap1`) over the 80-column budget — its box grows naturally to fit the inline gate row, and only the `CONTEXT` line truncates the change ID to keep the overall budget bounded. The output MUST NOT include interactive prompts or block execution.

**Tags:** `chat-output-display`, `format`

#### Scenarios

**Deterministic output** (`rq-ctxformat.1`)

**Given:**
- A change with known state (fixed tasks, gates, workdir)

**When:** A context snapshot or ticker is rendered twice with the same input

**Then:**
- Both outputs are identical

**Non-blocking display** (`rq-ctxformat.2`)

**Given:**
- A context snapshot or ticker is being rendered

**When:** The formatter is called

**Then:**
- No interactive prompts are displayed
- Execution is not blocked waiting for user input

**Compact surfaces never exceed 80 columns** (`rq-ctxformat.3`)

**Given:**
- A long change ID and a long combined cross-repo `from → to` path

**When:** The compact ticker or cross-repo switch indicator is rendered

**Then:**
- Each emitted line is ≤80 columns wide
- The full snapshot box is exempt — its width is driven by the gate-progress row (`rq-ctxsnap1`) and may exceed 80 cols when all 7 gates are displayed

**Snapshot CONTEXT line truncates long change IDs** (`rq-ctxformat.4`)

**Given:**
- A change ID longer than the available width on the CONTEXT line

**When:** `formatContextSnapshot` renders the box

**Then:**
- The CONTEXT line displays the change ID truncated with an ellipsis suffix
- The CONTEXT line itself stays within the snapshot's bounded width

---

### Context Display Graceful Degradation

**ID:** `rq-ctxfallback` | **Priority:** **[MUST]**

The context snapshot and ticker formatters MUST gracefully handle missing or partial data: absent gate info, empty task lists, missing proposal, unavailable workdir. Partial outputs are emitted with placeholder values rather than errors.

**Tags:** `chat-output-display`, `error-handling`

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

**When:** A context snapshot or ticker is rendered

**Then:**
- Task counts show 0 for all statuses
- No error is thrown

---
