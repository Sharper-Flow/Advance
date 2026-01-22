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

| Command | Purpose |
|---------|---------|
| `/adv-status` | Show project overview (specs, changes, recommendations) |
| `/adv-proposal <summary>` | Create a new change proposal |
| `/adv-validate <change-id> [strict]` | Validate change against specs |
| `/adv-apply <change-id>` | Implement change with TDD |
| `/adv-archive <change-id> [dry-run]` | Archive completed change |

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
3. **Analyze** - What assumption is wrong?
4. **Ask** - Use `mcp_question` to get user guidance:
   - Try alternative approach
   - Get more context
   - Mark as blocked
   - Cancel change

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
| Change | `{slug}-{nanoid}` | `add-auth-abc123` |

## File Structure

```
project/
├── project.json          # ADV configuration
├── specs/                # The Laws
│   └── {capability}/
│       └── spec.json     # Capability spec
├── changes/              # Active proposals
│   └── {change-id}/
│       ├── change.json   # Change definition
│       └── proposal.md   # Human-readable proposal
├── archive/              # Completed changes
│   └── {date}-{change-id}/
│       ├── change.json
│       └── ARCHIVE_SUMMARY.md
├── docs/specs/           # Generated documentation
│   └── {capability}.md
└── .specdb/              # SQLite cache
    └── spec.db
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

## Integration with Goost

ADV can work alongside Goost contracts:
- Use Goost `/contract` for immediate task contracts
- Use ADV for long-term spec management
- ADV specs can inform Goost contract criteria
