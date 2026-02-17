# ADV - Spec-Driven Development Instructions

ADV (Advance) enables spec-driven development where **specs become laws**. Requirements are formally defined, validated, and enforced during implementation.

## Core Concept

1. **Specs define the law**: Requirements in specs are authoritative
2. **Changes are proposals**: All modifications go through a change workflow
3. **Validation enforces laws**: Changes are validated against existing specs
4. **TDD drives implementation**: Test-first development with evidence
5. **Archive promotes changes**: Completed changes update specs permanently

## Commands

### Core Workflow

| Command | Purpose |
|---------|---------|
| `/adv-status` | Project overview (specs, changes, recommendations) |
| `/adv-proposal <summary>` | Create new change proposal |
| `/adv-validate <change-id>` | Validate change against specs |
| `/adv-apply <change-id>` | Implement change with TDD |
| `/adv-archive <change-id>` | Archive completed change |

### Pre-Implementation

| Command | Purpose |
|---------|---------|
| `/adv-clarify` | Socratic clarifying questions |
| `/adv-prep <change-id>` | Gap analysis - add missing scenarios, tasks |
| `/adv-research <target>` | Validate architectural decisions via Context7 |

### Post-Implementation

| Command | Purpose |
|---------|---------|
| `/adv-review <change-id>` | Code review (correctness, security, architecture) |
| `/adv-harden <change-id>` | AI-slop detection, test coverage, doc hygiene, cleanup |
| `/adv-audit [capability]` | Spec/implementation drift detection |

### Advanced

| Command | Purpose |
|---------|---------|
| `/adv-ralph <change-id>` | Autonomous implementation with retry |
| `/adv-refactor <change-id>` | Refresh stale proposals |
| `/adv-coordinate` | Multi-change conflict detection |
| `/adv-roadmap` | Progress dashboard |

## Status Markers

Emit at START of each response:

| Marker | When |
|--------|------|
| `[ADV:ROCKET]` | Active work |
| `[ADV:TDD_RED]` | Writing tests (red phase) |
| `[ADV:TDD_GREEN]` | Implementing (green phase) |
| `[ADV:MOON]` | Waiting for sub-agents |
| `[ADV:EARTH]` | Complete / awaiting input |
| `[ADV:DOOM_LOOP]` | Stuck in retry cycle |
| `[ADV:MIC]` | Needs user approval |
| `[ADV:TASK_STATUS_REPORT]` | Emitting task report |

System-emitted: `[ADV:ACCUMULATED_WISDOM]`, `[ADV:TODO_CONTINUATION]`, `[ADV:RECORD_WISDOM]`

## Critical Protocols

### Context Freshness

**Work one task at a time with fresh context.** Before EACH task:
1. Re-read change via `adv_change_show`
2. Look up the specific task via `adv_task_show` (returns full task + parent changeId)
3. Review relevant proposal sections

**TodoWrite Rules:** Use task IDs only (`tk-abc123`), not descriptions. Forces context lookup via `adv_task_show`.

### TDD Protocol (RSTC)

**RED Phase:** Write failing test → run → emit `[ADV:TDD_RED]` → show output
**GREEN Phase:** Implement → run → emit `[ADV:TDD_GREEN]` → show output
**Trivial Tasks:** Note `(trivial: docs change)` and skip TDD

### Doom Loop Detection

After 3 failed attempts on a task:

1. **STOP** - Don't retry same approach
2. **Emit** `[ADV:DOOM_LOOP]` marker
3. **Document** all 3 attempts with diagnosis
4. **Ask** via `question` tool for guidance

**No Skip/Defer:** Tasks must complete or doom loop. Prohibited:
- Skipping "to revisit later"
- Deferring "until more information"
- Marking blocked without 3 genuine attempts

### Task Status Report

On loop stop or compaction: emit `[ADV:TASK_STATUS_REPORT]` with completed/cancelled/remaining tasks.
See: [docs/adv-task-report.md](docs/adv-task-report.md)

## 6-Gate Quality Checklist

| Gate | Triggered By |
|------|--------------|
| 1. `research` | `/adv-research` or Context7 |
| 2. `prep` | `/adv-prep` |
| 3. `implementation` | All tasks done |
| 4. `review` | `/adv-review` |
| 5. `harden` | `/adv-harden` |
| 6. `signoff` | User confirmation |

Gates are sequential. Archive blocks until all 6 satisfied.
See: [docs/adv-gates.md](docs/adv-gates.md)

## Sub-Agent Selection

When spawning sub-agents via the Task tool, select based on the task type:

| Agent | Use For | Tools |
|-------|---------|-------|
| `librarian` | Documentation, API references, code examples | Context7, grep.app, Kagi |
| `adv-researcher` | Architectural validation, simplicity analysis | Context7, Kagi, ADV read-only |
| `explore` | Codebase navigation, find usages | Read, Glob, Grep |
| `general` | Complex multi-step implementation | Full tool access |

### When to Use Each Agent

**librarian** - Documentation and examples:
- "How do I use X in library Y?"
- "Show examples of pattern Z"
- "What are the params for function F?"

**adv-researcher** - Architectural decisions:
- "Does this follow best practices?"
- "Could this be simpler?"
- "Compare existing vs reference architecture"

**explore** - Codebase questions:
- "Where is feature X implemented?"
- "Find all usages of function Y"

**general** - Implementation tasks:
- Complex multi-step work requiring TDD
- Code modifications across multiple files

### Orchestrator Pattern

For research tasks requiring both documentation and architectural validation, spawn agents in parallel:

```
Task(subagent_type: "librarian", prompt: "Find docs for {tech}")
Task(subagent_type: "adv-researcher", prompt: "Validate architecture")
```

Then synthesize results. See `/adv-research` command for implementation.

## Worktree Integration

ADV uses **external mutable state** so that all worktrees of the same repo share changes, archive, wisdom, agenda, and the SQLite cache. Specs remain in-repo (`.adv/specs/`).

### External State Layout

Mutable state lives at `$XDG_DATA_HOME/opencode/plugins/advance/{project-id}/`:

```
{project-id}/
├── changes/          # Active change proposals
├── archive/          # Completed changes
├── db/spec.db        # SQLite FTS cache
├── wisdom.jsonl      # Project-level learnings
├── agenda.jsonl      # Work queue
└── handoff.json      # Session handoff (temporary)
```

**project-id** = root commit SHA (`git rev-list --max-parents=0 HEAD`), stable across all worktrees.

### Session Handoff Protocol

When a worktree is created during an active ADV change:

1. **Parent session** writes `handoff.json` with `{changeId, currentTaskId, gateStatus, objective}`
2. **New session** reads and clears `handoff.json` on startup, hydrating `PluginState.activeChange`
3. **system.transform** injects `[ADV:WORKTREE_SESSION]` marker with full change context

This means the new session starts with change context loaded — no manual re-loading needed.

### When Worktrees Are Used

Phase 0 of `/adv-apply` and `/adv-ralph` handles worktree assessment automatically:

| Command | Threshold | Default |
|---------|-----------|---------|
| `/adv-apply` | 5+ files or high-risk signals | Skip worktree |
| `/adv-ralph` | 3+ files (lower threshold for autonomous work) | Suggest worktree |

Both commands follow a deterministic 4-step sequence:
1. **Assess risk** — count affected files, evaluate risk signals
2. **Check tool availability** — verify `worktree_create` is available, skip with `[ADV:INFO]` if not
3. **Ask user** — present choice via `question` tool
4. **Write handoff & create** — persist state, create worktree, stop parent session

### Graceful Degradation

If `worktree_create`/`worktree_delete` tools are not installed, commands skip Phase 0 with:
```
[ADV:INFO] Worktree tools not available — proceeding with in-place implementation.
```
All other ADV functionality works identically.

## When to Use ADV

**Use for:** New features, breaking changes, architecture, compliance
**Skip for:** Bug fixes, typos, deps, exploration

## Reference

- [Workflow Diagram](docs/adv-workflow.md)
- [6-Gate Details](docs/adv-gates.md)
- [Task Report Format](docs/adv-task-report.md)
- [Question Tool Schema](docs/adv-question-tool.md)
- Agent config: `.opencode/agents/adv-researcher.md`
