<p align="center">
  <strong>Context Engineering for AI Agents</strong>
</p>

<p align="center">
  <em>Specs become laws. Context survives context switches.</em>
</p>

<p align="center">
  <a href="https://github.com/Sharper-Flow/Advance/actions/workflows/ci.yml"><img src="https://github.com/Sharper-Flow/Advance/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License"></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.0+-3178c6?logo=typescript&logoColor=white" alt="TypeScript"></a>
</p>

ADV (Advance) is an OpenCode plugin that solves the **context loss problem** for AI coding agents. When your agent switches tasks, starts a new session, or creates a worktree inline — ADV ensures the context survives.

## The Problem ADV Solves

AI agents lose context constantly:
- Session resets erase progress
- Task switches scatter attention  
- Worktree isolation breaks continuity
- Accumulated learnings vanish

**ADV provides structured context engineering** — specs, tasks, wisdom, and progress persist across all session boundaries.

## Context Engineering Features

| Feature | What It Does |
|---------|--------------|
| **Accumulated Wisdom** | Learnings (patterns, gotchas, conventions) persist across changes and sessions |
| **Inline Worktree Flow** | Create worktrees mid-change and continue in the same session via `workdir` |
| **External State** | All worktrees share the same changes, archive, wisdom, and agenda |
| **Status Markers** | `[ADV:ROCKET]`, `[ADV:TDD_RED]`, etc. — progress visible at glance |
| **Task Reports** | Structured handoff format for context switches and compactions |
| **6-Gate Quality** | Research → Prep → Implementation → Review → Harden → Signoff |
| **TDD Evidence** | Red/Green phase output captured for audit trail |

## Why ADV?

| Challenge | ADV's Solution |
|-----------|----------------|
| **Requirements drift** | Specs are the single source of truth |
| **Incomplete implementations** | Validation gates block malformed changes |
| **No audit trail** | Every change is archived with full history |
| **Ad-hoc testing** | TDD workflow with Red/Green phase evidence |
| **Context loss** | Wisdom, tasks, and progress persist across sessions |
| **Worktree isolation** | External state shared across all worktrees |

## Quick Start

```bash
# Clone the repository
git clone https://github.com/Sharper-Flow/Advance.git
cd Advance/plugin

# Install dependencies
bun install

# Run tests
bun test
```

See [INSTALL.md](INSTALL.md) for detailed setup instructions.

## Workflow

```
/adv-proposal "Add user authentication"
       │
       ▼
┌─────────────────────────────────┐
│  DRAFT                          │
│  Define requirements & tasks    │
└──────────────┬──────────────────┘
               │
               ▼
/adv-validate {change-id}
       │
       ▼
┌─────────────────────────────────┐
│  ACTIVE                         │
│  Validation passed              │
└──────────────┬──────────────────┘
               │
               ▼
/adv-apply {change-id}
       │
       ▼
┌─────────────────────────────────┐
│  TDD LOOP                       │
│  [TDD_RED]   Write failing test │
│  [TDD_GREEN] Implement to pass  │
│  Repeat until all tasks done    │
└──────────────┬──────────────────┘
               │
               ▼
/adv-archive {change-id}
       │
       ▼
┌─────────────────────────────────┐
│  ARCHIVED                       │
│  Specs updated, docs generated  │
└─────────────────────────────────┘
```

## Commands

### Core Workflow

| Command | Description |
|---------|-------------|
| `/adv-status` | Show project overview: specs, active changes, and next-step recommendations |
| `/adv-proposal <summary>` | Propose a new change with intent, scope, and success criteria |
| `/adv-validate <id>` | Validate change compliance against specs; block archive on failure |
| `/adv-apply <id>` | Implement change with TDD, retry on failure, and final verification |
| `/adv-archive <id>` | Archive completed change: apply spec deltas and finalize git |

### Pre-Implementation

| Command | Description |
|---------|-------------|
| `/adv-clarify` | Ask clarifying questions to resolve ambiguous requirements |
| `/adv-prep <id>` | Analyze gaps and add missing scenarios, tasks, and dependencies |
| `/adv-research <target>` | Validate architectural decisions via docs and web search; complete research gate |

### Post-Implementation

| Command | Description |
|---------|-------------|
| `/adv-review <id>` | Review code for correctness, security, and architecture; emit REVIEW_FINDINGS |
| `/adv-harden <id>` | Detect low-quality code, verify test coverage, clean up; block archive on open findings |
| `/adv-audit [capability]` | Detect drift between specs and current implementation |
| `/adv-slop-scan [path]` | Scan for low-quality AI-generated code patterns and surface findings |

### Fast-Track

| Command | Description |
|---------|-------------|
| `/adv-task` | Fast-track a discussed change: synthesize contract, validate best practices, prep, and hand off |

`/adv-task` now persists Quick Contract context through `adv_change_create` so `proposal.md` is written via tool call, not direct filesystem edits.

### Advanced

| Command | Description |
|---------|-------------|
| `/adv-refactor <id>` | Refresh a stale proposal to reflect current codebase state |
| `/adv-coordinate` | Detect and resolve conflicts across multiple active changes |
| `/adv-improve` | Suggest targeted improvements to existing specs or implementation |

## MCP Tools

ADV exposes 37 MCP tools for programmatic access:

### Spec Tools
| Tool | Description |
|------|-------------|
| `adv_spec_list` | List capabilities with optional filtering |
| `adv_spec_show` | Get full spec details |
| `adv_spec_search` | Search requirements by keyword (FTS5) |

### Change Tools
| Tool | Description |
|------|-------------|
| `adv_change_list` | List changes by status |
| `adv_change_show` | Get change details with tasks and deltas |
| `adv_change_create` | Create new change scaffold (optionally persist `proposal.md` content via `proposal`) |
| `adv_change_validate` | Validate change against specs |
| `adv_change_archive` | Archive change and update specs |

### Task Tools
| Tool | Description |
|------|-------------|
| `adv_task_list` | List tasks in a change |
| `adv_task_ready` | Get tasks ready to start (unblocked) |
| `adv_task_show` | Get full details of a single task by ID |
| `adv_task_update` | Update task status |
| `adv_task_add` | Add task to change |
| `adv_task_evidence` | Record TDD red/green phase evidence |
| `adv_task_tdd_phase` | Manually set TDD phase |
| `adv_task_skip_tdd` | Skip TDD with documented reason |
| `adv_task_tdd_status` | Get TDD compliance status |

### Wisdom Tools
| Tool | Description |
|------|-------------|
| `adv_wisdom_add` | Record learning (pattern, gotcha, convention, etc.) |
| `adv_wisdom_list` | List wisdom entries for a change |
| `adv_wisdom_promote` | Promote change-level wisdom to project-level |

### Agenda Tools
| Tool | Description |
|------|-------------|
| `adv_agenda_list` | List agenda items by status |
| `adv_agenda_add` | Add quick work item to agenda |
| `adv_agenda_start` | Start working on an item |
| `adv_agenda_complete` | Mark item complete |
| `adv_agenda_cancel` | Cancel an item |
| `adv_agenda_prioritize` | Change item priority |
| `adv_agenda_next` | Get highest priority unblocked item |
| `adv_agenda_stats` | Get agenda statistics |
| `adv_agenda_evidence` | Record TDD evidence for agenda item |
| `adv_agenda_compact` | Compact agenda file |

### Gate Tools
| Tool | Description |
|------|-------------|
| `adv_gate_status` | Get gate completion status |
| `adv_gate_complete` | Mark a gate as complete |

### Status
| Tool | Description |
|------|-------------|
| `adv_status` | Get project overview |
| `adv_project_context` | Get project.md content (tech stack, conventions) |

## Delta Operations

Changes modify specs through typed deltas. Four operations are supported:

| Operation | Purpose | Version Bump |
|-----------|---------|-------------|
| `add` | Add new requirement | Minor (1.x.0) |
| `modify` | Update fields on existing requirement | Patch (1.0.x) |
| `remove` | Remove a requirement | Patch (1.0.x) |
| `rename` | Rename title and/or ID of a requirement | Patch (1.0.x) |

Deltas are applied in canonical order: **rename > remove > modify > add**.

## Accumulated Wisdom

ADV captures learnings during implementation that persist across sessions:

| Type | Purpose |
|------|---------|
| `pattern` | Reusable solution patterns |
| `gotcha` | Non-obvious pitfalls discovered |
| `convention` | Project-specific conventions |
| `success` | What worked well |
| `failure` | What didn't work |

Wisdom is accumulated at the **change level** and can be **promoted** to project-level for cross-change reuse. The `[ADV:ACCUMULATED_WISDOM]` marker injects relevant learnings at session start.

### Examples

```json
{
  "deltas": {
    "auth-system": [
      {
        "id": "dl-add001",
        "operation": "add",
        "requirement": {
          "id": "rq-mfa001",
          "title": "Multi-Factor Authentication",
          "body": "The system MUST support MFA.",
          "priority": "must",
          "scenarios": [{ "id": "rq-mfa001.1", "title": "...", "given": ["..."], "when": "...", "then": ["..."] }]
        }
      },
      {
        "id": "dl-mod001",
        "operation": "modify",
        "target_id": "rq-auth001",
        "changes": { "priority": "must", "tags": ["security", "critical"] }
      },
      {
        "id": "dl-ren001",
        "operation": "rename",
        "target_id": "rq-login01",
        "new_title": "User Authentication Flow",
        "new_id": "rq-authflow"
      },
      {
        "id": "dl-rem001",
        "operation": "remove",
        "target_id": "rq-legacy01",
        "reason": "Superseded by rq-authflow"
      }
    ]
  }
}
```

### Typed Modify

The `changes` field in modify deltas is type-checked against the Requirement schema. Only known fields (`title`, `body`, `priority`, `tags`, `scenarios`) are accepted; unknown keys are rejected at parse time.

### Validation

Intra-delta conflicts are detected automatically:
- Rename + remove targeting the same requirement
- Multiple renames on the same requirement
- Rename `new_id` colliding with an add delta's requirement ID

## Status Markers

ADV emits structured markers for real-time progress visibility. Each marker also updates the
terminal tab title via OSC escape sequences.

| Marker | Meaning | Tab emoji |
|--------|---------|-----------|
| `[ADV:ROCKET]` | Active work in progress | 🚀 |
| `[ADV:TDD_RED]` | Red phase - writing failing test | 🔴 |
| `[ADV:TDD_GREEN]` | Green phase - implementing to pass | 🟢 |
| `[ADV:MOON]` | Sub-agents running | 📡 |
| `[ADV:EARTH]` | Complete or awaiting input | 🌍 |
| `[ADV:DOOM_LOOP]` | Stuck after 3+ retries | 💀 |
| `[ADV:MIC]` | Needs user approval | 🎤 |
| `[ADV:WORKTREE_SESSION]` | Running in worktree with hydrated context | — |

### Terminal Tab Title Format

The tab title is updated on every status change:

| Condition | Title |
|-----------|-------|
| Active change | `<emoji> <normalized change code>` |
| No active change | `<emoji>` (bare emoji only) |

**Change ID normalization** — camelCase, kebab-case, and snake_case IDs are split into
Title Case words. Common verb prefixes (`add`, `fix`, `update`, `improve`, `create`,
`remove`, `refactor`, `change`) are stripped:

```
addFeatureX           →  🚀 Feature X
fixAuthTimeout        →  🚀 Auth Timeout
improve-terminal-tab  →  🚀 Terminal Tab
fix_auth_timeout      →  🚀 Auth Timeout
terminalTabTitle      →  🚀 Terminal Tab Title
```

Progress counters (`[2/7]`) are not shown in the title.

System-emitted markers:
| Marker | When |
|--------|------|
| `[ADV:ACCUMULATED_WISDOM]` | Session start, injects relevant learnings |
| `[ADV:TODO_CONTINUATION]` | Resuming from context switch |
| `[ADV:TASK_STATUS_REPORT]` | Structured progress handoff |

## Project Structure

```
project/
├── project.json          # ADV configuration
├── .adv/                 # ADV internals (in-repo)
│   ├── specs/            # The Laws (capability specifications)
│   │   └── {capability}/
│   │       └── spec.json
│   └── (legacy paths migrated on first run)
│
└── ~/.local/share/opencode/plugins/advance/{project-id}/  # External state
    ├── changes/          # Active change proposals (shared across worktrees)
    ├── archive/          # Completed changes
    ├── db/spec.db        # SQLite FTS cache
    ├── wisdom.jsonl      # Project-level learnings
    ├── agenda.jsonl      # Work queue
    └── handoff.json      # Session handoff (fallback, multi-session only)
```

**project-id** = root commit SHA, stable across all worktrees of the same repo.

## Worktree Integration

ADV automatically detects worktree contexts and:

1. **Shares mutable state** — Changes, wisdom, and agenda available in all worktrees
2. **Inline protocol (default)** — Create worktree, switch `workdir`, continue in same session
3. **Handoff protocol (fallback)** — Use `handoff.json` only for explicit multi-session workflows
4. **Graceful degradation** — Works identically without worktree tools installed

Phase 0 of `/adv-apply` assesses risk and suggests worktree isolation when appropriate (threshold: 3+ files or high-risk signals).

> **Note:** `/adv-archive` runs mandatory **Phase 9 Git Finalization** automatically — it stages and commits all changes, merges the worktree branch to the default branch, verifies the merge is clean, and deletes the worktree. No manual git steps required after archive.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      AI Agent (OpenCode)                    │
└───────────────────────────┬─────────────────────────────────┘
                            │ MCP Tool Calls
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                       ADV Plugin                            │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                   37 MCP Tools                      │    │
│  │   Spec: list, show, search                          │    │
│  │   Change: list, show, create, validate, archive     │    │
│  │   Task: list, show, ready, update, add, evidence    │    │
│  │   Wisdom: add, list, promote                        │    │
│  │   Agenda: list, add, start, complete, next, stats   │    │
│  │   Gate: status, complete                            │    │
│  │   Status, Project Context                            │    │
│  └──────────────────────┬──────────────────────────────┘    │
│                         │                                   │
│  ┌──────────────────────▼──────────────────────────────┐    │
│  │              Validation Engine                      │    │
│  │   ID checks, conflicts, completeness, references   │    │
│  └──────────────────────┬──────────────────────────────┘    │
│                         │                                   │
│  ┌──────────────────────▼──────────────────────────────┐    │
│  │                 Storage Layer                       │    │
│  │   In-repo: specs/ (immutable)                       │    │
│  │   External: changes/, archive/, db/, wisdom/, agenda│    │
│  │   (shared across worktrees via project-id)          │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## Development

```bash
cd plugin

bun install       # Install dependencies
bun test          # Run 570 tests
bun run typecheck # Typecheck
bun run lint      # Lint
```

### Test Coverage

- 570 tests across 25 test files
- Storage layer (JSON, SQLite, Store, Migration, Handoff)
- All 37 MCP tools
- Validation engine with error paths
- Archive operations
- Worktree integration and cross-session state
- Events and status detection

## Documentation

- [INSTALL.md](INSTALL.md) — Installation and setup
- [ADV_INSTRUCTIONS.md](ADV_INSTRUCTIONS.md) — Agent instructions
- [CHANGELOG.md](CHANGELOG.md) — Version history
- [COMMAND_REPORT.html](COMMAND_REPORT.html) — Detailed command documentation

## Related Projects

- [Goost](https://github.com/anomalyco/goost) — Contract-based task persistence (complementary)
- [OpenCode](https://github.com/anomalyco/opencode) — AI coding CLI

## License

MIT

---

<p align="center">
  <strong>Built with TypeScript. Specs become laws. Context survives context switches.</strong>
</p>
