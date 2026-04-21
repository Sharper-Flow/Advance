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

| Dependency   | Version            | Check Command        |
| ------------ | ------------------ | -------------------- |
| Node.js      | 20.x or higher     | `node --version`     |
| pnpm         | 10.x (recommended) | `pnpm --version`     |
| OpenCode CLI | Latest             | `opencode --version` |

### Optional

| Dependency | Purpose                                                    |
| ---------- | ---------------------------------------------------------- |
| Git        | Version control, change tracking                           |
| SQLite     | Comes bundled with better-sqlite3                          |
| jq         | Required only for `sync-global.sh --fix` (config patching) |

### Temporal-backed storage

ADV is moving to a Temporal-backed durable-execution architecture for
change/task/gate state. Production bootstrap is expected to wire a Temporal
client bundle; the legacy JSON+SQLite backend remains only as temporary
compatibility substrate during cutover.

Install the Temporal CLI (for a local dev server):

```bash
brew install temporal     # macOS
# or
curl -sSf https://temporal.download/cli.sh | sh   # Linux
```

Start a local dev server (default loopback address and namespace):

```bash
temporal server start-dev
```

Configure via environment variables (see `plugin/.env.example` — Bun hosts
should review the **Bun out-of-process Temporal worker** section for
`ADV_NODE_PATH` and the `ADV_ALLOW_DEGRADED_FALLBACK` escape hatch):

| Variable                    | Default          | Purpose                                                  |
| --------------------------- | ---------------- | -------------------------------------------------------- |
| `ADV_TEMPORAL_ADDRESS`      | `127.0.0.1:7233` | Temporal frontend address. Non-loopback requires opt-in. |
| `ADV_TEMPORAL_NAMESPACE`    | `default`        | Temporal namespace (regex-validated).                    |
| `ADV_TEMPORAL_ALLOW_REMOTE` | _(unset)_        | Set to `true` to permit non-loopback addresses.          |
| `ADV_TEMPORAL_TASK_QUEUE`   | _(worker-only)_  | Task queue the worker subscribes to.                     |
| `ADV_TEMPORAL_PROJECT_ID`   | _(worker-only)_  | Set internally by the runtime manager.                   |

Activation happens in code by passing a Temporal client bundle into
`createStore({ temporalBundle })`; production bootstrap now owns that wiring.
On a Node plugin host the worker runs in-process. On a Bun plugin host
(opencode's shipping binary) the plugin spawns a Node child process per task
queue via `createOutOfProcessWorker`; see the troubleshooting section below
for details. The legacy file-backed backend is transitional and scheduled for
retirement after migration completes.

### Bun runtime troubleshooting

Opencode ships as a compiled Bun executable. `@temporalio/worker` cannot run
in-process inside Bun: the SDK spawns a Node worker thread whose
`require('@temporalio/common')` fails from Bun's install-cache path. The
plugin works around this by spawning a Node child process instead — but that
requires a Node binary reachable from the plugin host.

**Symptom**: after plugin load, `adv_status` reports
`worker_process_alive: false` OR the session emits (to the debug log, not
stdout) "Temporal worker cannot run under bun. Install Node (v20+) on PATH
or set ADV_NODE_PATH."

**Remediation**:

1. Install Node.js v20 or later. Any install that puts a `node` binary on
   your shell `PATH` works (nvm, system package, asdf, etc.).

   ```bash
   # via nvm (recommended for dev machines)
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
   nvm install --lts

   # or macOS via Homebrew
   brew install node
   ```

2. Verify opencode sees Node on `PATH`:
   ```bash
   which node && node --version
   ```
3. If Node lives at a non-standard path (e.g. a nvm-managed version that
   isn't on the login shell's default `PATH`), set `ADV_NODE_PATH`:
   ```bash
   # in ~/.zshenv or ~/.bashrc
   export ADV_NODE_PATH="$HOME/.nvm/versions/node/v22.21.0/bin/node"
   ```
4. Restart opencode.

If Node is genuinely unavailable and you need a working session immediately,
set `ADV_ALLOW_DEGRADED_FALLBACK=1` to run on the file-backed store. This is
a dev-only escape hatch — Temporal workflows, migrations, and cross-session
workflow state are unavailable in this mode.

#### Health metric: `worker_process_alive`

`adv_status` exposes a `worker_process_alive` boolean alongside
`worker_alive` and `server_alive`. The two fields separate registration state
from runtime state:

| Field                  | Meaning                                                                                                                                            |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `worker_alive`         | A worker object is registered (at least one task queue).                                                                                           |
| `worker_process_alive` | The worker is actually running. For the OOP worker this reflects the Node child process liveness; for the in-process worker it tracks queue count. |

Typical outcomes:

- **`true` / `true`** — worker registered and running. Healthy.
- **`true` / `false`** — worker registered but the child process exited and
  cannot be restarted (exponential-backoff exhausted). Follow the Node-install
  steps above and restart opencode. Check the debug log at
  `$OPEN_CHAD_CACHE_DIR/adv-debug.log` for the crash reason.
- **`false` / `false`** — no worker registered (file-backed degraded mode or
  `ADV_DISABLE_TEMPORAL=1`). Temporal workflows are not running; this is
  expected only in dev/test environments.

> The OOP worker uses exponential backoff (1s / 3s / 10s, max 3 attempts)
> before marking the queue dead.

---

## External Dependencies (MCP Servers and Sub-Agents)

ADV ships the plugin, commands, overlays, and bundled ADV agents (`plan`,
`build`, `adv-researcher`, `engineer`). The `adv-researcher` and `engineer`
agents are synced globally by `sync-global.sh` as bundled global specialists. The `tron` agent remains
repo-local in `.opencode/agents/`. Several agents and commands
reference **external MCP servers** and **shared sub-agents** that are NOT part
of ADV itself. If any of these are missing, ADV still runs — commands have
fallback paths — but the user experience is degraded.

### Required sub-agents (shared with OpenCode global config)

These agents are expected to exist in `~/.config/opencode/agents/` as part of
your OpenCode setup. Some are ADV-shipped bundled globals (`engineer`); others
are external shared agents supplied by your broader OpenCode install. If any
are missing, commands fall back to inline execution or generic `explore`
invocation, which is slower and less specialized.

| Agent       | Used by                                                                       | What it does                                                  |
| ----------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `explore`   | `/adv-review`, `/adv-harden`, `/adv-audit`, `/adv-slop-scan`, `/adv-refactor` | Codebase navigation, finding usages                           |
| `librarian` | `/adv-discover`, `/adv-design`, `/adv-task`, `/adv-review`                    | Documentation and API lookup (Context7, grep.app)             |
| `mechanic`  | `/adv-tron` (optional), `plan` sub-agent spawns                               | System/infra diagnostics                                      |
| `general`   | `/adv-review` (cross-cutting), overlay-managed                                | Multi-step implementation                                     |
| `engineer`  | `/adv-apply` code-writing delegation, `/adv-review` remediation fixes         | Produces structured ENGINEER_REPORT payload for ADV ingestion |

### Optional MCP servers (referenced by agent tool blocks)

These MCP servers are granted to `plan`/`build`/`adv-researcher`
via their `tools:` allowlists. OpenCode silently ignores tool grants for
MCP servers that are not configured — the grants become no-ops. You can
run ADV without any of these, but the following features degrade or become
unavailable:

| MCP server     | Tool prefix   | Used by                                   | Degradation if missing                                                      |
| -------------- | ------------- | ----------------------------------------- | --------------------------------------------------------------------------- |
| lgrep          | `lgrep_*`     | `plan`, `build`, `adv-researcher`, `tron` | Code exploration falls back to `glob`/`grep`/`read` (slower, less semantic) |
| Firecrawl      | `firecrawl_*` | `plan`, `build`                           | Web scraping unavailable; use `webfetch` instead                            |
| Context7       | `context7_*`  | `adv-researcher`                          | Library documentation lookup unavailable                                    |
| Kagi           | `kagi_*`      | `adv-researcher`                          | Web search unavailable                                                      |
| Grep by Vercel | `gh_grep_*`   | `adv-researcher`                          | Cross-repo code example search unavailable                                  |
| arXiv MCP      | `arxiv-mcp_*` | `adv-researcher`                          | Academic paper search unavailable                                           |

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
  "instructions": ["~/.config/opencode/identity.md"],
  "plugin": ["/path/to/Advance/plugin"]
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
- Apply repo-owned managed overlay blocks to shared global agents like `adv`, `general`, `build`, and `plan` without replacing the full file
- Copy ADV skills to `~/.config/opencode/skills/` (the retained cross-cutting skills: `adv-cost-governance-methodology`, `adv-slop-detection`, and `adv-tron`)
- Add the ADV plugin path to `opencode.json` `.plugin` array if missing
- Add `ADV_INSTRUCTIONS.md` to `opencode.json` `.instructions` array if missing
- Back up `opencode.json` before any patches
- Preserve all non-ADV settings (mcp, provider, permissions, etc.)

Top-level ADV slash commands are synced as entrypoint contracts only; they do not include command-level `agent:` routing. Shared-agent orchestration rules are maintained through the overlay blocks and the runtime nesting guard in the ADV plugin.

### Step 2b: Install Git Hooks (Strongly Recommended for ADV Maintainers)

If you are developing ADV itself (not just consuming it), install the tracked git hooks so commits that touch `.opencode/`, `ADV_INSTRUCTIONS.md`, or `skills/` automatically re-sync the global install:

```bash
./scripts/install-git-hooks.sh            # sets core.hooksPath=.githooks, chmod +x
./scripts/install-git-hooks.sh --check    # verify it's installed
./scripts/install-git-hooks.sh --uninstall # revert to default hooks dir
```

Hooks installed:

- `post-commit` — runs `sync-global.sh --fix` when the commit touched a mirrored path (idempotent, ~1s, never blocks).
- `pre-push` — safety-net sync before pushing, in case a commit bypassed the post-commit hook.

Without these, a commit that updates a command contract will land in the repo but the global `~/.config/opencode/` keeps the old copy until `sync-global.sh --fix` is run manually — which causes agents invoking `/adv-*` from other repos to run against stale contracts.

Requires `jq` for config patching (`sudo apt-get install -y jq` or `brew install jq`).

### Step 2b: Manual Setup (Alternative)

If you prefer manual setup, add ADV entries to your `opencode.json`:

```json
{
  "instructions": [
    "~/.config/opencode/identity.md",
    "/path/to/Advance/ADV_INSTRUCTIONS.md"
  ],
  "plugin": ["/path/to/Advance/plugin"]
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

## Cost Governance Rule (P28)

ADV ships a judgment-surfacing governance layer (the `addCostTimeInvestment`
change). The instruction file `.opencode/instructions/cost-governance.md` is
synced automatically by `scripts/sync-global.sh --fix` — no manual copy
needed. However, `rules.yaml` is **user-managed** (not touched by the sync
script) so you need to add rule P28 manually:

1. Open `~/.config/opencode/instructions/rules.yaml`
2. Add the following entry in the `rules:` map (pick any unused Pnn key — P28 recommended):

```yaml
rules:
  # ... existing rules P01-P27 ...

  P28:
    name: cost-governance
    rule: "When an ADV change reaches /adv-apply, surface pending judgment
      calls from change.judgment_calls[] via the question tool before
      executing tasks. Auto-proceed when the list is empty. Doom-loop
      recovery supersedes investment check-in on simultaneous trigger."
    tags: [cost, governance, approval]
    hint: cost_aware
    priority: 9
```

**Rationale for priority 9:** parity with `P05 ship-complete`, `P24 tdd-first`,
`P27 due-diligence` — important user-consult rule, but not priority 10 (which
is reserved for absolute constraints like security). Thresholds are tunable
in `cost-governance.md` YAML frontmatter, so this rule stays guidance-level.

### Opt-in for existing drafts

Governance applies to changes **created after this feature ships** by default
(detected via presence/absence of `change.judgment_calls[]` field). If you
have in-flight draft changes and want them to participate in the governance,
run `/adv-prep <change-id>` on each — this initializes `judgment_calls[]`
(as an empty array if no calls identified) and opts the change in for future
`/adv-apply` Phase 1.5 surfacing.

### Tuning thresholds

Edit the YAML frontmatter in `~/.config/opencode/instructions/cost-governance.md`:

```yaml
thresholds:
  auto: { tasks: 3, retries: 0, elapsed_minutes: 15 }
  escalate: { tasks: 8, retries: 2, elapsed_minutes: 60 }
  hardstop: { tasks: 15, retries: 5, elapsed_minutes: 180 }
```

Restart OpenCode after editing. See `cost-governance.md` body for the full
tuning guide, or `skills/adv-cost-governance-methodology/SKILL.md` for the
canonical methodology.

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

| Option         | Default          | Description                    |
| -------------- | ---------------- | ------------------------------ |
| `name`         | (required)       | Project name                   |
| `version`      | `"0.1.0"`        | Project version                |
| `specs_dir`    | `".adv/specs"`   | Directory for spec files       |
| `changes_dir`  | `".adv/changes"` | Directory for change proposals |
| `archive_dir`  | `".adv/archive"` | Directory for archived changes |
| `docs_dir`     | `"docs/specs"`   | Directory for generated docs   |
| `db_dir`       | `".adv/db"`      | Directory for SQLite cache     |
| `project_file` | `"project.md"`   | Optional project context file  |

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

| Field          | Type   | Required | Description                        |
| -------------- | ------ | -------- | ---------------------------------- |
| `name`         | string | Yes      | Capability identifier (kebab-case) |
| `title`        | string | Yes      | Human-readable title               |
| `purpose`      | string | Yes      | Brief description of capability    |
| `version`      | string | Yes      | Semantic version                   |
| `updated_at`   | string | Yes      | ISO 8601 timestamp                 |
| `requirements` | array  | Yes      | List of requirements               |

### Requirement Schema

| Field       | Type   | Required | Description                                 |
| ----------- | ------ | -------- | ------------------------------------------- |
| `id`        | string | Yes      | Unique ID (format: `rq-{nanoid}`)           |
| `title`     | string | Yes      | Requirement title                           |
| `body`      | string | Yes      | Full requirement text (use MUST/SHOULD/MAY) |
| `priority`  | string | Yes      | `must`, `should`, or `may`                  |
| `tags`      | array  | No       | Categorization tags                         |
| `scenarios` | array  | Yes      | Given/When/Then test scenarios              |

### Scenario Schema

| Field   | Type   | Required | Description                           |
| ------- | ------ | -------- | ------------------------------------- |
| `id`    | string | Yes      | Unique ID (format: `rq-{parent}.{n}`) |
| `title` | string | Yes      | Scenario title                        |
| `given` | array  | Yes      | Preconditions                         |
| `when`  | string | Yes      | Action                                |
| `then`  | array  | Yes      | Expected outcomes                     |

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

### Consolidated Agents (scout → plan, refine → build)

ADV consolidated `scout` into `plan` and `refine` into `build`. If your global `~/.config/opencode/agents/` still has `scout.md` or `refine.md`, run the sync script to clean them up:

```bash
./scripts/sync-global.sh --fix
```

If you customized your global `plan.md` or `build.md`, the sync script only patches the overlay block — it does not edit the `tools:` frontmatter. To restore the new capabilities manually, add these to your customized files:

**Note:** `engineer.md` is synced by this repo as a repo-owned full-file global agent (not overlay-managed). Any local customization in `~/.config/opencode/agents/engineer.md` will be overwritten on each sync. If you need custom behavior, extend via your own agent or overlay instead.

- `plan.md` `tools:` — `webfetch: true`, `firecrawl_firecrawl_scrape: true`, `firecrawl_firecrawl_crawl: true`, `firecrawl_firecrawl_check_crawl_status: true`
- `build.md` `tools:` — `adv_task_update: true`, `adv_task_evidence: true`, `adv_task_tdd: true`, `adv_run_test: true`, `adv_wisdom_add: true`, plus `webfetch: true` and `firecrawl_*: true`

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

| Variable              | Default                      | Description                                         |
| --------------------- | ---------------------------- | --------------------------------------------------- |
| `ADV_DEBUG`           | `"0"`                        | Set to `"1"` for debug logging                      |
| `OPEN_CHAD_CACHE_DIR` | `$TMPDIR` (fallback: `/tmp`) | Directory used for ADV debug log when `ADV_DEBUG=1` |

---

## Upgrading

### From 6-gate to 7-gate workflow

ADV automatically migrates old 6-gate changes (research, prep, implementation, review, harden, signoff) to the new 7-gate model (proposal, discovery, design, planning, execution, acceptance, release) the first time you open them. No action is required.

Mapping:

| Old gate       | New gate   | Notes                                            |
| -------------- | ---------- | ------------------------------------------------ |
| research       | discovery  | preserves status + audit trail (`migrated_from`) |
| prep           | planning   | preserves status + audit trail                   |
| implementation | execution  | preserves status + audit trail                   |
| review         | acceptance | preserves status + audit trail                   |
| harden         | release    | preserves status + audit trail                   |
| signoff        | acceptance | absorbed; recorded in `absorbed_completions`     |
| (new) proposal | proposal   | inserted for in-flight changes                   |
| (new) design   | design     | inserted for in-flight changes                   |

New changes start directly in the 7-gate model.

---

## Quick Reference

### Available Commands

**Core 7-gate workflow**

| Command                   | Purpose                                                                   |
| ------------------------- | ------------------------------------------------------------------------- |
| `/adv-status`             | Project overview                                                          |
| `/adv-proposal <summary>` | Extract problem statement and confirm with user                           |
| `/adv-discover <id>`      | Gather context, identify objectives, and confirm agreement                |
| `/adv-design <id>`        | Validate architecture decisions, produce strategy, and present for review |
| `/adv-prep <id>`          | Gap analysis and task shaping (from validated design)                     |
| `/adv-apply <id>`         | Implement with TDD                                                        |
| `/adv-review <id>`        | Review deliverables and record user sign-off                              |
| `/adv-harden <id>`        | Release-stage quality hardening                                           |
| `/adv-archive <id>`       | Archive completed change and apply spec deltas                            |

**Fast-track and auxiliary**

| Command                   | Purpose                                                                                                                            |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `/adv-task`               | Fast-track a discussed change through proposal → planning                                                                          |
| `/adv-validate <id>`      | Validate change against specs                                                                                                      |
| `/adv-clarify`            | Clarify ambiguous requirements                                                                                                     |
| `/adv-audit [capability]` | Spec/implementation drift check                                                                                                    |
| `/adv-slop-scan [path]`   | Scan for AI slop patterns                                                                                                          |
| `/adv-refactor <id>`      | Refresh a stale proposal                                                                                                           |
| `/adv-coordinate`         | Detect cross-change conflicts                                                                                                      |
| `/adv-improve`            | Suggest spec/implementation improvements and persist a reusable research pack under `docs/*-prep.md` (consumed by `/adv-discover`) |
| `/adv-tron [target]`      | Investigate codebase structure and suggest agenda candidates                                                                       |

Tradeoff-heavy decisions inside ADV flows use inline analysis by default. For deeper analysis, agents can load the prioritizer skill via `skill("prioritizer")` which provides structured criteria question templates and decision map guidance.

Parallel ADV scanners follow the same single-level delegation rule as other ADV orchestration: commands such as `/adv-slop-scan` may spawn first-level workers, but those workers must complete inline and must not spawn additional sub-agents or invoke `/adv-*` commands.

### Available Tools

**Project & Specs**

| Tool                  | Purpose                                                        |
| --------------------- | -------------------------------------------------------------- |
| `adv_status`          | Project overview: specs, active changes, recommendations       |
| `adv_project_context` | Read project.md context file                                   |
| `adv_spec`            | List, show, or search specs (`action: "list"/"show"/"search"`) |

**Changes**

| Tool                       | Purpose                                                                |
| -------------------------- | ---------------------------------------------------------------------- |
| `adv_change_list`          | List active changes (with `includeArchived`/`includeClosed` filters)   |
| `adv_change_show`          | Get full change details including tasks and deltas                     |
| `adv_change_create`        | Create a new change proposal                                           |
| `adv_change_update`        | Update proposal/problem-statement/agreement/design for existing change |
| `adv_change_validate`      | Validate change against specs and check for conflicts                  |
| `adv_change_close`         | Close an active change (cancelled/superseded/not_planned)              |
| `adv_change_archive`       | Archive a completed change (applies spec deltas)                       |
| `adv_change_update_issues` | Add/remove GitHub issue URLs linked to a change                        |

**Tasks**

| Tool                      | Purpose                                                       |
| ------------------------- | ------------------------------------------------------------- | -------- |
| `adv_task_list`           | List tasks for a change (with optional status filter)         |
| `adv_task_show`           | Get full task details by ID (includes parent changeId)        |
| `adv_task_ready`          | Get unblocked pending tasks ready for work                    |
| `adv_task_add`            | Add a new task to a change                                    |
| `adv_task_update`         | Update task status (pending/in_progress/done)                 |
| `adv_task_cancel`         | Cancel tasks with required user approval                      |
| `adv_task_evidence`       | Record TDD evidence (red/green phase proof)                   |
| `adv_task_tdd`            | Set or inspect TDD state for a task (`action=set              | status`) |
| `adv_task_reclassify_tdd` | Reclassify TDD intent after planning gate (requires approval) |

**Gates**

| Tool                | Purpose                                     |
| ------------------- | ------------------------------------------- |
| `adv_gate_status`   | Get gate status for a change (all 7 gates)  |
| `adv_gate_complete` | Mark a gate as complete (enforces sequence) |

**Testing**

| Tool           | Purpose                                              |
| -------------- | ---------------------------------------------------- |
| `adv_run_test` | Run a test command and record result as TDD evidence |

**Wisdom**

| Tool                      | Purpose                                               |
| ------------------------- | ----------------------------------------------------- |
| `adv_wisdom_add`          | Add a learning entry to a change (optionally promote) |
| `adv_wisdom_list`         | List all wisdom entries for a change                  |
| `adv_project_wisdom_list` | List project-level promoted wisdom entries            |

**Agenda**

| Tool                    | Purpose                                |
| ----------------------- | -------------------------------------- |
| `adv_agenda_list`       | List agenda items (with status filter) |
| `adv_agenda_add`        | Add a quick work item to the agenda    |
| `adv_agenda_start`      | Mark an agenda item as active          |
| `adv_agenda_complete`   | Mark an agenda item as done            |
| `adv_agenda_cancel`     | Cancel an agenda item                  |
| `adv_agenda_prioritize` | Change priority of an agenda item      |
| `adv_agenda_evidence`   | Record TDD evidence for an agenda item |

---

## Support

- **Issues**: https://github.com/Sharper-Flow/Advance/issues
- **Documentation**: See README.md and ADV_INSTRUCTIONS.md
