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
| pnpm | 10.x (recommended) | `pnpm --version` |
| OpenCode CLI | Latest | `opencode --version` |

### Optional

| Dependency | Purpose |
|------------|---------|
| Git | Version control, change tracking |
| SQLite | Comes bundled with better-sqlite3 |
| jq | Required only for `sync-global.sh --fix` (config patching) |

---

## External Dependencies (MCP Servers and Sub-Agents)

ADV ships the plugin, commands, overlays, and bundled ADV agents (`plan`, `scout`,
`refine`, `adv-researcher`, `tron`). But several of those agents and commands
reference **external MCP servers** and **shared sub-agents** that are NOT part
of ADV itself. If any of these are missing, ADV still runs — commands have
fallback paths — but the user experience is degraded.

### Required sub-agents (shared with OpenCode global config)

These agents are expected to exist in `~/.config/opencode/agents/` as part of
your OpenCode setup. ADV does not ship them. If missing, commands will fall
back to inline execution or generic `explore` agent invocation, which is
slower and less specialized.

| Agent       | Used by                                                         | What it does                                     |
|-------------|-----------------------------------------------------------------|---------------------------------------------------|
| `explore`     | `/adv-review`, `/adv-harden`, `/adv-audit`, `/adv-slop-scan`, `/adv-refactor` | Codebase navigation, finding usages               |
| `librarian`   | `/adv-discover`, `/adv-design`, `/adv-task`, `/adv-review`              | Documentation and API lookup (Context7, grep.app) |
| `mechanic`    | `/adv-tron` (optional), `scout` sub-agent spawns                    | System/infra diagnostics                          |
| `general`     | `/adv-review` (cross-cutting), overlay-managed                      | Multi-step implementation                         |

### Optional MCP servers (referenced by agent tool blocks)

These MCP servers are granted to `plan`/`scout`/`refine`/`adv-researcher`
via their `tools:` allowlists. OpenCode silently ignores tool grants for
MCP servers that are not configured — the grants become no-ops. You can
run ADV without any of these, but the following features degrade or become
unavailable:

| MCP server   | Tool prefix    | Used by                                 | Degradation if missing                                  |
|--------------|----------------|-----------------------------------------|---------------------------------------------------------|
| lgrep        | `lgrep_*`        | `plan`, `scout`, `refine`, `adv-researcher`, `tron` | Code exploration falls back to `glob`/`grep`/`read` (slower, less semantic) |
| Firecrawl    | `firecrawl_*`    | `scout`, `refine`                           | Web scraping unavailable; use `webfetch` instead        |
| Context7     | `context7_*`     | `adv-researcher`                            | Library documentation lookup unavailable                |
| Kagi         | `kagi_*`         | `adv-researcher`                            | Web search unavailable                                  |
| grep.app     | `grep-app_*`     | `adv-researcher`                            | Cross-repo code example search unavailable             |
| arXiv MCP    | `arxiv-mcp_*`    | `adv-researcher`                            | Academic paper search unavailable                       |

Configure these MCP servers in your `opencode.json` `mcp` section per each
server's documentation. The ADV sync script does not install or validate
MCP servers — that's your responsibility.

### Minimum viable setup

If you want to run ADV with the smallest possible footprint:

1. OpenCode CLI
2. Node.js 20+, pnpm 10+
3. ADV plugin built (`plugin/dist/index.js` present)
4. `~/.config/opencode/agents/` contains `explore` and `librarian` at minimum
5. No external MCP servers required — agents fall back to built-in tools

ADV itself will function. Research and review commands will be noticeably
slower without lgrep and Context7, but they will not fail.

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
# Expected: 1356+ tests passing
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

### Step 2: Run the Sync Script (Recommended)

The easiest way to set up and update ADV is the sync script. It copies commands,
agents, and skills to the global config, and validates (or patches) `opencode.json`:

```bash
# Check what needs updating (config only, no file changes)
./scripts/sync-global.sh --check

# Sync assets + auto-patch opencode.json if ADV entries are missing
./scripts/sync-global.sh --fix

# Sync assets only, report config issues without patching
./scripts/sync-global.sh

# Preview managed overlay/config changes without writing
./scripts/sync-global.sh --dry-run --diff
```

The `--fix` flag will:
- Copy all `adv-*.md` commands to `~/.config/opencode/command/`
- Copy only repo-local ADV agents where direct sync is appropriate
- Apply repo-owned managed overlay blocks to shared global agents like `adv`, `general`, `build`, `plan`, `refine`, and `scout` without replacing the full file
- Copy ADV skills to `~/.config/opencode/skills/` (including bundled methodology skills like `adv-review-methodology`, `adv-harden-methodology`, and `adv-slop-detection`)
- Add the ADV plugin path to `opencode.json` `.plugin` array if missing
- Add `ADV_INSTRUCTIONS.md` to `opencode.json` `.instructions` array if missing
- Back up `opencode.json` before any patches
- Preserve all non-ADV settings (mcp, provider, permissions, etc.)

Top-level ADV slash commands are synced as entrypoint contracts only; they do not include command-level `agent:` routing. Shared-agent orchestration rules are maintained through the overlay blocks and the runtime nesting guard in the ADV plugin.

Requires `jq` for config patching (`sudo apt-get install -y jq` or `brew install jq`).

### Step 2b: Manual Setup (Alternative)

If you prefer manual setup, add ADV entries to your `opencode.json`:

```json
{
  "instructions": [
    "~/.config/opencode/identity.md",
    "/path/to/Advance/ADV_INSTRUCTIONS.md"
  ],
  "plugin": [
    "/path/to/Advance/plugin"
  ]
}
```

Then copy slash commands manually:

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

# Create project.json configuration (paths default to .adv/*)
cat > project.json << 'EOF'
{
  "name": "my-project",
  "version": "0.1.0",
  "specs_dir": ".adv/specs",
  "changes_dir": ".adv/changes",
  "archive_dir": ".adv/archive",
  "docs_dir": "docs/specs",
  "db_dir": ".adv/db"
}
EOF

# Create directory structure
mkdir -p .adv/specs .adv/changes .adv/archive docs/specs .adv/db

# Add to .gitignore
cat >> .gitignore << 'EOF'
# ADV SQLite cache (derived, not committed)
.adv/db/
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
  "specs_dir": ".adv/specs",
  "changes_dir": ".adv/changes",
  "archive_dir": ".adv/archive",
  "docs_dir": "docs/specs",
  "db_dir": ".adv/db"
}
EOF

# Create required directories
mkdir -p .adv/specs .adv/changes .adv/archive docs/specs .adv/db

# Update .gitignore
echo -e "\n# ADV SQLite cache\n.adv/db/\ntemp/" >> .gitignore
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
│   │       ├── problem-statement.md
│   │       ├── proposal.md
│   │       ├── agreement.md
│   │       └── design.md
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
   ls .adv/changes/
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
pnpm dlx tsx scripts/migrate-openspec.ts /path/to/your-project/openspec ./specs

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
chmod -R u+w specs changes archive docs .adv/db temp
```

### Cache Corruption

Use the recovery script to clear and rebuild the SQLite cache:

```bash
# In-repo legacy state (.adv/db/)
node scripts/recover-db.js

# External state (default for git-backed projects) — auto-detects from project root commit
node scripts/recover-db.js --external

# Custom absolute or relative directory
node scripts/recover-db.js --db-dir /path/to/db
```

After deleting the database, **restart OpenCode** — the cache rebuilds from `.adv/specs/` on next startup.

### Stale Spec Rows After Deletion

If you delete a spec from `.adv/specs/` but `adv_spec list` still shows it, the SQLite
cache contains a stale row. The sync only adds and updates rows — it does not prune
entries for specs that no longer exist on disk.

**Fix (two steps):**

1. Delete the spec.db to force a full rebuild:

   ```bash
   # For git-backed projects using external state (recommended):
   node scripts/recover-db.js --external

   # For legacy in-repo state:
   node scripts/recover-db.js
   ```

2. **Restart OpenCode** (or reload the MCP server). The database is rebuilt on next
   plugin startup and will exclude the deleted spec.

**Why restart is required:** The ADV plugin is a long-running server process. Even
after the spec.db file is deleted from disk, the running process still holds the old
database open in memory. Only a restart causes the plugin to open a fresh database
at the original path, triggering a clean sync from `.adv/specs/`.

### Commands Not Found or Config Out of Date

Run the sync script to check and fix everything at once:

```bash
# Check what's missing
./scripts/sync-global.sh --check

# Fix everything (sync assets + patch config)
./scripts/sync-global.sh --fix
```

Or verify manually:

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
| `OPEN_CHAD_CACHE_DIR` | `$TMPDIR` (fallback: `/tmp`) | Directory used for ADV debug log when `ADV_DEBUG=1` |

---

## Upgrading

### From 6-gate to 7-gate workflow

ADV automatically migrates old 6-gate changes (research, prep, implementation, review, harden, signoff) to the new 7-gate model (proposal, discovery, design, planning, execution, acceptance, release) the first time you open them. No action is required.

Mapping:

| Old gate        | New gate    | Notes                                                   |
|-----------------|-------------|---------------------------------------------------------|
| research        | discovery   | preserves status + audit trail (`migrated_from`)        |
| prep            | planning    | preserves status + audit trail                          |
| implementation  | execution   | preserves status + audit trail                          |
| review          | acceptance  | preserves status + audit trail                          |
| harden          | release     | preserves status + audit trail                          |
| signoff         | acceptance  | absorbed; recorded in `absorbed_completions`              |
| (new) proposal  | proposal    | inserted for in-flight changes                          |
| (new) design    | design      | inserted for in-flight changes                          |

New changes start directly in the 7-gate model.

---

## Quick Reference

### Available Commands

**Core 7-gate workflow**

| Command | Purpose |
|---------|---------|
| `/adv-status` | Project overview |
| `/adv-proposal <summary>` | Extract problem statement and confirm with user |
| `/adv-discover <id>` | Gather context and identify objectives |
| `/adv-agree <id>` | Resolve open questions via triage, confirm objectives |
| `/adv-design <id>` | Validate architecture decisions and produce strategy |
| `/adv-present <id>` | Present design overview for user review |
| `/adv-prep <id>` | Gap analysis and task shaping (from validated design) |
| `/adv-apply <id>` | Implement with TDD |
| `/adv-review <id>` | Code review |
| `/adv-accept <id>` | Present deliverable summary for user sign-off |
| `/adv-harden <id>` | Release-stage quality hardening |
| `/adv-archive <id>` | Archive completed change and apply spec deltas |

**Fast-track and auxiliary**

| Command | Purpose |
|---------|---------|
| `/adv-task` | Fast-track a discussed change through proposal → planning |
| `/adv-validate <id>` | Validate change against specs |
| `/adv-clarify` | Clarify ambiguous requirements |
| `/adv-audit [capability]` | Spec/implementation drift check |
| `/adv-slop-scan [path]` | Scan for AI slop patterns |
| `/adv-refactor <id>` | Refresh a stale proposal |
| `/adv-coordinate` | Detect cross-change conflicts |
| `/adv-improve` | Suggest spec or implementation improvements |
| `/adv-tron [target]` | Investigate codebase structure and suggest agenda candidates |

Tradeoff-heavy decisions inside ADV flows use inline analysis by default. For deeper analysis, agents can load the prioritizer skill via `skill("prioritizer")` which provides structured criteria question templates and decision map guidance.

Parallel ADV scanners follow the same single-level delegation rule as other ADV orchestration: commands such as `/adv-slop-scan` may spawn first-level workers, but those workers must complete inline and must not spawn additional sub-agents or invoke `/adv-*` commands.

### Available Tools

**Project & Specs**

| Tool | Purpose |
|------|---------|
| `adv_status` | Project overview: specs, active changes, recommendations |
| `adv_project_context` | Read project.md context file |
| `adv_spec` | List, show, or search specs (`action: "list"/"show"/"search"`) |

**Changes**

| Tool | Purpose |
|------|---------|
| `adv_change_list` | List active changes (with `includeArchived`/`includeClosed` filters) |
| `adv_change_show` | Get full change details including tasks and deltas |
| `adv_change_create` | Create a new change proposal |
| `adv_change_update` | Update proposal/problem-statement/agreement/design for existing change |
| `adv_change_validate` | Validate change against specs and check for conflicts |
| `adv_change_close` | Close an active change (cancelled/superseded/not_planned) |
| `adv_change_archive` | Archive a completed change (applies spec deltas) |
| `adv_change_add_issue` | Link a GitHub issue URL to a change |
| `adv_change_remove_issue` | Unlink a GitHub issue URL from a change |

**Tasks**

| Tool | Purpose |
|------|---------|
| `adv_task_list` | List tasks for a change (with optional status filter) |
| `adv_task_show` | Get full task details by ID (includes parent changeId) |
| `adv_task_ready` | Get unblocked pending tasks ready for work |
| `adv_task_add` | Add a new task to a change |
| `adv_task_update` | Update task status (pending/in_progress/done) |
| `adv_task_cancel` | Cancel tasks with required user approval |
| `adv_task_evidence` | Record TDD evidence (red/green phase proof) |
| `adv_task_tdd_phase` | Manually set TDD phase for a task |
| `adv_task_tdd_status` | Get TDD compliance status for a task |
| `adv_task_reclassify_tdd` | Reclassify TDD intent after planning gate (requires approval) |

**Gates**

| Tool | Purpose |
|------|---------|
| `adv_gate_status` | Get gate status for a change (all 7 gates) |
| `adv_gate_complete` | Mark a gate as complete (enforces sequence) |

**Testing**

| Tool | Purpose |
|------|---------|
| `adv_run_test` | Run a test command and record result as TDD evidence |

**Wisdom**

| Tool | Purpose |
|------|---------|
| `adv_wisdom_add` | Add a learning entry to a change |
| `adv_wisdom_list` | List all wisdom entries for a change |
| `adv_wisdom_promote` | Promote a change-level learning to project-level |

**Agenda**

| Tool | Purpose |
|------|---------|
| `adv_agenda_list` | List agenda items (with status filter) |
| `adv_agenda_add` | Add a quick work item to the agenda |
| `adv_agenda_start` | Mark an agenda item as active |
| `adv_agenda_complete` | Mark an agenda item as done |
| `adv_agenda_cancel` | Cancel an agenda item |
| `adv_agenda_prioritize` | Change priority of an agenda item |
| `adv_agenda_next` | Get highest-priority unblocked agenda item |
| `adv_agenda_stats` | Get agenda statistics |
| `adv_agenda_evidence` | Record TDD evidence for an agenda item |
| `adv_agenda_compact` | Compact the agenda file (remove superseded entries) |

---

## Support

- **Issues**: https://github.com/Sharper-Flow/Advance/issues
- **Documentation**: See README.md and ADV_INSTRUCTIONS.md
