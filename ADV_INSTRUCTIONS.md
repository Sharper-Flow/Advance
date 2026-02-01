# ADV - Spec-Driven Development Instructions

ADV (Advance) enables spec-driven development where **specs become laws**. Requirements are formally defined, validated, and enforced during implementation.

## Core Concept

1. **Specs define the law**: Requirements in specs are authoritative
2. **Changes are proposals**: All modifications go through a change workflow
3. **Validation enforces laws**: Changes are validated against existing specs
4. **TDD drives implementation**: Test-first development with evidence
5. **Archive promotes changes**: Completed changes update specs permanently

## Workflow Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     ADV WORKFLOW                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  /adv-proposal "summary"                                    │
│       │                                                     │
│       ▼                                                     │
│  ┌─────────┐                                                │
│  │  DRAFT  │ ──────────────────────────────────────────┐    │
│  └────┬────┘                                           │    │
│       │ define requirements                            │    │
│       ▼                                                │    │
│  /adv-validate {change-id}                             │    │
│       │                                                │    │
│       ▼                                                │    │
│  ┌─────────┐    errors?    ┌──────────┐               │    │
│  │ ACTIVE  │ ────────────► │  FIX IT  │ ──────────────┘    │
│  └────┬────┘               └──────────┘                     │
│       │ validation passed                                   │
│       ▼                                                     │
│  /adv-apply {change-id}                                     │
│       │                                                     │
│       ▼                                                     │
│  ┌─────────────────────────────────────┐                    │
│  │  TDD LOOP                           │                    │
│  │  ┌─────────────────────────────┐    │                    │
│  │  │ 1. Get ready task           │    │                    │
│  │  │ 2. [TDD_RED] Write test     │    │                    │
│  │  │ 3. [TDD_GREEN] Implement    │    │                    │
│  │  │ 4. Mark task done           │    │                    │
│  │  │ 5. Repeat until all done    │    │                    │
│  │  └─────────────────────────────┘    │                    │
│  └────────────────┬────────────────────┘                    │
│                   │ all tasks complete                      │
│                   ▼                                         │
│  /adv-archive {change-id}                                   │
│       │                                                     │
│       ▼                                                     │
│  ┌──────────┐                                               │
│  │ ARCHIVED │ ◄─── Specs updated, docs generated            │
│  └──────────┘                                               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Available Commands

### Core Workflow

| Command | Purpose |
|---------|---------|
| `/adv-status` | Show project overview (specs, changes, recommendations) |
| `/adv-proposal <summary>` | Create a new change proposal |
| `/adv-validate <change-id>` | Validate change against specs |
| `/adv-apply <change-id>` | Implement change with TDD |
| `/adv-archive <change-id>` | Archive completed change |

### Pre-Implementation

| Command | Purpose |
|---------|---------|
| `/adv-clarify` | Ask Socratic clarifying questions |
| `/adv-prep <change-id>` | Gap analysis - add missing scenarios, tasks |
| `/adv-research <target>` | Validate architectural decisions via Context7 |

### Post-Implementation

| Command | Purpose |
|---------|---------|
| `/adv-review <change-id>` | Code review with sub-agents (correctness, security, architecture) |
| `/adv-harden <change-id>` | AI-slop detection, test coverage, cleanup |
| `/adv-audit [capability]` | Project-wide spec/implementation drift detection |

### Advanced

| Command | Purpose |
|---------|---------|
| `/adv-ralph <change-id>` | Autonomous implementation with retry on failures |
| `/adv-refactor <change-id>` | Refresh stale proposals to match codebase |
| `/adv-coordinate` | Multi-change conflict detection |
| `/adv-roadmap` | Progress dashboard |

## 6-Gate Quality Checklist

All changes and agenda items must complete 6 sequential quality gates before archival/completion:

### Gate Sequence

| # | Gate ID | Name | Triggered By |
|---|-----------|------|--------------|
| 1 | `research` | Research-Done | `/adv-research` or Context7 lookup |
| 2 | `prep` | Prep-Done | `/adv-prep` |
| 3 | `implementation` | Implementation-Done | All tasks done (cancelled need approval) |
| 4 | `review` | Review-Done | `/adv-review` |
| 5 | `harden` | Harden-Done | `/adv-harden` |
| 6 | `signoff` | User-Signoff | Explicit user confirmation |

### Gate Status Values

| Value | Meaning |
|--------|----------|
| `pending` | Not yet completed |
| `done` | Actually completed with timestamp + actor evidence |
| `legacy` | Predates gate system, counts as "satisfied" but wasn't performed |
| `skipped` | Explicitly skipped with documented reason (future use) |

### Enforcement Rules

- Gates MUST be completed in sequence (cannot skip)
- Archive/Complete BLOCKS unless all 6 gates are complete/legacy
- At `implementation` gate, ANY cancelled tasks require explicit user approval
- `legacy` gates count as "satisfied" for sequence enforcement
- Migration: Existing changes get gates set to `legacy` (NOT `done`), except `signoff` stays `pending`

### Auto-Completion

If a command is invoked with incomplete prerequisite gates, the agent MUST automatically execute the lightweight version of each missing gate before proceeding:

| If Missing | Auto-Execute | Lightweight Version |
|------------|--------------|---------------------|
| `research` | Context7 docs lookup | Query relevant library docs, no full research report |
| `prep` | Quick prep analysis | Scan affected files, check for conflicts |

User is notified before proceeding with gates that will be auto-completed.

## Available Tools

| Tool | Purpose |
|------|---------|
| `adv_spec_list` | List all specs with optional filtering |
| `adv_spec_show` | Get full spec details |
| `adv_spec_search` | Search requirements by keyword |
| `adv_change_list` | List changes by status |
| `adv_change_show` | Get full change details |
| `adv_change_create` | Create new change scaffold |
| `adv_change_validate` | Validate change against specs |
| `adv_change_archive` | Archive completed change |
| `adv_task_list` | List tasks in a change |
| `adv_task_ready` | Get tasks ready to start |
| `adv_task_update` | Update task status |
| `adv_task_add` | Add new task to change |
| `adv_wisdom_add` | Add a wisdom entry (learning) |
| `adv_wisdom_list` | List all wisdom for a change |
| `adv_status` | Get project status overview |

## Status Markers

Emit at START of each response:

| Marker | When to Use |
|--------|-------------|
| `[ADV:ROCKET]` | Active work / processing |
| `[ADV:TDD_RED]` | Writing tests (red phase) |
| `[ADV:TDD_GREEN]` | Implementing (green phase) |
| `[ADV:MOON]` | Waiting for sub-agent results |
| `[ADV:EARTH]` | Complete / awaiting input |
| `[ADV:DOOM_LOOP]` | Stuck in retry cycle |
| `[ADV:MIC]` | Needs user approval |
| `[ADV:TASK_STATUS_REPORT]` | Emitting task status report on loop stop or compaction |

The following markers are emitted automatically by the system:

| Marker | Purpose |
|--------|---------|
| `[ADV:ACCUMULATED_WISDOM]` | Injected context of previous learnings |
| `[ADV:TODO_CONTINUATION]` | Reminder of remaining tasks |
| `[ADV:RECORD_WISDOM]` | Prompt to record new learnings |

## Context Freshness Policy

**CRITICAL: Work one task at a time with fresh context.**

Before starting EACH task during `/adv-apply` or `/adv-ralph`:

1. **Re-read** the change via `adv_change_show` 
2. **Check** the task's full description (not a cached summary)
3. **Review** relevant proposal sections

### TodoWrite Rules for ADV Tasks

When tracking ADV tasks with TodoWrite, use **task IDs only** - no descriptive blurbs:

```json
// ✅ CORRECT - forces context lookup
{ "content": "tk-abc123", "status": "pending", "priority": "high" }

// ❌ WRONG - causes context drift  
{ "content": "Add hero section with pricing", "status": "pending", "priority": "high" }
```

**Why IDs only:** Seeing just `tk-abc123` forces you to call `adv_change_show` to understand requirements. Descriptive blurbs lead to working from stale/abbreviated mental models.

**Anti-pattern to avoid:**
```
❌ "I'll batch these tasks into my todo list:
   1. Add hero section  
   2. Add price display
   Then work through them..."
```

**Correct approach:**
```
✓ "Starting task tk-abc123. Let me refresh context..."
   [calls adv_change_show]
   "The proposal specifies compact price variants. Now implementing..."
```

**Why:** Context drift causes implementation errors when agents work from abbreviated summaries.

## TDD Protocol (RSTC)

For implementation tasks, follow **Requirement → Spec → Test → Code**:

### Red Phase
1. Write a failing test that describes expected behavior
2. Run test to confirm it fails
3. Emit `[ADV:TDD_RED]` marker
4. Show failing test output as evidence

### Green Phase
1. Write minimal code to make the test pass
2. Run test to confirm it passes
3. Emit `[ADV:TDD_GREEN]` marker
4. Show passing test output as evidence

### Trivial Tasks
For non-logic tasks (docs, config), note rationale:
```
Task: Update README (trivial: docs change, manual review)
```

## Doom Loop Detection

If stuck on a task after 3 attempts:

1. **STOP** - Don't retry the same approach
2. **Emit** `[ADV:DOOM_LOOP]` marker
3. **Document** - Show all 3 attempts with diagnosis
4. **Ask** - Use the `question` tool to get user guidance:
   - Provide hint (recommended) - get guidance for 4th attempt
   - User takes over - user completes task manually
   - Cancel change - abort entire change

### ⛔ No Skip / No Defer Policy

**Tasks must be completed, not avoided.** The following are PROHIBITED:

- Skipping tasks "to revisit later"
- Deferring tasks "until more information"
- Marking tasks blocked without 3 genuine attempts
- Suggesting user complete "difficult" tasks
- Offering "skip" as an option to the user

**Each doom loop attempt must be distinct** - different diagnosis, different fix approach. Repeating the same fix does not count toward the 3-attempt budget.

## Runtime Enforcement

Advance provides automated runtime assistance to maintain focus and accumulate knowledge:

1. **Accumulated Wisdom**: Injects patterns, successes, and gotchas discovered in previous tasks into the current session context (`[ADV:ACCUMULATED_WISDOM]`).
2. **Todo Continuation**: Automatically reminds the agent of remaining tasks when a task is completed but the change is not yet finished (`[ADV:TODO_CONTINUATION]`).
3. **Wisdom Recording**: Prompts the agent to record any non-obvious learnings after task completion (`[ADV:RECORD_WISDOM]`).

## Task Status Report

When the `/apply` or `/ralph` loop stops, or when opencode runs a `/compaction`, the AI-Agent **MUST** report any tasks that were modified or cancelled and output a formatted report to the console.

### Trigger Events

| Event | Description |
|-------|-------------|
| **Loop Stop** | `/apply` or `/ralph` terminates (success, error, doom loop, or user cancel) |
| **Compaction** | opencode runs `/compaction` to reduce context |

### Report Requirement

**MANDATORY**: When any trigger event occurs, emit `[ADV:TASK_STATUS_REPORT]` and output the report.

### Report Format

```
╔══════════════════════════════════════════════════════════════╗
║ 📋 TASK STATUS REPORT                                        ║
╠══════════════════════════════════════════════════════════════╣
║ Change: {change-id}                                          ║
║ Trigger: {loop_stop | compaction}                            ║
║ Timestamp: {ISO timestamp}                                   ║
╠══════════════════════════════════════════════════════════════╣
║ COMPLETED THIS SESSION:                                      ║
║   ✓ tk-abc123: Implement feature X                           ║
║   ✓ tk-def456: Write tests for feature X                     ║
╠══════════════════════════════════════════════════════════════╣
║ IN PROGRESS (interrupted):                                   ║
║   ⚡ tk-ghi789: Refactor module Y                            ║
╠══════════════════════════════════════════════════════════════╣
║ CANCELLED (with reasoning):                                  ║
║   ✗ tk-jkl012: Deprecated approach                           ║
║     → Reason: Superseded by tk-xyz789 which uses new API     ║
╠══════════════════════════════════════════════════════════════╣
║ REMAINING:                                                   ║
║   ○ tk-mno345: Document API changes                          ║
║   ○ tk-pqr678: Update README                                 ║
╚══════════════════════════════════════════════════════════════╝
```

### Report Contents

| Section | Description |
|---------|-------------|
| **COMPLETED THIS SESSION** | Tasks marked `done` during this session |
| **IN PROGRESS (interrupted)** | Tasks with `in_progress` status when loop stopped |
| **CANCELLED** | Tasks marked `cancelled` during this session |
| **REMAINING** | Tasks still `pending` that need future work |

**IMPORTANT**: For any cancelled tasks, you MUST provide full reasoning on the line below the task. This ensures traceability and allows users to understand why work was abandoned. The reasoning should explain:
- Why the task was cancelled (e.g., superseded, duplicate, out of scope)
- What alternative approach was taken, if any
- Any related tasks that replaced or absorbed this work

### Example Usage

When loop completes successfully:
```
[ADV:TASK_STATUS_REPORT]
╔══════════════════════════════════════════════════════════════╗
║ 📋 TASK STATUS REPORT                                        ║
╠══════════════════════════════════════════════════════════════╣
║ Change: add-auth-abc123                                      ║
║ Trigger: loop_stop                                           ║
║ Timestamp: 2026-01-28T05:30:00.000Z                          ║
╠══════════════════════════════════════════════════════════════╣
║ COMPLETED THIS SESSION:                                      ║
║   ✓ tk-LaZwj2Cu: Define auth requirements                    ║
║   ✓ tk-cb-UkvSc: Implement JWT validation                    ║
║   ✓ tk-PahN3JZw: Write auth tests                            ║
╠══════════════════════════════════════════════════════════════╣
║ IN PROGRESS (interrupted):                                   ║
║   (none)                                                     ║
╠══════════════════════════════════════════════════════════════╣
║ CANCELLED:                                                   ║
║   (none)                                                     ║
╠══════════════════════════════════════════════════════════════╣
║ REMAINING:                                                   ║
║   (none - all tasks complete)                                ║
╚══════════════════════════════════════════════════════════════╝
```

## User Interaction

Use the `question` tool for predefined choices (confirmations, selections, doom loop recovery).
Skip for: open-ended questions, debugging, free-form input.

### Question Tool Schema

```typescript
{
  "questions": [{
    "header": string,      // Short label, max 30 chars (required)
    "question": string,    // Full question text (required)
    "multiple": boolean,   // Allow multiple selections (optional, default: false)
    "options": [{          // Available choices (required)
      "label": string,     // Display text, 1-5 words (required)
      "description": string // Explanation of choice (required)
    }]
  }]
}
```

### Constraints

| Field | Limit | Notes |
|-------|-------|-------|
| `header` | max 30 chars | Very short label |
| `label` | 1-5 words | Concise display text |
| `options` | 2-5 choices | Don't include "Other" - custom input is automatic |

### Example

```json
{
  "questions": [{
    "header": "Confirm",
    "question": "Apply changes to spec?",
    "options": [
      { "label": "Apply (Recommended)", "description": "Merge deltas into spec" },
      { "label": "Review first", "description": "Show diff before applying" },
      { "label": "Cancel", "description": "Abort operation" }
    ]
  }]
}
```

### Best Practices

- Put recommended option first with "(Recommended)" suffix
- Custom input ("Type your own answer") is added automatically - don't include catch-all options
- Answers are returned as arrays of labels
- Use `multiple: true` when users should select more than one option

## Validation Rules

### Errors (Must Fix)
- `DUPLICATE_REQUIREMENT_ID` - ID already exists
- `ORPHANED_DELTA_TARGET` - Target doesn't exist
- `SPEC_NOT_FOUND` - Modifying non-existent capability
- `INVALID_ID_FORMAT` - Wrong ID pattern

### Warnings (Should Address)
- `NO_TASKS` - No tasks defined
- `NO_DELTAS` - No deltas defined
- `MISSING_SCENARIO` - Requirement needs scenarios
- `MODIFYING_MUST_TO_MAY` - Priority downgrade

## ID Formats

| Entity | Pattern | Example |
|--------|---------|---------|
| Requirement | `rq-{nanoid}` | `rq-V1StGXR8` |
| Scenario | `rq-{parent}.{n}` | `rq-V1StGXR8.1` |
| Task | `tk-{nanoid}` | `tk-Hf7dK2mN` |
| Delta | `dl-{nanoid}` | `dl-Xt5zW3vB` |
| Change | `{camelCaseTitle}` | `addUserAuth` |

## File Structure

```
project/
├── project.json          # ADV configuration
├── .adv/                 # ADV internals
│   ├── specs/            # The Laws
│   │   └── {capability}/
│   │       └── spec.json
│   ├── changes/          # Active proposals
│   │   └── {change-id}/
│   │       ├── change.json
│   │       └── proposal.md
│   ├── archive/          # Completed changes
│   │   └── {date}-{change-id}/
│   │       ├── change.json
│   │       └── ARCHIVE_SUMMARY.md
│   └── db/               # SQLite cache
│       └── spec.db
└── docs/specs/           # Generated documentation (user-facing)
    └── {capability}.md
```

## Best Practices

1. **One change, one feature**: Keep changes focused
2. **Validate early**: Run validation before implementation
3. **Test first**: Always write tests before code
4. **Evidence required**: Every criterion needs proof
5. **Don't skip steps**: Follow the workflow order
6. **Ask when stuck**: Use doom loop protocol

## When to Use ADV

**Use ADV for:**
- New feature development
- Breaking changes
- Architecture decisions
- Compliance-critical changes

**Skip ADV for:**
- Quick bug fixes
- Typo corrections
- Dependency updates
- Exploratory work

## Specialized Agents

ADV includes purpose-built agents optimized for specific tasks.

### adv-researcher Agent

The `/adv-research` command uses a specialized `adv-researcher` subagent for architectural validation.

**Location:** `.opencode/agents/adv-researcher.md`

**Default Configuration:**

| Setting | Value | Rationale |
|---------|-------|-----------|
| Model | `google/gemini-3-flash-preview` | Blind-tested winner, 1M context, near-Pro reasoning |
| Temperature | `0.10` | Conservative - maximum accuracy for research |
| Hidden | `true` | Not shown in @ menu, only used by `/adv-research` |

**Tools Enabled:**

| Category | Tools | Purpose |
|----------|-------|---------|
| Docs lookup | `context7_*` | Library/framework documentation |
| Web search | `kagi_*`, `google_search` | Best practices, discussions |
| Web fetch | `webfetch`, `fetch-mcp_*`, `firecrawl_*` | Page content extraction |
| Code search | `grep-app_*` | Real-world code patterns |
| Academic | `arxiv-mcp_*` | Research papers |
| ADV read-only | `adv_spec_*`, `adv_change_*`, `adv_project_context` | Query specs/changes |
| Code read-only | `read`, `glob`, `grep` | Explore codebase |

**Disabled Tools:** `write`, `edit`, `bash`, `morph_edit`, `task`, `todowrite` (research agents are read-only)

### User Override

Override the agent configuration in your `opencode.json`:

```json
{
  "agent": {
    "adv-researcher": {
      "model": "anthropic/claude-haiku-4-20250514",
      "temperature": 0.15
    }
  }
}
```

**Alternative Models:**

| Model | Context | Cost (Input/MTok) | Best For |
|-------|---------|-------------------|----------|
| `google/gemini-3-flash-preview` (default) | 1M | $0.50 | All research |
| `anthropic/claude-haiku-4-20250514` | 200K | $1.00 | Proven Claude quality |
| `minimax/minimax-m2.1` | 196K | $0.27 | Budget, agentic-optimized |
| `deepseek/deepseek-v3.2` | 164K | $0.25 | Ultra-budget |

### Fallback Behavior

If `.opencode/agents/adv-researcher.md` is missing:
1. `/adv-research` falls back to the generic `explore` agent
2. A warning is logged: "⚠️ adv-researcher agent not found"
3. Research continues with reduced quality (generic prompting)

## Integration with Goost

ADV can work alongside Goost contracts:
- Use Goost `/contract` for immediate task contracts
- Use ADV for long-term spec management
- ADV specs can inform Goost contract criteria
