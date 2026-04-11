# Advance (ADV) - Agent Instructions

## Overview

Advance is a spec-driven development plugin where **specs become laws**. Requirements in `spec.json` files are enforced during change validation.

## Core Concepts

### Specs (Laws)
- `.adv/specs/{capability}/spec.json` contains enforced requirements
- Each requirement has scenarios (Given/When/Then)
- Tags enable cross-cutting queries

### Changes (Proposals)
- `.adv/changes/{id}/change.json` contains tasks and deltas
- Proposals live alongside as `problem-statement.md`, `proposal.md`, `agreement.md`, `design.md`
- Deltas describe modifications to specs
- Must pass all 7 gates before archiving

### Tasks
- Tasks have dependencies (`blocked_by`, `related`, etc.)
- Use `adv_task_ready` to get unblocked tasks
- Update status as work progresses
- New tasks cannot be added after the `planning` gate is complete

## Workflow

ADV is a **7-gate collaborative workflow**. Gates are sequential — you cannot complete a gate until prior gates are satisfied, and you cannot archive until all 7 are done.

| # | Gate       | Owning command(s)                 | Artifact                       |
|---|------------|-----------------------------------|--------------------------------|
| 1 | proposal   | `/adv-proposal`                     | `problem-statement.md`           |
| 2 | discovery  | `/adv-discover` + `/adv-agree`        | `agreement.md`                   |
| 3 | design     | `/adv-design` + `/adv-present`        | `design.md`                      |
| 4 | planning   | `/adv-prep`                         | Task graph in `change.json`      |
| 5 | execution  | `/adv-apply`                        | Code / docs / ops deliverables   |
| 6 | acceptance | `/adv-review` + `/adv-accept`         | User sign-off                    |
| 7 | release    | `/adv-harden` + `/adv-archive`        | Spec deltas applied, git finalized |

Programmatic flow:

1. **Create Change**: `adv_change_create({ summary: "..." })`
2. **Walk gates 1–4** via slash commands (or `/adv-task` fast-track)
3. **Execute**: `/adv-apply` runs tasks with inline TDD (`adv_task_ready` → implement → `adv_task_update`)
4. **Review + Accept**: `/adv-review` then `/adv-accept`
5. **Harden + Archive**: `/adv-harden` then `/adv-archive`

See [docs/adv-gates.md](docs/adv-gates.md) for gate contracts and [docs/adv-workflow.md](docs/adv-workflow.md) for the visual diagram.

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

// Get lightweight change context (no full task details)
adv_change_summary({ changeId: "add-feature" })

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

// Add new task (TDD intent is declared via metadata, NOT inline content)
// Valid metadata.tdd_intent: "inline" | "separate_verification" | "not_applicable"
adv_task_add({
  changeId: "add-feature",
  content: "Implement feature X",
  section: "Implementation",
  metadata: { tdd_intent: "inline" }
})

// Note: tasks can only be added BEFORE the planning gate is complete.
// After planning is done, the task graph is frozen.

// Reclassify TDD intent after planning gate (requires user approval)
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
├── project.json              # Config
├── .adv/                     # ADV internals
│   ├── specs/                # THE LAW (capability specifications)
│   │   └── {cap}/spec.json
│   ├── changes/              # Active proposals
│   │   └── {id}/
│   │       ├── change.json
│   │       ├── problem-statement.md   # produced by /adv-proposal
│   │       ├── proposal.md            # produced by /adv-proposal
│   │       ├── agreement.md           # produced by /adv-agree
│   │       └── design.md              # produced by /adv-design + /adv-present
│   ├── archive/              # Completed changes
│   └── db/spec.db            # SQLite cache (derived, gitignored)
├── docs/
│   ├── adv-gates.md          # Gate contracts
│   ├── adv-workflow.md       # Visual workflow
│   └── specs/                # Generated spec docs
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
pnpm run check    # Full validation (typecheck + lint + format)
pnpm test         # Run tests
```
