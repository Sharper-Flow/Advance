# ADV - Advance Spec-Driven Development

[![CI](https://github.com/Sharper-Flow/Advance/actions/workflows/ci.yml/badge.svg)](https://github.com/Sharper-Flow/Advance/actions/workflows/ci.yml)

ADV (Advance) is an OpenCode plugin that enables **spec-driven development** where specifications become enforceable laws. Changes to your system are formally proposed, validated, and tracked through a structured workflow.

## Core Concept

```
SPECS ARE LAWS → CHANGES ARE PROPOSALS → VALIDATION ENFORCES LAWS
```

1. **Specs** define requirements with Given/When/Then scenarios
2. **Changes** propose additions, modifications, or removals to specs
3. **Validation** ensures changes don't violate existing specs
4. **Archive** promotes approved changes to the spec canon

## Features

- **13 MCP Tools** for managing specs, changes, and tasks
- **Validation Engine** - "specs as laws" enforcement
- **TDD Workflow** - Test-first development with evidence tracking
- **Delta Application** - Semantic version bumping and spec updates
- **Documentation Generation** - Auto-generated markdown from specs
- **Terminal Integration** - Status markers and tab colors
- **Doom Loop Detection** - Automatic stuck detection with recovery

## Installation

See [INSTALL.md](INSTALL.md) for detailed setup instructions.

### Quick Start

```bash
# Clone the repository
git clone https://github.com/Sharper-Flow/Advance.git
cd Advance/plugin

# Install dependencies
pnpm install

# Run tests
pnpm test
```

## Workflow

```
/adv-proposal "Add user authentication"
       │
       ▼
┌─────────────────────────────┐
│  Define Requirements        │
│  - Requirements with IDs    │
│  - Given/When/Then scenarios│
│  - Tasks for implementation │
└──────────────┬──────────────┘
               │
               ▼
/adv-validate {change-id}
       │
       ▼
┌─────────────────────────────┐
│  Validation Checks          │
│  - No duplicate IDs         │
│  - Targets exist            │
│  - Valid ID formats         │
└──────────────┬──────────────┘
               │
               ▼
/adv-apply {change-id}
       │
       ▼
┌─────────────────────────────┐
│  TDD Implementation         │
│  - [TDD_RED] Write tests    │
│  - [TDD_GREEN] Implement    │
│  - Mark tasks complete      │
└──────────────┬──────────────┘
               │
               ▼
/adv-archive {change-id}
       │
       ▼
┌─────────────────────────────┐
│  Specs Updated              │
│  Docs Generated             │
│  Change Archived            │
└─────────────────────────────┘
```

## Commands

| Command | Description |
|---------|-------------|
| `/adv-status` | Show project overview |
| `/adv-proposal <summary>` | Create change proposal |
| `/adv-validate <id> [strict]` | Validate against specs |
| `/adv-apply <id>` | Implement with TDD |
| `/adv-archive <id> [dry-run]` | Archive completed change |

## Tools

### Spec Tools
| Tool | Description |
|------|-------------|
| `adv_spec_list` | List capabilities with filters |
| `adv_spec_show` | Get full spec details |
| `adv_spec_search` | Search requirements |

### Change Tools
| Tool | Description |
|------|-------------|
| `adv_change_list` | List changes by status |
| `adv_change_show` | Get change details |
| `adv_change_create` | Create new change |
| `adv_change_validate` | Validate change |
| `adv_change_archive` | Archive change |

### Task Tools
| Tool | Description |
|------|-------------|
| `adv_task_list` | List tasks in change |
| `adv_task_ready` | Get ready tasks |
| `adv_task_update` | Update task status |
| `adv_task_add` | Add task to change |

### Status Tool
| Tool | Description |
|------|-------------|
| `adv_status` | Get project status |

## Status Markers

| Marker | Meaning |
|--------|---------|
| `[ADV:ROCKET]` | Active work |
| `[ADV:TDD_RED]` | Writing tests |
| `[ADV:TDD_GREEN]` | Implementing |
| `[ADV:MOON]` | Waiting for sub-agents |
| `[ADV:EARTH]` | Complete/idle |
| `[ADV:DOOM_LOOP]` | Stuck (3+ retries) |
| `[ADV:MIC]` | Needs approval |

## Project Structure

```
project/
├── project.json          # ADV configuration
├── specs/                # Capability specifications
│   └── {capability}/
│       └── spec.json
├── changes/              # Active change proposals
│   └── {change-id}/
│       ├── change.json
│       └── proposal.md
├── archive/              # Completed changes
│   └── {date}-{change-id}/
├── docs/specs/           # Generated documentation
│   └── {capability}.md
└── .specdb/              # SQLite cache
    └── spec.db
```

## Spec Format

```json
{
  "name": "user-auth",
  "title": "User Authentication",
  "purpose": "Secure user identity verification",
  "version": "1.0.0",
  "updated_at": "2026-01-21T00:00:00Z",
  "requirements": [
    {
      "id": "rq-auth0001",
      "title": "Password Requirements",
      "body": "Passwords must be at least 12 characters.",
      "priority": "must",
      "scenarios": [
        {
          "id": "rq-auth0001.1",
          "title": "Valid password accepted",
          "given": ["a registration form"],
          "when": "user enters a 12+ character password",
          "then": ["password is accepted"]
        }
      ]
    }
  ]
}
```

## Change Format

```json
{
  "id": "add-mfa-support",
  "title": "Add Multi-Factor Authentication",
  "status": "active",
  "created_at": "2026-01-21T00:00:00Z",
  "tasks": [
    {
      "id": "tk-mfa0001",
      "title": "Implement TOTP generation",
      "status": "pending",
      "priority": 0
    }
  ],
  "deltas": {
    "user-auth": [
      {
        "id": "dl-mfa0001",
        "operation": "add",
        "requirement": {
          "id": "rq-mfa0001",
          "title": "TOTP Support",
          "body": "Support TOTP-based MFA",
          "priority": "should"
        }
      }
    ]
  }
}
```

## Development

```bash
cd plugin

# Install dependencies
pnpm install

# Run tests
pnpm test

# Type check
pnpm run typecheck

# Lint
pnpm run lint

# Format
pnpm run format

# All checks
pnpm run check
```

## Testing

222 tests across 11 test files:
- Storage layer (JSON, SQLite, Store)
- All 13 tools
- Validation engine
- Archive operations
- Events and status

```bash
pnpm test
```

## License

MIT

## Related Projects

- [Goost](https://github.com/anomalyco/goost) - Contract-based task persistence
- [OpenCode](https://github.com/anomalyco/opencode) - AI coding CLI
