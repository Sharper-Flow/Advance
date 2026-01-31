# ADV (Advance) Setup Guide

Complete installation instructions for the ADV spec-driven development plugin.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Installation](#installation)
3. [OpenCode Configuration](#opencode-configuration)
4. [Project Initialization](#project-initialization)
5. [Directory Structure](#directory-structure)
6. [Creating Your First Spec](#creating-your-first-spec)
7. [Verification](#verification)
8. [Migration from OpenSpec](#migration-from-openspec)
9. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required

| Dependency | Version | Check Command |
|------------|---------|---------------|
| Node.js | 20.x or higher | `node --version` |
| pnpm | 9.x (recommended) | `pnpm --version` |
| OpenCode CLI | Latest | `opencode --version` |

### Optional

| Dependency | Purpose |
|------------|---------|
| Git | Version control, change tracking |
| SQLite | Comes bundled with better-sqlite3 |

---

## Installation

### Step 1: Clone the Repository

```bash
git clone https://github.com/Sharper-Flow/Advance.git
cd Advance
```

### Step 2: Install Plugin Dependencies

```bash
cd plugin
pnpm install
```

### Step 3: Build the Plugin

```bash
pnpm build
```

### Step 4: Verify Installation

```bash
pnpm test
# Expected: 288+ tests passing
```

---

## OpenCode Configuration

### Step 1: Create or Update OpenCode Config

Add ADV to your global OpenCode configuration at `~/.config/opencode/opencode.json`:

```json
{
  "instructions": [
    "~/.config/opencode/identity.md"
  ],
  "plugin": [
    "/path/to/Advance/plugin"
  ]
}
```

**Important**: Replace `/path/to/Advance` with the actual path where you cloned the repository.

### Step 2: Add ADV Instructions (Recommended)

Copy the ADV instructions to your OpenCode config directory:

```bash
cp /path/to/Advance/ADV_INSTRUCTIONS.md ~/.config/opencode/
```

Then reference it in your `opencode.json`:

```json
{
  "instructions": [
    "~/.config/opencode/identity.md",
    "~/.config/opencode/ADV_INSTRUCTIONS.md"
  ],
  "plugin": [
    "/path/to/Advance/plugin"
  ]
}
```

### Step 3: Copy Slash Commands

Copy the ADV commands to your project or global OpenCode commands directory:

```bash
# For global availability (all projects)
mkdir -p ~/.config/opencode/command
cp -r /path/to/Advance/.opencode/command/* ~/.config/opencode/command/

# Or for project-specific (in your project root)
mkdir -p .opencode/command
cp -r /path/to/Advance/.opencode/command/* .opencode/command/
```

---

## Project Initialization

### Option A: New Project

Create a new project with ADV support:

```bash
mkdir my-project
cd my-project
git init

# Create project.json configuration
cat > project.json << 'EOF'
{
  "name": "my-project",
  "version": "0.1.0",
  "specs_dir": "specs",
  "changes_dir": "changes",
  "archive_dir": "archive",
  "docs_dir": "docs/specs",
  "db_dir": ".specdb"
}
EOF

# Create directory structure
mkdir -p specs changes archive docs/specs .specdb

# Add to .gitignore
cat >> .gitignore << 'EOF'
# ADV cache (derived, not committed)
.specdb/
*.db
*.db-wal
*.db-shm

# Temporary brainstorm files
temp/
EOF
```

### Option B: Existing Project

Add ADV to an existing project:

```bash
cd your-existing-project

# Create project.json in project root
cat > project.json << 'EOF'
{
  "name": "your-project-name",
  "version": "0.1.0",
  "specs_dir": "specs",
  "changes_dir": "changes",
  "archive_dir": "archive",
  "docs_dir": "docs/specs",
  "db_dir": ".specdb"
}
EOF

# Create required directories
mkdir -p specs changes archive docs/specs .specdb

# Update .gitignore
echo -e "\n# ADV cache\n.specdb/\ntemp/" >> .gitignore
```

---

## Directory Structure

After setup, your project should have this structure:

```
your-project/
├── project.json              # ADV configuration (required)
├── .gitignore                # Should exclude .adv/db/
│
├── .adv/                     # ADV internals
│   ├── specs/                # The Laws (capability specifications)
│   │   └── {capability}/
│   │       └── spec.json
│   ├── changes/              # Active change proposals
│   │   └── {change-id}/
│   │       ├── change.json
│   │       └── proposal.md
│   ├── archive/              # Completed changes (historical record)
│   │   └── {date}-{change-id}/
│   │       ├── change.json
│   │       └── ARCHIVE_SUMMARY.md
│   └── db/                   # SQLite cache (gitignored)
│       └── spec.db
│
├── docs/specs/               # Auto-generated documentation (user-facing)
│   └── {capability}.md
│
└── temp/                     # Brainstorm working documents (gitignored)
    └── brainstorm-*.md
```

### Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| `name` | (required) | Project name |
| `version` | `"0.1.0"` | Project version |
| `specs_dir` | `".adv/specs"` | Directory for spec files |
| `changes_dir` | `".adv/changes"` | Directory for change proposals |
| `archive_dir` | `".adv/archive"` | Directory for archived changes |
| `docs_dir` | `"docs/specs"` | Directory for generated docs |
| `db_dir` | `".adv/db"` | Directory for SQLite cache |
| `project_file` | `"project.md"` | Optional project context file |

---

## Creating Your First Spec

### Step 1: Create Capability Directory

```bash
mkdir -p specs/user-auth
```

### Step 2: Create spec.json

Create `specs/user-auth/spec.json`:

```json
{
  "name": "user-auth",
  "title": "User Authentication",
  "purpose": "Secure user identity verification and session management",
  "version": "1.0.0",
  "updated_at": "2026-01-22T00:00:00Z",
  "requirements": [
    {
      "id": "rq-auth0001",
      "title": "Password Minimum Length",
      "body": "User passwords MUST be at least 12 characters long.",
      "priority": "must",
      "tags": ["security", "password"],
      "scenarios": [
        {
          "id": "rq-auth0001.1",
          "title": "Accept valid password",
          "given": ["a user registration form"],
          "when": "user enters a password with 12+ characters",
          "then": ["the password is accepted", "registration continues"]
        },
        {
          "id": "rq-auth0001.2",
          "title": "Reject short password",
          "given": ["a user registration form"],
          "when": "user enters a password with fewer than 12 characters",
          "then": ["the password is rejected", "error message is shown"]
        }
      ]
    }
  ]
}
```

### Spec JSON Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Capability identifier (kebab-case) |
| `title` | string | Yes | Human-readable title |
| `purpose` | string | Yes | Brief description of capability |
| `version` | string | Yes | Semantic version |
| `updated_at` | string | Yes | ISO 8601 timestamp |
| `requirements` | array | Yes | List of requirements |

### Requirement Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique ID (format: `rq-{nanoid}`) |
| `title` | string | Yes | Requirement title |
| `body` | string | Yes | Full requirement text (use MUST/SHOULD/MAY) |
| `priority` | string | Yes | `must`, `should`, or `may` |
| `tags` | array | No | Categorization tags |
| `scenarios` | array | Yes | Given/When/Then test scenarios |

### Scenario Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique ID (format: `rq-{parent}.{n}`) |
| `title` | string | Yes | Scenario title |
| `given` | array | Yes | Preconditions |
| `when` | string | Yes | Action |
| `then` | array | Yes | Expected outcomes |

---

## Verification

### Check Project Status

Start OpenCode in your project directory and run:

```
/adv-status
```

Expected output:
```
============================================================
                    ADV PROJECT STATUS
============================================================

SPECS (The Laws)
----------------
Total: 1 capability

- user-auth: 1 requirement (v1.0.0)

ACTIVE CHANGES
--------------
No active changes.

Suggestions:
- Create a new change: /adv-proposal "summary"

============================================================
```

### Test Core Workflow

1. **Create a proposal**:
   ```
   /adv-proposal "Add email validation"
   ```

2. **Check the created files**:
   ```bash
   ls changes/
   # Should show: addEmailValidation/
   ```

3. **Validate the change**:
   ```
   /adv-validate {change-id}
   ```

---

## Migration from OpenSpec

If you have an existing OpenSpec project, use the migration script:

```bash
# From the Advance directory
cd /path/to/Advance

# Run migration
npx tsx scripts/migrate-openspec.ts /path/to/your-project/openspec ./specs

# This will:
# 1. Read all specs from openspec/specs/
# 2. Convert to ADV format in ./specs/
# 3. Copy project.md if it exists
# 4. Create a backup of the OpenSpec directory
```

### Post-Migration Steps

1. Verify migrated specs:
   ```
   /adv-status
   ```

2. Review any conversion warnings

3. Update your project.json if needed

4. Remove old openspec/ directory (backup is created automatically)

---

## Troubleshooting

### SQLite Errors

If you see `better-sqlite3` errors:

```bash
cd /path/to/Advance/plugin
pnpm rebuild better-sqlite3
```

### Permission Issues

Ensure write access to all ADV directories:

```bash
chmod -R u+w specs changes archive docs .specdb temp
```

### Cache Corruption

Clear and rebuild the SQLite cache:

```bash
rm -rf .specdb/spec.db
# Cache rebuilds automatically on next ADV command
```

### Commands Not Found

Ensure commands are copied to the correct location:

```bash
# Check global commands
ls ~/.config/opencode/command/adv-*.md

# Or check project commands
ls .opencode/command/adv-*.md
```

### Plugin Not Loading

Verify plugin path in `opencode.json`:

```bash
# Check the path exists
ls /path/to/Advance/plugin/dist/index.js

# If missing, rebuild
cd /path/to/Advance/plugin
pnpm build
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ADV_DEBUG` | `"0"` | Set to `"1"` for debug logging |

---

## Quick Reference

### Available Commands

| Command | Purpose |
|---------|---------|
| `/adv-status` | Project overview |
| `/adv-brainstorm [topic]` | Interactive ideation session |
| `/adv-clarify` | Socratic requirements discovery |
| `/adv-proposal <summary>` | Create change proposal |
| `/adv-prep <id>` | Gap analysis |
| `/adv-validate <id>` | Validate change |
| `/adv-apply <id>` | Implement with TDD |
| `/adv-review <id>` | Code review |
| `/adv-harden <id>` | Quality hardening |
| `/adv-archive <id>` | Archive completed change |
| `/adv-audit` | Spec/implementation drift check |

### Available Tools

| Tool | Purpose |
|------|---------|
| `adv_status` | Get project overview |
| `adv_spec_list` | List all specs |
| `adv_spec_show` | Get spec details |
| `adv_spec_search` | Search requirements |
| `adv_change_list` | List changes |
| `adv_change_show` | Get change details |
| `adv_change_create` | Create change |
| `adv_change_validate` | Validate change |
| `adv_change_archive` | Archive change |
| `adv_task_list` | List tasks |
| `adv_task_ready` | Get ready tasks |
| `adv_task_update` | Update task |
| `adv_task_add` | Add task |

---

## Support

- **Issues**: https://github.com/Sharper-Flow/Advance/issues
- **Documentation**: See README.md and ADV_INSTRUCTIONS.md
- **Changelog**: See CHANGELOG.md
