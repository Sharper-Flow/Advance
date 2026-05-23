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
8. [ADV CLI (`bin/adv`)](#adv-cli-binadv)
9. [Migration from OpenSpec](#migration-from-openspec)
10. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required

| Dependency   | Version            | Check Command        |
| ------------ | ------------------ | -------------------- |
| Node.js      | 20.x or higher     | `node --version`     |
| pnpm         | 10.x (recommended) | `pnpm --version`     |
| OpenCode CLI | 1.15.5 or newer    | `opencode --version` |

`pnpm` must be on `PATH` when worktrees are created: `.opencode/worktree.jsonc`
uses a `postCreate` hook to run `pnpm install --frozen-lockfile -C plugin` in
new ADV worktrees.

### Optional

| Dependency        | Purpose                                                                                                                                 |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Git               | Version control, change tracking                                                                                                        |
| Temporal CLI      | Local dev server for ADV's Temporal-backed runtime                                                                                      |
| jq                | Required only for `deploy-local.sh --fix` (config patching)                                                                             |
| rsync             | Required for `deploy-local.sh` runtime plugin deployment                                                                                |
| GitHub CLI (`gh`) | Required for `/adv-triage` and any ADV command that reads/writes GitHub issues or Projects v2. See **GitHub CLI authentication** below. |

### Temporal-backed storage

ADV uses a Temporal-backed durable-execution architecture for change/task/gate
state. Runtime storage is Temporal-only; the old SQLite-backed legacy store was
removed. A disk-only substrate remains for markdown/JSON artifacts and recovery
utilities, not as a runtime fallback.

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

#### Persistent dev-server storage (recommended)

The default `temporal server start-dev` invocation runs the embedded SQLite
backend in **ephemeral mode** — when you stop the server, its database is
discarded. ADV registers custom search attributes (`AdvProjectId`,
`AdvChangeId`, `AdvChangeStatus`, `AdvActiveGate`, `AdvDoomLoopActive`) on
each session start; on an ephemeral server those registrations are lost on
every restart, and partial-failure states can accumulate as wrong-type
attribute leftovers across sessions. Persisting the dev-server SQLite file
keeps the registrations stable across restarts and avoids re-registration
churn.

Recommended path (cross-platform):

| OS    | Path                                                                                       |
| ----- | ------------------------------------------------------------------------------------------ |
| Linux | `$XDG_DATA_HOME/temporal/dev-server.db` (fallback `~/.local/share/temporal/dev-server.db`) |
| macOS | `~/Library/Application Support/temporal/dev-server.db`                                     |

Example (Linux/XDG):

```bash
mkdir -p ~/.local/share/temporal
temporal server start-dev \
  --db-filename ~/.local/share/temporal/dev-server.db
```

Example (macOS):

```bash
mkdir -p "$HOME/Library/Application Support/temporal"
temporal server start-dev \
  --db-filename "$HOME/Library/Application Support/temporal/dev-server.db"
```

The minimal `temporal server start-dev` command remains valid for one-off
ephemeral testing (CI, throwaway sandboxes), but the persistent variant is
the recommended default for ongoing development.

Configure via environment variables (see `plugin/.env.example` — Bun hosts
should review the **Bun out-of-process Temporal worker** section for
`ADV_NODE_PATH`):

| Variable                    | Default          | Purpose                                                  |
| --------------------------- | ---------------- | -------------------------------------------------------- |
| `ADV_TEMPORAL_ADDRESS`      | `127.0.0.1:7233` | Temporal frontend address. Non-loopback requires opt-in. |
| `ADV_TEMPORAL_NAMESPACE`    | `default`        | Temporal namespace (regex-validated).                    |
| `ADV_TEMPORAL_ALLOW_REMOTE` | _(unset)_        | Set to `true` to permit non-loopback addresses.          |
| `ADV_TEMPORAL_TASK_QUEUE`   | _(worker-only)_  | Task queue the worker subscribes to.                     |
| `ADV_TEMPORAL_TASK_QUEUES`  | _(worker-only)_  | Comma-separated queues for multi-queue child mode.       |
| `ADV_TEMPORAL_MULTI_QUEUE`  | _(worker-only)_  | Set internally to `1` for multi-queue child mode.        |
| `ADV_TEMPORAL_PROJECT_ID`   | _(worker-only)_  | Set internally by the runtime manager.                   |

Activation happens in code by passing a Temporal client bundle into
`createStore({ temporalBundle })`; production bootstrap owns that wiring. On a
Node plugin host the worker runs in-process. On a Bun plugin host (opencode's
shipping binary) the plugin spawns a Node child process. Multi-queue child mode
is configured internally with `ADV_TEMPORAL_MULTI_QUEUE=1` and
`ADV_TEMPORAL_TASK_QUEUES`; users normally only set `ADV_NODE_PATH` when Node is
not on the plugin host's `PATH`. There is no legacy file-backed runtime
fallback.

### GitHub CLI authentication

ADV agents perform GitHub operations (read/write issues, manage Projects v2 boards, post comments, open PRs) via the `gh` CLI. The token MUST be a **user-global** OAuth token that works for **every repo and every Projects v2 board** any ADV agent will operate on — including this repo and all `target_path` cross-project peers.

#### Install `gh`

```bash
brew install gh                      # macOS
sudo apt install gh                  # Debian/Ubuntu
sudo dnf install gh                  # Fedora
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg   # see cli.github.com for full Linux instructions
```

#### Authenticate with the required scopes

```bash
gh auth login --scopes "repo,project,read:org,workflow"
```

Required token scopes:

| Scope      | Why ADV needs it                                                                             |
| ---------- | -------------------------------------------------------------------------------------------- |
| `repo`     | Read/write issues, comments, PRs across every repo ADV touches (incl. private)               |
| `project`  | Read/write Projects v2 boards (`/adv-triage` storage of truth: typed Value/RROE/Effort/WSJF) |
| `read:org` | Resolve org membership, list org-owned projects, find ADV peer repos                         |
| `workflow` | Inspect Actions workflow runs (used by external conformance gate during `/adv-archive`)      |

If you authenticated previously without one of these scopes, refresh in place:

```bash
gh auth refresh -s repo,project,read:org,workflow
```

#### Verify

```bash
gh auth status
```

Expected output includes a `gho_*` token line and a scopes line containing at minimum `'project', 'read:org', 'repo', 'workflow'`. ADV `/adv-triage` will refuse to run if any required scope is missing.

#### Token-coverage rule (critical)

The token MUST cover **all** projects ADV will operate on, not just the project where you ran `gh auth login`. `gho_*` OAuth tokens from `gh auth login` are user-global by design — one token authenticates every repo and every Projects v2 board the GitHub user has access to.

| Scenario                                 | Required action                                                                          |
| ---------------------------------------- | ---------------------------------------------------------------------------------------- |
| Personal repos owned by your GitHub user | Default `gh auth login` is sufficient                                                    |
| Repos owned by a GitHub organization     | Org admin must approve the GitHub CLI app under Settings → Third-party access            |
| Org-owned Projects v2 boards             | Same org-app approval — `project` scope alone is not enough without app approval         |
| Private repos / forks                    | `repo` scope covers private repos the user can already access via the web UI             |
| Multiple machines (laptop, devbox, CI)   | Each machine needs its own `gh auth login`; `gho_*` tokens are not transferable          |
| Fine-grained PAT instead of OAuth        | Must be scoped to **all** orgs and repos ADV agents will touch — coarse OAuth is simpler |

#### Org-access wall (common gotcha)

If `/adv-triage` reports `gh: not found`, `403`, or `Resource not accessible by integration` when creating a project or adding an item, the token is fine but the **GitHub CLI app** is not approved for that org. Two fixes:

1. Org admin: GitHub web UI → Org → Settings → Third-party access → Approve `GitHub CLI`.
2. If org approval is not possible: create the project under your **personal** account (`@me`) instead, and link the org repo to it via `gh project link <N> --owner @me --repo <org>/<repo>`.

#### Multi-machine setup

`gho_*` tokens are bound to the machine that ran `gh auth login`. Repeat the login (or copy the `~/.config/gh/hosts.yml` file with care) on every machine an ADV agent will run from — devboxes, CI runners, alternate laptops. There is no shared/global token store; each machine authenticates independently.

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

If Node is genuinely unavailable, install Node (v20+) following the steps
above. ADV is Temporal-only at runtime — there is no file-backed fallback.

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
- **`false` / `false`** — no worker registered (init failure or Temporal
  not yet started). Temporal workflows are not running; check init logs at
  `$OPEN_CHAD_CACHE_DIR/adv-debug.log` for the failure reason.

> The OOP worker uses exponential backoff (1s / 3s / 10s, max 3 attempts)
> before marking the queue dead.

---

## External Dependencies (MCP Servers and Sub-Agents)

ADV ships the plugin, commands, overlays, and bundled ADV agents (`plan`,
`build`, `adv-researcher`, `adv-engineer`, `adv-reviewer`). The `adv-researcher`,
`adv-engineer`, and `adv-reviewer` agents are synced globally by `deploy-local.sh`
as bundled global specialists. The `adv-tron` agent remains
repo-local in `.opencode/agents/`. All ADV-shipped sub-agents use the `adv-<name>` naming convention. Several agents and commands
reference **external MCP servers** and **shared sub-agents** that are NOT part
of ADV itself. If any of these are missing, ADV still runs — commands have
fallback paths — but the user experience is degraded.

### Required sub-agents (shared with OpenCode global config)

These agents are expected to exist in `~/.config/opencode/agents/` as part of
your OpenCode setup. Some are ADV-shipped bundled globals (`adv-engineer`); others
are external shared agents supplied by your broader OpenCode install. If any
are missing, commands fall back to inline execution or generic `explore`
invocation, which is slower and less specialized.

| Agent            | Used by                                                                       | What it does                                                                                                    |
| ---------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `explore`        | `/adv-review`, `/adv-harden`, `/adv-audit`, `/adv-slop-scan`, `/adv-refactor` | Codebase navigation, scoped read-only scans                                                                     |
| `adv-researcher` | `/adv-discover`, `/adv-design`, `/adv-research`, `/adv-task`, `/adv-review`   | Documentation, API, and code-example research (Context7, Exa, searchcode, webfetch) AND architecture validation |
| `general`        | `/adv-review` (cross-cutting), overlay-managed                                | Multi-step verification                                                                                         |
| `adv-engineer`   | `/adv-apply` code-writing delegation, `/adv-review` remediation fixes         | Structured ENGINEER_REPORT payload for ADV ingestion                                                            |
| `adv-reviewer`   | `/adv-review`, `/adv-harden`                                                  | Independent review/harden analysis with scoped repo-write remediation; structured REVIEWER_REPORT               |

### Optional MCP servers (referenced by agent tool blocks)

These MCP servers are granted to `plan`/`build`/`adv-researcher`
via their `tools:` allowlists. OpenCode silently ignores tool grants for
MCP servers that are not configured — the grants become no-ops. You can
run ADV without any of these, but the following features degrade or become
unavailable:

| MCP server | Allowlist prefix / callable examples                                                          | Used by                                       | Degradation if missing                                                      |
| ---------- | --------------------------------------------------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------- |
| [lgrep](https://github.com/Sharper-Flow/lgrep) | `lgrep_*` grants; call `lgrep_search_semantic`, `lgrep_search_symbols`, `lgrep_search_text` | `plan`, `build`, `adv-researcher`, `adv-tron` | Code exploration falls back to `glob`/`grep`/`read` (slower, less semantic) |
| Firecrawl  | `firecrawl_*` grants; call `firecrawl_firecrawl_scrape`, `firecrawl_firecrawl_crawl`          | `plan`, `build`                               | Web scraping unavailable; use `webfetch` instead                            |
| Context7   | `context7_*` grants; call `context7_resolve-library-id`, `context7_query-docs`                | `adv-researcher`                              | Library documentation lookup unavailable                                    |
| Exa        | `exa_*` grants; call `exa_web_search_exa`, `exa_web_search_advanced_exa`, `exa_web_fetch_exa` | `adv-researcher`                              | Web search unavailable                                                      |
| searchcode | `searchcode_*` grants; call `searchcode_code_search`, `searchcode_code_get_file`              | `adv-researcher`                              | Public-repo code example search unavailable                                 |
| arXiv MCP  | `arxiv-mcp_*` grants; call exact names from active schema                                     | `adv-researcher`                              | Academic paper search unavailable                                           |

Tool calls must use exact active-schema names. Allowlist prefixes are grants only, not callable names; do not normalize `searchcode_code_search` to `code_search`.

Configure these MCP servers in your `opencode.json` `mcp` section per each
server's documentation. The ADV sync script does not install or validate
MCP servers — that's your responsibility.

### Minimum viable setup

If you want to run ADV with the smallest possible footprint:

1. OpenCode CLI
2. Node.js 20+, pnpm 10+
3. ADV plugin built (`plugin/dist/index.js` present)
4. `~/.config/opencode/agents/` contains `explore` at minimum (plus `adv-researcher`, `adv-engineer`, `adv-reviewer` after `scripts/deploy-local.sh --fix`)
5. No external MCP servers required — agents fall back to built-in tools

ADV itself will function. Research and review commands will be noticeably
slower without lgrep and Context7, but they will not fail.

---

## Installation

### User install (recommended)

Install the latest published GitHub Release into OpenCode:

```bash
curl -fsSL https://github.com/Sharper-Flow/Advance/releases/latest/download/install.sh | bash
```

The installer resolves the latest Release, downloads `advance-v*.tar.gz`, verifies
`SHA256SUMS.txt`, validates the archive, then runs
`bash scripts/deploy-local.sh --fix` from the extracted artifact. That release
artifact contains the plugin runtime, command contracts, bundled agents,
overlays, skills, docs, and root metadata required for user installation.

To pin a version, download the installer and set `ADV_VERSION=`:

```bash
curl -fsSL https://github.com/Sharper-Flow/Advance/releases/latest/download/install.sh -o /tmp/advance-install.sh
ADV_VERSION=v0.11.8 bash /tmp/advance-install.sh
```

### Manual release artifact install

Use this path when you want to inspect files before running the sync script:

```bash
VERSION=v0.11.8
curl -fsSLO "https://github.com/Sharper-Flow/Advance/releases/download/${VERSION}/advance-${VERSION}.tar.gz"
curl -fsSLO "https://github.com/Sharper-Flow/Advance/releases/download/${VERSION}/SHA256SUMS.txt"
sha256sum --check --ignore-missing SHA256SUMS.txt
tar -xzf "advance-${VERSION}.tar.gz"
cd "advance-${VERSION}"
bash scripts/deploy-local.sh --fix
```

### Maintainer/developer setup

Use a source checkout when you are changing Advance itself or need local tests.

#### Step 1: Clone the repository

```bash
git clone https://github.com/Sharper-Flow/Advance.git
cd Advance
```

#### Step 2: Install plugin dependencies

```bash
cd plugin
pnpm install
```

#### Step 3: Build the plugin

```bash
pnpm build
```

#### Step 4: Verify the source checkout

```bash
pnpm test
# Expected: 1356+ tests passing
```

#### Step 5: Sync the local checkout into OpenCode

```bash
cd ..
./scripts/deploy-local.sh --fix
```

---

## OpenCode Configuration

### Step 1: Create or Update OpenCode Config

ADV is normally registered from the stable deployed runtime plugin path that
`scripts/deploy-local.sh --fix` maintains:

```json
{
  "instructions": ["~/.config/opencode/identity.md"],
  "plugin": ["~/.local/share/Advance/plugin"]
}
```

For manual/dev-only setup you may point at a source checkout plugin directory,
but the recommended flow below keeps OpenCode loading the stable deployed copy.

### Step 2: Run the Sync Script (Recommended)

The easiest way to set up and update ADV is the sync script. It rebuilds and
syncs the runtime plugin when needed, copies commands, agents, and skills to the
global config, and validates (or patches) `opencode.json`:

```bash
# Check what needs updating (config only, no file changes)
./scripts/deploy-local.sh --check

# Sync assets + auto-patch opencode.json if ADV entries are missing
./scripts/deploy-local.sh --fix

# Sync assets only, report config issues without patching
./scripts/deploy-local.sh

# Preview managed overlay/config changes without writing
./scripts/deploy-local.sh --dry-run --diff
```

The `--fix` flag will:

- Rebuild `plugin/dist` when it is missing or older than plugin build inputs
- Refuse to deploy stale dist if the build fails or freshness is still unproven
- Sync `plugin/` to the stable runtime path `~/.local/share/Advance/plugin/`
- Copy all `adv-*.md` commands to `~/.config/opencode/command/`
- Copy the repo-owned `adv` runtime agent as a full file and leave repo-local-only agents in-tree
- Apply repo-owned managed overlay blocks to shared global agents like `general`, `build`, and `plan` without replacing the full file
- Copy ADV skills to `~/.config/opencode/skills/` (the retained cross-cutting skills: `adv-slop-detection` and `adv-tron`)
- Add the ADV plugin path to `opencode.json` `.plugin` array if missing
- Remove legacy global `ADV_INSTRUCTIONS.md` entries from `opencode.json` `.instructions`; the lean `adv` runtime prompt carries runtime-critical protocol without a global instruction entry
- Back up `opencode.json` before any patches
- Preserve all non-ADV settings (mcp, provider, permissions, etc.)

Top-level ADV slash commands are synced as entrypoint contracts only; they do not include command-level `agent:` routing. Shared-agent orchestration rules are maintained through the overlay blocks and the runtime nesting guard in the ADV plugin.

### Step 2b: Install Git Hooks (Strongly Recommended for ADV Maintainers)

If you are developing ADV itself (not just consuming it), install the tracked git hooks so commits that touch `.opencode/`, `ADV_INSTRUCTIONS.md`, `skills/`, `plugin/src/`, or `scripts/deploy-local.sh` automatically re-sync the global install:

```bash
./scripts/install-git-hooks.sh            # sets core.hooksPath=.githooks, chmod +x
./scripts/install-git-hooks.sh --check    # verify it's installed
./scripts/install-git-hooks.sh --uninstall # revert to default hooks dir
```

Hooks installed:

- `post-commit` — runs `deploy-local.sh --fix` when the commit touched a mirrored path (idempotent, ~1s, never blocks).
- `pre-push` — safety-net sync before pushing, in case a commit bypassed the post-commit hook.

Without these, a commit that updates a command contract or plugin source will land in the repo but the global install keeps the old copy until `deploy-local.sh --fix` is run manually — which causes agents invoking `/adv-*` from other repos to run against stale contracts or stale runtime plugin code.

Requires `jq` for config patching (`sudo apt-get install -y jq` or `brew install jq`) and `rsync` for runtime plugin deployment (`sudo apt-get install -y rsync` or `brew install rsync`).

### Step 2b: Manual Setup (Alternative)

If you prefer manual setup, add the ADV plugin path to your `opencode.json`.
Do **not** add `ADV_INSTRUCTIONS.md` to global `instructions[]`; `deploy-local.sh`
keeps that protocol scoped to the ADV runtime agent so non-ADV agents do not pay
the prompt cost.

```json
{
  "instructions": ["~/.config/opencode/identity.md"],
  "plugin": ["/path/to/Advance/plugin"]
}
```

Legacy migration: if your config already contains `/path/to/Advance/ADV_INSTRUCTIONS.md`
or `~/.config/opencode/instructions/ADV_INSTRUCTIONS.md`, run
`./scripts/deploy-local.sh --fix`. The script removes only ADV instruction paths,
preserves unrelated global instructions, and syncs the lean `adv` runtime agent
that carries runtime-critical ADV protocol. Manual setups that skip the sync
script must copy `.opencode/agents/adv.md` themselves to install the supported
ADV-agent runtime prompt.

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

## Clean-Not-Minimal Rule (P29)

ADV recommends a clarity-first design rule that explicitly counters the
agent failure mode of "minimize touch / minimize blast radius at the cost
of structural quality." Like P28, `rules.yaml` is **user-managed** so this
rule must be added manually:

1. Open `~/.config/opencode/instructions/rules.yaml`
2. Add the following entry in the `rules:` map (P29 recommended):

```yaml
rules:
  # ... existing rules ...

  P29:
    name: clean-not-minimal
    rule: Optimize for clarity and maintainability, not for the smallest
      possible diff. When a wider architectural change produces a cleaner
      result, surface it — do not suppress better ideas to minimize blast
      radius or touch. Avoid speculative features and abstractions for
      hypothetical future needs (YAGNI), but do not confuse YAGNI with
      refusing necessary structural work or withholding stronger design
      proposals.
    tags: [clarity, design, simplicity, architecture, yagni]
    hint: clean_not_minimal
    priority: 7
```

**Rationale for priority 7:** parity with `P11 lifecycle`, `P12 dependencies`,
`P13 minimize-debt`, `P14 observability` — important design guidance that
should consistently win against pure size/diff-minimization heuristics, but
not at the priority-9/10 tier reserved for security and safety constraints.

**Why this rule exists:** earlier wording (`smallest-reversible-solution`)
caused agents to pattern-match on "smallest" and "reversible," reading the
rule as "minimize touch / avoid wider architectural changes." That suppressed
legitimate proposals to refactor or restructure when the cleaner answer was
larger. The rewrite keeps the YAGNI/anti-speculation intent but explicitly
instructs agents to **surface** wider architectural changes when they
produce a cleaner result.

Restart OpenCode after editing.

---

## Docs-Before-Probing Rule (P30) + P16 Strengthening

ADV recommends an external-docs-first rule that counters the agent failure
mode of "probe library behavior via tests / read library source / extrapolate
from existing repo patterns instead of just reading the official docs."
Pairs with a scope-broadening rewrite of P16 to cover both internal and
external documentation.

Like P28 and P29, `rules.yaml` is **user-managed** so these changes must be
applied manually.

### Step 1: Strengthen P16

Replace the existing `P16` block with the following (broadens scope from
internal-only to internal + external docs; priority and name unchanged):

```yaml
P16:
  name: docs-first
  rule: Consult existing documentation — internal (repo docs, ADRs,
    workflows) and external (official library, framework, API, and
    vendor docs via Context7 or canonical sources) — before changing
    behavior or implementing against unfamiliar surfaces. Keep
    documentation current and remove stale content.
  tags: [docs, governance, external-docs]
  hint: docs_check
  priority: 6
```

### Step 2: Add P30

Add the following entry in the `rules:` map (P30 recommended):

```yaml
P30:
  name: docs-before-probing
  rule: When the behavior, API surface, or correct usage of an external
    library, framework, language feature, or service is unclear, consult
    its official documentation (via Context7, official site, or vendor
    docs) BEFORE writing probe tests, reading library source, or
    extrapolating from existing repo usage. Probing is a fallback when
    authoritative docs are missing, ambiguous, or contradicted by
    observed behavior — not the first move.
  tags: [docs, research, external-docs, efficiency]
  hint: docs_before_probing
  priority: 8
```

**Rationale for priority 8:** parity with `P07 verify`, `P08 clarify`,
`P25 related-scan` — strong enough to consistently win against "just write
a test to figure it out" heuristics, but below `P27 due-diligence` (9) and
the priority-10 absolute-constraint tier (security, collaboration,
timeouts).

**Why these rules exist:** agents frequently probe external library
behavior via test scripts, source reads, or extrapolation from existing
repo patterns when the official docs already answer the question
authoritatively. This wastes tokens, produces less reliable answers, and
risks codifying incorrect assumptions. P16 (strengthened) sets the broader
"docs first" stance covering both repo and external surfaces; P30 catches
the specific anti-pattern of probing-before-docs and makes Context7 / official
docs the mandatory first move when external behavior is unclear.

Restart OpenCode after editing.

---

## Thoroughness Rule (P31) + P19 Reinforcement

ADV recommends a priority-9 anti-laziness rule that forbids agents from
making decisions based on minimizing tokens, time, turn count, or effort.
Pairs with a clarifying carve-out on P19 simplicity to close the most
common rationalization escape hatch ("the simple solution suffices, so
I'll skip the research/tests/related-scan").

Like P28-P30, `rules.yaml` is **user-managed** so these changes must be
applied manually.

### Step 1: Strengthen P19 with a thoroughness carve-out

Replace the existing `P19` block with the following (priority and name
unchanged; adds explicit clarification that simplicity governs the
solution, not the effort invested):

```yaml
P19:
  name: simplicity
  rule: Keep code simple, clear, and well-named; prefer simple over
    complex, complex over complicated; start with minimal solutions.
    Simplicity refers to the SOLUTION (final code, interfaces,
    abstractions) — not the WORK INVESTED to get there. Do not invoke
    simplicity, KISS, or YAGNI to justify skipping research, tests,
    verification, related-scan, or other thorough-work obligations
    (see P31).
  tags: [clean, simplicity, design]
  hint: keep_it_simple
  priority: 5
```

### Step 2: Add P31

Add the following entry in the `rules:` map (P31 recommended):

```yaml
P31:
  name: thoroughness
  rule: Never make decisions based on minimizing tokens, time, turn
    count, or agent effort. Choose the correct answer over the
    convenient one. If thoroughness requires more research, more tests,
    more clarification, more verification, or wider scope investigation,
    do it — even when a shortcut would technically pass. Token/turn
    budgets are bookkeeping; user outcome quality is the objective.
    Laziness manifests as — skipping docs because "I probably know,"
    skipping related-scan because "it's probably fine," accepting the
    first passing solution without considering better alternatives,
    suppressing surface-able ideas to save turns, declaring done before
    completeness is verified, choosing the cheap diagnosis over the
    correct one. None of these are acceptable, regardless of token
    cost. See P19 — simplicity governs the solution, not the effort.
  tags: [quality, thoroughness, correctness, agent-reasoning]
  hint: never_lazy
  priority: 9
```

**Rationale for priority 9:** parity with `P05 ship-complete`, `P24
tdd-first`, `P27 due-diligence`. Foundational to
agent reasoning and user-outcome quality, but not at the priority-10 tier
reserved for absolute constraints (security, collaboration, timeouts).

**Why these rules exist together:** agents pattern-match on concrete
examples and rationalize away abstract principles. A standalone P31
leaves the most common rationalization hatch open: "the simple solution
suffices per P19, so the extra research/tests/scan aren't needed." The
P19 carve-out shuts that loop by explicitly distinguishing solution
simplicity (good) from effort minimization (forbidden by P31). Two
reinforcing rules with concrete anti-pattern examples (skip docs / skip
related-scan / accept first-pass / suppress better ideas / declare done
prematurely / cheap-diagnosis-over-correct) are harder to rationalize
past than either rule alone.

Restart OpenCode after editing.

---

## Structural Correctness Rule (P33)

ADV recommends a priority-9 structural-correctness rule that counters the
agent failure mode of using fuzzy heuristics, prose conventions, or "agent
judgment" as the source of truth for correctness. It is especially relevant
to ADV surfaces such as gate completion, task classification, spec compliance,
and backlog triage: heuristics can suggest candidates, but typed state,
validators, explicit user assignments, and exact refs must decide.

Like P29-P31, `rules.yaml` is **user-managed** so this change must be
applied manually.

Add the following entry in the `rules:` map (P33 recommended):

```yaml
P33:
  name: structural-correctness
  rule: Make correctness structural before heuristic. Prefer
    machine-checkable mechanisms—types, schemas, parsers, state machines,
    invariants, contracts, database constraints, generated validators, and
    tests—over heuristic inference or prose-only rules. Fully recognize
    and normalize untrusted input at boundaries before processing it. Use
    heuristics only for discovery, ranking, triage, or advisory guidance;
    never as the sole authority for correctness, security, persistence,
    workflow state, gate completion, or spec compliance. If a heuristic is
    unavoidable, isolate it, document assumptions, add deterministic
    guardrails, and verify it with edge-case or property-based tests.
  tags: [correctness, architecture, validation, determinism, heuristics]
  hint: structural_before_heuristic
  priority: 9
```

**Rationale for priority 9:** parity with `P05 ship-complete`, `P24
tdd-first`, `P27 due-diligence`, and `P31 thoroughness`. This rule governs
correctness boundaries, but leaves priority-10 for absolute constraints
(security, collaboration, timeouts).

**Why this rule exists:** web research converged on the same pattern from
multiple angles: parse/recognize inputs before processing (LangSec), make
illegal states unrepresentable, enforce domain invariants, prefer allowlist
validation at trusted boundaries, and use invariant/property tests for broad
edge-case coverage. The ADV translation is: structural state and validators
own correctness; heuristics only assist discovery and ranking.

Restart OpenCode after editing.

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
  "docs_dir": "docs/specs"
}
EOF

# Optional archive finalization overrides (defaults shown):
# "archive_mode": "direct" merges completed changes into the default branch.
# Use "pr" only for repositories that require PR-based shipping.
# "auto_push": true attempts `git push origin {default-branch}` after merge.

# Create directory structure
mkdir -p .adv/specs .adv/changes .adv/archive docs/specs

# Add to .gitignore
cat >> .gitignore << 'EOF'
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
  "docs_dir": "docs/specs"
}
EOF

# Optional archive finalization overrides (defaults shown):
# "archive_mode": "direct" merges completed changes into the default branch.
# Use "pr" only for repositories that require PR-based shipping.
# "auto_push": true attempts `git push origin {default-branch}` after merge.

# Create required directories
mkdir -p .adv/specs .adv/changes .adv/archive docs/specs

# Update .gitignore
echo -e "\n# ADV scratch files\ntemp/" >> .gitignore
```

### Final auth check (both options)

Before the first ADV session, confirm GitHub CLI auth is healthy and the token covers every project this machine's ADV agents will touch (this repo + all `target_path` cross-project peers):

```bash
gh auth status                       # token must show project + repo + read:org + workflow scopes
gh repo view --json nameWithOwner    # must succeed for THIS repo
gh project list --owner @me --limit 1 # must succeed (creates if missing later)
```

If `gh auth status` is missing scopes, run `gh auth refresh -s repo,project,read:org,workflow`. If `gh repo view` fails on an org repo, the org admin must approve the GitHub CLI app (see **GitHub CLI authentication** above).

### GitHub GraphQL Budget

GitHub enforces two separate rate-limit budgets:

| Budget      | Scope             | Limit          |
| ----------- | ----------------- | -------------- |
| REST / Core | Per user per hour | 5,000 requests |
| GraphQL     | Per user per hour | 5,000 points   |

Projects v2 operations (`gh project item-list`, `gh api graphql` against ProjectV2 types) consume the **GraphQL** budget. Issue operations (`gh issue list`, `gh issue create`) consume the **REST** budget.

`/adv-triage` uses batched GraphQL mutations (`updateProjectV2ItemFieldValue` with aliased fields) to minimize budget consumption: 4 field updates per HTTP request instead of 1. For N features needing scoring, the command issues approximately N batch requests + 2 reads.

**Multi-session note:** All `opencode` sessions on the same machine share the same `gh auth` token and its GraphQL budget (rate limit is per-user, not per-token). Plan for N concurrent triage runs sharing one 5,000/hr pool.

---

## Directory Structure

After setup, your project should have this structure:

```
your-project/
├── project.json              # ADV configuration (required)
├── .gitignore                # Should exclude temp/
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
├── docs/specs/               # Auto-generated documentation (user-facing)
│   └── {capability}.md
│
└── temp/                     # Brainstorm working documents (gitignored)
    └── brainstorm-*.md
```

### Configuration Options

| Option         | Default          | Description                                                                                          |
| -------------- | ---------------- | ---------------------------------------------------------------------------------------------------- |
| `name`         | (required)       | Project name                                                                                         |
| `version`      | `"0.1.0"`        | Project version                                                                                      |
| `specs_dir`    | `".adv/specs"`   | Directory for spec files                                                                             |
| `changes_dir`  | `".adv/changes"` | Directory for change proposals                                                                       |
| `archive_dir`  | `".adv/archive"` | Directory for archived changes                                                                       |
| `docs_dir`     | `"docs/specs"`   | Directory for generated docs                                                                         |
| `db_dir`       | `".adv/db"`      | Deprecated compatibility field; ignored by Temporal-only runtime and not allocated in external state |
| `project_file` | `"project.md"`   | Optional project context file                                                                        |

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

## ADV CLI (`bin/adv`)

Standalone terminal client for viewing ADV status without an OpenCode session. Reads state directly from disk.

**Requirements:** Bun 1.3+ must be installed (`bun --version` to check).

```bash
# Install (one-time symlink)
ln -s "$(pwd)/bin/adv" ~/.local/bin/adv   # ensure ~/.local/bin is in PATH
adv --version                              # verify: "adv v0.1.0"
adv                                        # show status for current repo
```

Flags: `--no-color` (or `NO_COLOR=1`) to disable ANSI colors. See `adv --help` for details.

---

## Troubleshooting

### Release installer errors

The release installer downloads a full `advance-v*.tar.gz` artifact and then
delegates to `bash scripts/deploy-local.sh --fix`. Common failures:

| Error text | Fix |
| ---------- | --- |
| `jq not found` | Install jq (`sudo apt-get install -y jq`, `sudo dnf install jq`, or `brew install jq`) so `deploy-local.sh --fix` can patch `opencode.json`. |
| `rsync not found` | Install rsync (`sudo apt-get install -y rsync`, `sudo dnf install rsync`, or `brew install rsync`) so the runtime plugin can sync to `~/.local/share/Advance/plugin/`. |
| `pnpm not found` | Install pnpm (`corepack enable pnpm`, `npm install -g pnpm`, or your package manager). Release artifacts include built `plugin/dist`, but pnpm is still needed for source rebuilds and ADV worktree hooks. |
| `sha256sum not found` | Install GNU coreutils (`sudo apt-get install -y coreutils`, `sudo dnf install coreutils`, or `brew install coreutils`) so release checksums can be verified. |
| `Permission denied: ./install.sh` | Run `chmod +x install.sh`, or invoke it as `bash install.sh`. |
| `Release artifact is incomplete` | The downloaded archive is missing required installer assets. Delete the partial download, retry the latest release, or use the source-checkout maintainer path until a corrected release is published. |

If checksum verification fails, do not run the archive. Delete both downloaded
files and retry from the GitHub Release page.

### Consolidated Agents (scout → plan, refine → build)

ADV consolidated `scout` into `plan` and `refine` into `build`. If your global `~/.config/opencode/agents/` still has `scout.md` or `refine.md`, run the sync script to clean them up:

```bash
./scripts/deploy-local.sh --fix
```

If you customized your global `plan.md` or `build.md`, the sync script only patches the overlay block — it does not edit the `tools:` frontmatter. To restore the new capabilities manually, add these to your customized files:

**Note:** `adv-engineer.md` is synced by this repo as a repo-owned full-file global agent (not overlay-managed). Any local customization in `~/.config/opencode/agents/adv-engineer.md` will be overwritten on each sync. If you need custom behavior, extend via your own agent or overlay instead.

- `plan.md` `tools:` — `webfetch: true`, `firecrawl_firecrawl_scrape: true`, `firecrawl_firecrawl_crawl: true`, `firecrawl_firecrawl_check_crawl_status: true`
- `build.md` `tools:` — `adv_task_update: true`, `adv_run_test: true`, `adv_task_checkpoint: true`, `adv_wisdom_add: true`, plus `webfetch: true` and exact Firecrawl grants (`firecrawl_firecrawl_scrape`, `firecrawl_firecrawl_crawl`, `firecrawl_firecrawl_check_crawl_status`)

### Temporal Worker Errors

If ADV reports `worker_alive: false` or `worker_process_alive: false`, verify
the local Temporal dev server and Node worker host:

```bash
temporal server start-dev
node --version
```

For Bun-hosted OpenCode builds, set `ADV_NODE_PATH` if Node is not available on
the plugin host's `PATH`.

### Permission Issues

Ensure write access to all ADV directories:

```bash
chmod -R u+w specs changes archive docs .adv temp
```

### Temporal State Recovery

Use the orphan-sweep CLI to re-seed disk-only change snapshots into Temporal:

```bash
# Preview changes under the default ADV state root
cd /path/to/Advance/plugin
pnpm exec tsx scripts/orphan-sweep.ts --dry-run

# Execute re-seed
pnpm exec tsx scripts/orphan-sweep.ts
```

After repair, **restart OpenCode** so the plugin reconnects to the refreshed
Temporal workflow set.

### Stale Spec Rows After Deletion

If you delete a spec from `.adv/specs/` but `adv_spec list` still shows it,
restart OpenCode. Specs are read from disk/Temporal activity paths; there is no
SQLite cache to rebuild.

**Fix:**

1. Restart OpenCode (or reload the MCP server).
2. Re-run `adv_spec list`.

**Why restart is required:** The ADV plugin is a long-running server process.
Restarting clears in-memory handles and reloads the current disk artifacts.

### Temporal Test Servers Blocking Worktree Cleanup

If an interrupted Temporal integration test leaves behind a
`/tmp/temporal-test-server-sdk-typescript-*` process, `git worktree remove`
may fail because the child inherited the worktree plugin directory as its cwd.

Current releases run Temporal test environments from a stable temp cwd
(`/tmp/advance-temporal-test-cwd`) and spawn out-of-process Temporal workers
from `/tmp/advance-temporal-worker-cwd` to avoid pinning worktrees going
forward. Older leaked processes may still need manual cleanup.

Detect lingering test servers:

```bash
python3 - <<'PY'
import os, json
needle='/tmp/temporal-test-server-sdk-typescript-'
rows=[]
for pid in filter(str.isdigit, os.listdir('/proc')):
    try:
        cmd=open(f'/proc/{pid}/cmdline','rb').read().replace(b'\x00',b' ').decode().strip()
    except Exception:
        continue
    if needle in cmd:
        try:
            cwd=os.readlink(f'/proc/{pid}/cwd')
        except Exception:
            cwd=''
        rows.append({'pid': int(pid), 'cwd': cwd, 'cmd': cmd})
print(json.dumps(rows, indent=2))
PY
```

Kill leaked processes if needed:

```bash
kill <pid1> <pid2> ...
```

Then retry worktree cleanup.

### Commands Not Found or Config Out of Date

Run the sync script to check and fix everything at once:

```bash
# Check what's missing
./scripts/deploy-local.sh --check

# Fix everything (sync assets + patch config)
./scripts/deploy-local.sh --fix
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
# Check the deployed runtime path exists
ls ~/.local/share/Advance/plugin/dist/index.js

# If missing or stale, rebuild and sync the runtime plugin
./scripts/deploy-local.sh --fix
```

---

## Environment Variables

| Variable                               | Default                      | Description                                                                                                                           |
| -------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `ADV_DEBUG`                            | `"0"`                        | Set to `"1"` for debug logging                                                                                                        |
| `ADV_PROFILE`                          | `"0"`                        | Set to `"1"` to write temporal startup profile events to `$OPEN_CHAD_CACHE_DIR/adv-profile.log` (diagnostic-only; clean up after use) |
| `OPEN_CHAD_CACHE_DIR`                  | `$TMPDIR` (fallback: `/tmp`) | Directory used for ADV debug log when `ADV_DEBUG=1`                                                                                   |
| `ADV_FORCE_IN_PROCESS_WORKER`          | unset                        | Force in-process Temporal worker; rollback/debug escape hatch for worker singleton issues                                             |
| `ADV_WORKER_RESTART_VERIFY_TIMEOUT_MS` | `10000`                      | Worker restart queue-serviceability verification timeout                                                                              |
| `OPENCODE_EXPERIMENTAL_WORKSPACES`     | unset                        | Set to `true` and restart OpenCode to enable native workspace warp for ADV worktrees; otherwise ADV downgrades to terminal mode       |
| `OPENCODE_EXPERIMENTAL`                | unset                        | Broader OpenCode experimental opt-in that also enables workspace warp; prefer `OPENCODE_EXPERIMENTAL_WORKSPACES=true` when possible   |

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
| `/adv-idea`               | Explore rough ideas before drafting a proposal                            |
| `/adv-problem`            | Triage issues before fixing or drafting a proposal                        |
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
| `/adv-refactor [id]`      | Refresh a stale proposal — single change-id, or omit to batch-refresh the oldest 30% of active changes                             |
| `/adv-cleanup`            | Triage stale, abandoned, duplicate, and ready-to-archive active changes                                                            |
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

| Tool                       | Purpose                                                                 |
| -------------------------- | ----------------------------------------------------------------------- |
| `adv_change_list`          | List active changes (with `includeArchived`/`includeClosed` filters)    |
| `adv_change_show`          | Get full change details including tasks and deltas                      |
| `adv_change_create`        | Create a new change proposal                                            |
| `adv_change_update`        | Update narrative artifacts (proposal/problem-statement/agreement/design/executive-summary) for an existing change |
| `adv_change_validate`      | Validate change against specs and check for conflicts                   |
| `adv_change_close`         | Close an active change (cancelled/superseded/not_planned)               |
| `adv_change_bulk_close`    | Bulk close changes with filter-aware selection (explicit IDs or filter) |
| `adv_change_archive`       | Archive a completed change (applies spec deltas)                        |
| `adv_change_update_issues` | Add/remove GitHub issue URLs linked to a change                         |

**Tasks**

| Tool                      | Purpose                                                       |
| ------------------------- | ------------------------------------------------------------- |
| `adv_task_list`           | List tasks for a change (with optional status filter)         |
| `adv_task_show`           | Get full task details by ID (includes parent changeId)        |
| `adv_task_ready`          | Get unblocked pending tasks ready for work                    |
| `adv_task_add`            | Add a new task to a change                                    |
| `adv_task_update`         | Update task status (done is checkpoint/recovery-only)          |
| `adv_task_cancel`         | Cancel tasks with required user approval                      |
| `adv_task_reclassify_tdd` | Reclassify TDD intent after planning gate (requires approval) |
| `adv_task_checkpoint`     | Create task checkpoint commit before completion/cancellation  |

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

---

## Support

- **Issues**: https://github.com/Sharper-Flow/Advance/issues
- **Documentation**: See README.md and ADV_INSTRUCTIONS.md
