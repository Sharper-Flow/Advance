# Advance (ADV)

**Spec-driven development with specs as laws.**

An OpenCode plugin for managing specifications, changes, and tasks with immutable requirements enforcement.

## Features

- **Specs as Laws**: Requirements are enforced during change validation
- **JSON + SQLite**: Structured data with fast queries (FTS5 full-text search)
- **Task Dependencies**: Kahn's algorithm for dependency resolution
- **Plugin-First**: Native AI tools with <5ms latency

## Installation

```bash
cd plugin
bun install
```

## Usage

The plugin exposes tools to AI agents:

```typescript
// List all specs
adv_spec_list({ tag: "security" })

// Create a change proposal
adv_change_create({ summary: "Add OAuth support" })

// Get ready tasks
adv_task_ready({ changeId: "add-oauth-abc123" })

// Update task status
adv_task_update({ taskId: "tk-xyz", status: "done" })
```

## Project Structure

```
project/
├── project.json              # Project config
├── specs/
│   └── {capability}/
│       └── spec.json         # THE LAW
├── changes/
│   └── {change-id}/
│       ├── proposal.md       # Why (prose)
│       └── change.json       # Tasks + deltas
├── archive/                  # Completed changes
├── docs/specs/               # Generated docs
└── .specdb/
    └── spec.db               # SQLite cache
```

## Tools

| Tool | Description |
|------|-------------|
| `adv_spec_list` | List specs with filtering |
| `adv_spec_show` | Get spec details |
| `adv_spec_search` | Full-text search (FTS5) |
| `adv_change_list` | List active changes |
| `adv_change_show` | Get change details |
| `adv_change_create` | Create new proposal |
| `adv_change_validate` | Validate against specs |
| `adv_change_archive` | Archive completed change |
| `adv_task_list` | List tasks for change |
| `adv_task_ready` | Get unblocked tasks |
| `adv_task_update` | Update task status |
| `adv_task_add` | Add new task |
| `adv_status` | Project overview |

## Development

```bash
cd plugin
bun run check      # typecheck + lint + format
bun run test       # run tests
bun run dev        # watch mode
```

## License

MIT
