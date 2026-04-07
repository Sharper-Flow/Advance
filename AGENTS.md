# Advance (ADV) - Agent Instructions

## Overview

Advance is a spec-driven development plugin where **specs become laws**. Requirements in `spec.json` files are enforced during change validation.

## Core Concepts

### Specs (Laws)
- `specs/{capability}/spec.json` contains enforced requirements
- Each requirement has scenarios (Given/When/Then)
- Tags enable cross-cutting queries

### Changes (Proposals)
- `changes/{id}/change.json` contains tasks and deltas
- Deltas describe modifications to specs
- Must be validated before archiving

### Tasks
- Tasks have dependencies (`blocked_by`, `related`, etc.)
- Use `adv_task_ready` to get unblocked tasks
- Update status as work progresses

## Workflow

1. **Create Change**: `adv_change_create({ summary: "..." })`
2. **Add Tasks**: `adv_task_add({ changeId, content: "..." })`
3. **Get Ready Tasks**: `adv_task_ready({ changeId })`
4. **Work on Tasks**: Implement, then `adv_task_update`
5. **Validate**: `adv_change_validate({ changeId })`
6. **Archive**: `adv_change_archive({ changeId })`

## Tool Usage

### Spec Tools
```typescript
// List all specs
adv_spec({ action: "list" })

// Filter by tag
adv_spec({ action: "list", tag: "security" })

// Get full spec
adv_spec({ action: "show", capability: "contract-system" })

// Search across specs
adv_spec({ action: "search", query: "authentication" })
```

### Change Tools
```typescript
// List active changes
adv_change_list({})

// Get change details
adv_change_show({ changeId: "add-feature" })

// Create new change
adv_change_create({ summary: "Add feature X" })

// Update proposal/problem-statement for existing change (never re-call create)
adv_change_update({ changeId: "add-feature", proposal: "..." })

// Validate change
adv_change_validate({ changeId: "add-feature" })

// Archive completed change
adv_change_archive({ changeId: "add-feature" })
```

### Task Tools
```typescript
// List all tasks
adv_task_list({ changeId: "add-feature" })

// Get unblocked tasks
adv_task_ready({ changeId: "add-feature" })

// Get full task details by ID (includes parent changeId)
adv_task_show({ taskId: "tk-abc" })

// Update task status
adv_task_update({ taskId: "tk-abc", status: "done" })

// Add new task (TDD is inline — no separate "Write tests" tasks)
adv_task_add({ 
  changeId: "add-feature", 
  content: "Implement feature X (TDD: write tests first, then implement)",
  section: "Implementation"
})

// Reclassify TDD intent after prep gate (requires user approval)
adv_task_reclassify_tdd({
  taskId: "tk-abc",
  toIntent: "not_applicable",
  reason: "Task is docs-only, no testable logic",
  approvedByUser: true,
  approvalEvidence: "User confirmed in chat"
})
```

## ID Formats

| Entity | Format | Example |
|--------|--------|---------|
| Requirement | `rq-{nanoid(8)}` | `rq-V1StGXR8` |
| Scenario | `rq-{parent}.{n}` | `rq-V1StGXR8.1` |
| Task | `tk-{nanoid(8)}` | `tk-Hf7dK2mN` |
| Delta | `dl-{nanoid(8)}` | `dl-Xt5zW3vB` |
| Change | `{camelCaseTitle}` | `addUserAuth` |

## Dependency Types

| Type | Effect |
|------|--------|
| `blocked_by` | Cannot start until target completes |
| `related` | Informational, no blocking |
| `discovered_from` | Provenance tracking |
| `parent` | Hierarchical containment |

## Priority (RFC 2119)

- `must`: Required functionality
- `should`: Expected but not critical
- `may`: Optional enhancement

## Directory Structure

```
project/
├── project.json           # Config
├── .adv/                  # ADV internals
│   ├── specs/             # THE LAW
│   │   └── {cap}/spec.json
│   ├── changes/           # Proposals
│   │   └── {id}/
│   │       ├── proposal.md
│   │       └── change.json
│   ├── archive/           # Completed
│   └── db/spec.db         # SQLite cache
└── docs/specs/            # Generated docs
```

## For Agents Modifying This Plugin

### Adding New Tools
1. Create tool in `src/tools/`
2. Add to index.ts exports
3. Register in plugin entry

### Modifying Storage
- JSON files are source of truth
- SQLite is derived cache
- Always sync both on write

### Testing
```bash
bun run check    # Full validation
bun test         # Run tests
```
