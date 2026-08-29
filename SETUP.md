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
| Node.js      | 24.x or higher     | `node --version`     |
| pnpm         | 11.x               | `pnpm --version`     |
| OpenCode CLI | 1.15.5 or newer    | `opencode --version` |

`pnpm` must be on `PATH` when worktrees are created: `.opencode/worktree.jsonc`
uses a `postCreate` hook to run `pnpm install --frozen-lockfile -C plugin` in
new ADV worktrees.

### Optional

| Dependency        | Purpose                                                                                                                                 |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Bun               | 1.3+ for the standalone `bin/adv` CLI                                                                                                   |
| Git               | Version control, change tracking                                                                                                        |
| jq                | Required only for `deploy-local.sh --fix` (config patching)                                                                             |
| rsync             | Required for `deploy-local.sh` runtime plugin deployment                                                                                |
| GitHub CLI (`gh`) | Required for `/adv-triage` and any ADV command that reads/writes GitHub issues or Projects v2. See **GitHub CLI authentication** below. |

### Disk-backed storage

Advance requires no database, server, worker, or runtime service. Authoritative
change, task, gate, and artifact state is stored in per-project disk projections
under `~/.local/share/opencode/plugins/advance/<projectId>/`; each change is a
`changes/<changeId>/change.json` document with `{schemaVersion:2,state:{...}}`.

Writes use a per-change advisory lock with a 15-second budget, jittered backoff,
and stale-PID reclaim. The transaction reads the latest projection inside the
lock, applies the mutation, writes through an atomic temp-file/rename/fsync
sequence, reads back while still locked, and proves the revision and operation
identity. Any failure is reported as `operator_required` rather than silently
overwriting state. Different changes are independent. Epic projections live at
`active-epics/<epicId>/active-projection.json` and use expected-version
optimistic concurrency.

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

### Bun CLI troubleshooting

The standalone `bin/adv` CLI requires Bun 1.3 or newer. Verify the installation
with:

```bash
bun --version
adv --version
```

The plugin itself uses Node.js 24+ for builds and tests. No separate runtime
service is needed.

---

## External Dependencies (MCP Servers and Sub-Agents)

ADV ships the plugin, commands, overlays, and bundled ADV agents (`plan`,
`build`, `adv-researcher`, `adv-engineer`, `adv-reviewer`, `adv-designer`). The `adv-researcher`,
`adv-engineer`, `adv-reviewer`, and `adv-designer` agents are synced globally by `deploy-local.sh`
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

| Agent            | Used by                                                                       | What it does                                                                                                                                 |
| ---------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `explore`        | `/adv-review`, `/adv-harden`, `/adv-audit`, `/adv-slop-scan`, `/adv-refactor` | Codebase navigation, scoped read-only scans                                                                                                  |
| `adv-researcher` | `/adv-discover`, `/adv-design`, `/adv-research`, `/adv-task`, `/adv-review`   | Documentation, API, and code-example research (Context7, Exa, searchcode, webfetch) AND architecture validation                              |
| `general`        | `/adv-review` (cross-cutting), overlay-managed                                | Multi-step verification                                                                                                                      |
| `adv-engineer`   | `/adv-apply` code-writing delegation (backend/state/API/business logic), `/adv-review` remediation fixes | Structured ENGINEER_REPORT submitted via `adv_subagent_report_submit`                                                                        |
| `adv-designer`   | `/adv-apply` matching-cycle frontend follow-up after successful engineer or inline implementation for `metadata.frontend == "true"` | Apply-phase frontend/component specialist (HTML/CSS/JS/TSX, a11y, responsive, polish, site-design match); write-only; never review/harden owner; structured DESIGNER_REPORT submitted via `adv_subagent_report_submit` |
| `adv-reviewer`   | `/adv-review`, `/adv-harden`                                                  | Independent review/harden analysis with scoped repo-write remediation; structured REVIEWER_REPORT submitted via `adv_subagent_report_submit`. Reviewer Remediation Packet carries `FRONTEND DESIGN REVIEW SKILL` anchor for design-inclusive changes |

### Optional MCP servers (referenced by agent tool blocks)

These MCP servers are granted to `plan`/`build`/`adv-researcher`
via their `tools:` allowlists. OpenCode silently ignores tool grants for
MCP servers that are not configured — the grants become no-ops. You can
run ADV without any of these, but the following features degrade or become
unavailable:

| MCP server                                     | Allowlist prefix / callable examples                                                          | Used by                                       | Degradation if missing                                                      |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------- |
| [lgrep](https://github.com/Sharper-Flow/lgrep) | `lgrep_*` grants; lgrep semantic/symbol/text search capabilities   | `plan`, `build`, `adv-researcher`, `adv-tron` | Code exploration falls back to `glob`/`grep`/`read` (slower, less semantic) |
| Firecrawl                                      | `firecrawl_*` grants; Firecrawl scrape/crawl capabilities          | `plan`, `build`                               | Web scraping unavailable; use `webfetch` instead                            |
| Context7                                       | `context7_*` grants; Context7 resolve + query-docs capabilities                | `adv-researcher`                              | Library documentation lookup unavailable                                    |
| Exa                                            | `exa_*` grants; Exa web-search/fetch capabilities | `adv-researcher`                              | Web search unavailable                                                      |
| searchcode                                     | `searchcode_*` grants; searchcode code-search/file-fetch capabilities              | `adv-researcher`                              | Public-repo code example search unavailable                                 |
| ADV MCP (`adv-advance`, port 6298)             | `tools.adv.*` grants; 13 Tier-4 read tools (status, spec, wisdom_list, tool_catalog, etc.)    | `plan`, `build`, `adv-researcher`, `adv-tron` | Tier-4 ADV read/query tools unavailable inside `execute`                    |

The ADV MCP server is a per-project Vision entry (`adv-advance` on port 6298) wired via `mcp.adv` in `.opencode/opencode.json`.

Tool calls must use exact names from the active schema or generated catalog. Allowlist prefixes are grants only, not callable names; never normalize identifiers.

Configure these MCP servers in your `opencode.json` `mcp` section per each
server's documentation. The ADV sync script does not install or validate
MCP servers — that's your responsibility.

### Minimum viable setup

If you want to run ADV with the smallest possible footprint:

1. OpenCode CLI
2. Node.js 20+, pnpm 10+
3. ADV plugin built (`plugin/dist/index.js` present)
4. `~/.config/opencode/agents/` contains `explore` at minimum (plus `adv-researcher`, `adv-engineer`, `adv-reviewer`, `adv-designer` after `scripts/deploy-local.sh --fix`)
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

## YAGNI Scope-Discipline Rule (P29)

ADV recommends a solutioning-scope rule that states YAGNI affirmatively:
build only what the accepted request requires now, and never use YAGNI to
contend with the request itself. Rewritten 2026-08-29 from the earlier
`clean-not-minimal` framing, which carried YAGNI only as a mid-paragraph
clause under a headline that pulled the opposite direction. Like P28,
`rules.yaml` is **user-managed** so this rule must be added manually:

1. Open `~/.config/opencode/instructions/rules.yaml`
2. Add the following entry in the `rules:` map (P29 recommended):

```yaml
rules:
  # ... existing rules ...

  P29:
    name: yagni-scope-discipline
    scope: >-
      Solution design and implementation scope while delivering an accepted
      request. Governs what you build, not whether to accept, question, or
      renegotiate the request itself.
    rule: >-
      Build only what the accepted request requires now. Do not add unrequested
      capability, configuration knobs, abstraction layers, extension points,
      generality, or defensive breadth for anticipated future needs (YAGNI);
      record a plausible future need as a named follow-up instead of building
      it. YAGNI governs the solution, never the delivery: it does not license
      under-building the request, narrowing approved scope, skipping research,
      tests, or verification, or refusing user-requested work — challenge a
      request through clarification (P08), not through silent omission. It
      also does not license refusing necessary structural work or withholding
      a stronger design proposal.

      Within that boundary, optimize for clarity and maintainability, not for
      the smallest possible diff: when a wider architectural change produces
      a cleaner result, surface it — do not suppress better ideas to minimize
      blast radius or touch. This rule governs scope ambition, not leftover
      code: it never licenses retaining a construct the change supersedes
      (see P41).
    tags: [yagni, scope, clarity, design, simplicity]
    hint: yagni_scope_discipline
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
larger. The `clean-not-minimal` rewrite fixed that but buried YAGNI
mid-paragraph; operators reaching for YAGNI as a core rule found no
affirmative statement. The 2026-08-29 rewrite leads with YAGNI, adds a
`scope` field binding the rule to solution design during delivery, and adds
an explicit non-license clause so YAGNI can never justify under-building,
narrowing approved scope, or refusing user-requested work.

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

## Worktree-Isolation Rule (P32)

ADV recommends a priority-8 worktree-isolation rule that keeps the
main/trunk checkout of any repository on its default branch. All branch
work — ADV changes AND ad-hoc fixes — happens in a **git worktree**, never
by switching the trunk checkout to a feature branch. Deploy, rebuild,
release, install, and publish operations run only against the merged
default branch, never from a worktree.

Like P29-P31, `rules.yaml` is **user-managed** so this change must be applied
manually.

Add the following entry in the `rules:` map (P32 recommended):

```yaml
P32:
  name: worktree-isolation
  rule: >-
    Do not intentionally write implementation changes into a trunk/default
    checkout when an isolated worktree is required or available for the work.
    Use the correct worktree/workdir, keep git operations scoped, and never
    bypass worktree isolation with manual file shuffling. Deploy, rebuild,
    release, install, and publish operations are the inverse: run them only
    against the merged default branch, never from a worktree; if a worktree
    contains work that needs deploying, merge it to default first.
  tags: [git, worktree, isolation, safety, deploy]
  hint: worktree_isolation
  priority: 8
```

**Rationale for priority 8:** parity with `P07 verify`, `P25 related-scan`,
and `P35 architecture-over-hacks`. Worktree isolation is a safety-critical
workflow discipline that must consistently win against "just edit it in the
trunk checkout" convenience, but it is not at the priority-9
agent-reasoning tier or the priority-10 absolute-constraint tier.

**Why this rule exists:** on multi-agent repositories (10+ agents shipping
concurrently), the default branch advances every few minutes. A feature
branch checked out in the shared trunk directory is inherited by every
other session pointed at that directory, causing cross-agent collisions,
stale-branch confusion, and lost work. Worktree isolation moves every
branch into its own filesystem path so sessions don't collide. The inverse
rule — deploy/rebuild from merged trunk — keeps the deployed artifact
reproducible from the source of truth and CI-gated; worktree deploys bypass
this silently. This rule is paired with the ADV plugin's trunk-write
firewall and the `oc-worktree` helper; full rationale, the canonical
worktree location convention, and the deploy/rebuild-from-trunk protocol
live in `~/.config/opencode/instructions/trunk-worktree-isolation.md`.

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

## No-Unverified-Knowledge Rule (P34)

ADV recommends a priority-9 evidence rule that sets the default stance for
all factual claims about **external** surfaces — libraries, frameworks, APIs,
versions, syntax, behavior, configuration, file formats, CLI flags, protocol
details, vendor capabilities, service limits. Training recall is not
evidence; lookup is.

Like P29-P33, `rules.yaml` is **user-managed** so this change must be applied
manually.

Add the following entry in the `rules:` map (P34 recommended):

```yaml
P34:
  name: no-unverified-knowledge
  scope: >-
    Default evidence stance for ALL factual claims about external surfaces.
    Sits underneath P16/P27/P30 — when those rules don't trigger by their
    narrower scope, P34 still applies.
  rule: >-
    Default position is "I do not know." Training recall is not
    evidence. Never assert, recommend, decide, or design based on
    remembered knowledge of external surfaces — libraries, frameworks,
    APIs, versions, syntax, behavior, configuration, file formats, CLI
    flags, protocol details, vendor capabilities, service limits — when
    lookup is possible. Look it up first. Use Context7 for library and
    framework docs. Use Exa for current information, vendor docs, news,
    and discovery. Use official docs, source code, or runnable probes
    when the above do not cover the surface. Trigger phrases for STOP-
    and-look-up: "I think", "should be", "typically", "usually", "from
    memory", "as I recall", "probably", and any unhedged confident claim
    about external behavior. Applies to answering questions, making
    recommendations, designing solutions, writing code against external
    APIs, choosing dependencies, and diagnosing failures — not only to
    implementation tasks. Brevity or quick-answer requests change
    response length, never the evidence bar. If lookup is blocked or
    tools unavailable, say so explicitly. Never fill the gap with
    plausible-sounding recall presented as fact.
  tags: [evidence, research, external-knowledge, anti-hallucination, context7, exa, lookup]
  hint: no_unverified_knowledge
  priority: 9
```

**Rationale for priority 9:** parity with `P05 ship-complete`, `P24
tdd-first`, `P27 due-diligence`, `P31 thoroughness`, and `P33
structural-correctness`. The default evidence stance for all factual claims
about external surfaces is a foundational agent-reasoning rule; not at the
priority-10 tier reserved for absolute constraints (security, collaboration,
timeouts).

**Why this rule exists:** agents pattern-match on confident recall and
present it as fact, especially under "quick answer" or brevity pressure.
The cost of an unhedged confident claim about a library version, API flag,
or vendor limit is a wrong recommendation, a wrong dependency choice, or a
wrong diagnosis — and the user often cannot tell the difference between
verified and recalled output without re-doing the lookup themselves. P34
makes the default stance explicit ("I do not know"), names the trigger
phrases that should cause stop-and-look-up, and routes lookups to the right
tool per surface (Context7 for library/framework docs, Exa for current
information and discovery, official docs/source/probes for the rest). It is
the external-surfaces twin of P38 declaration-is-not-behavior.

Restart OpenCode after editing.

---

## Architecture-Over-Hacks Rule (P35)

ADV recommends a priority-8 architecture rule that counters the agent failure
mode of reaching for workarounds — symlinks, env-var overrides, shell
aliases, wrapper scripts, manual file shuffling, chmod/chown overrides,
sed/awk rewrites of generated files, hand-edits to deployed artifacts —
before identifying the architectural fix that would make the workaround
unnecessary.

Like P29-P34, `rules.yaml` is **user-managed** so this change must be applied
manually.

Add the following entry in the `rules:` map (P35 recommended):

```yaml
P35:
  name: architecture-over-hacks
  rule: >-
    Prefer a clean change to the owning mechanism over a bespoke branch,
    duplicate path, one-off adapter, local exception, wrapper, override, or
    manual state manipulation. Before using an interim repair, name the
    structural end-state and explain why it cannot land immediately. Interim
    containment is allowed only when needed to reach or safely await that
    end-state; record a named follow-up and remove the interim path when the
    structural fix lands. Do not use “structural” to justify an unrelated
    rewrite: preserve approved scope and choose the smallest cohesive
    mechanism that resolves the full problem. This includes source-of-truth
    bypasses such as ad-hoc symlinks, environment overrides, shell aliases,
    generated-file rewrites, or hand-edited deployed artifacts. Legitimate
    indirection remains allowed when produced and repaired by its owning
    build, package, or runtime system.
  tags: [architecture, maintainability, source-of-truth, anti-hack]
  hint: architecture_over_hacks
  priority: 8
```

**Rationale for priority 8:** parity with `P07 verify`, `P08 clarify`, `P25
related-scan`, and `P32 worktree-isolation`. Architecture-over-hacks is a
design discipline that must consistently win against convenience and
expediency heuristics, but it is not at the priority-9 stop-and-research
tier (P27/P31/P33/P36/P37/P38) or the priority-10 absolute-constraint tier.

**Why this rule exists:** agents under time pressure default to the fastest
mechanical change that resolves the immediate symptom. A symlink here, an
env-var override there, a sed rewrite of a generated file — each looks small
in isolation, and each silently diverges the deployed state from the source
of truth. Six months later, the symlink is canonical, the env-var override
is load-bearing, and no one remembers why. P35 directs the agent to first
identify the architectural fix (the change to the build, package, or system
that produces and repairs the artifact) and prefer it. If the architectural
fix is too expensive for the current change, the agent must say so
explicitly and present both the proper fix and the temporary workaround —
never silently apply the workaround alone. Legitimate symlinks remain
allowed when they are produced and repaired by the owning system (e.g.,
`pnpm`'s `node_modules/.bin/` links, `pyenv`'s shims).

Restart OpenCode after editing.

---

## Docs-Before-Code-Change Rule (P36)

ADV recommends a priority-9 documentation-evidence rule that counters the
agent failure mode of editing code from memory before checking the relevant
docs. It turns the docs-first stance into an explicit pre-edit requirement.

Like P29-P33, `rules.yaml` is **user-managed** so this change must be
applied manually.

Add the following entry in the `rules:` map (P36 recommended):

```yaml
P36:
  name: docs-before-code-change
  rule: Never make a code change before first referencing the relevant
    documentation. Use Context7 for library, framework, API, language, and
    dependency docs. Use internal repo docs for repo-owned behavior. If
    Context7 has no matching library or the surface is undocumented, use
    official docs, source code, or another authoritative source and state
    that fallback before editing. Documentation evidence precedes code
    edits; it is not optional because the change seems small or familiar.
  tags: [docs, context7, code-change, verification, anti-hallucination]
  hint: docs_before_code_change
  priority: 9
```

**Rationale for priority 9:** parity with `P05 ship-complete`, `P24
tdd-first`, `P27 due-diligence`, `P31 thoroughness`, and `P33
structural-correctness`. This rule governs the evidence boundary before code
mutation, but leaves priority-10 for absolute constraints.

**Why this rule exists:** agents can comply with broad docs-first guidance in
principle while still making a code edit from memory because the change seems
small, familiar, or obvious. P36 removes that escape hatch: before changing
code, cite relevant docs first. Context7 is the default for dependency and API
surfaces; repo docs cover repo-owned behavior; authoritative fallbacks cover
undocumented surfaces.

Restart OpenCode after editing.

---

## No-Polling-Loops Rule (P37)

ADV recommends a priority-9 anti-polling rule that forbids agents from
looping on external-state checks (CI, PR checks, deployments, build status)
from normal agent context. Dedicated wait sub-agents such as `adv-ci-waiter`
are the bounded exception.

Like P29-P36, `rules.yaml` is **user-managed** so this change must be applied
manually.

Add the following entry in the `rules:` map (P37 recommended):

```yaml
P37:
  name: no-polling-loops
  rule: >-
    Never poll external state (CI, PR checks, deployments, build status,
    long-running processes) in a loop from normal agent context. Run one check,
    report the result, and hand back to the user. If external work is
    incomplete, tell the user the current status and that they should re-engage
    or re-run when ready. Do not sleep, wait, or re-check in the same agent
    turn or across sequential turns. Exception: dedicated wait agents such as
    adv-ci-waiter may poll with bounded sleeps when the user explicitly asks to
    wait, or when a parent release/archive workflow needs terminal CI/PR status
    to complete the requested ship/archive end-state. This is not in tension
    with P31 (thoroughness) — normal-agent polling produces no new
    information and wastes tokens without advancing the task. One-shot
    verification satisfies P05 (ship-complete) and P07 (verify); waiting for a
    change is the user's decision, not the normal agent's.
  tags: [efficiency, tokens, ci, anti-pattern, verification]
  hint: no_polling
  priority: 9
```

**Rationale for priority 9:** parity with `P05 ship-complete`, `P24 tdd-first`,
`P27 due-diligence`, `P31 thoroughness`, `P33 structural-correctness`, and `P36
docs-before-code-change`. Polling loops are an agent-reasoning failure mode
with material cost (tokens, wall time, context pollution); not at the
priority-10 tier reserved for absolute constraints.

**Why this rule exists:** agents naturally default to "check again in a few
seconds" when an external system is in an indeterminate state. Across many
turns this produces no new information (the external state has not changed)
yet burns tokens and context. A dedicated wait sub-agent (`adv-ci-waiter`) is
the legitimate exception because it owns the polling primitive, rate-limit
backoff, and bounded sleep semantics. Normal agent context must run one check,
report, and hand back. This rule is paired with the `adv-ci-waiter` routing
policy in `~/.config/opencode/instructions/oc-ci-wait.md`.

Restart OpenCode after editing.

---

## Declaration-Is-Not-Behavior Rule (P38)

ADV recommends a priority-9 declaration-vs-behavior rule that counters the
agent failure mode of asserting what a project's own configuration, schema,
or policy table DOES based only on reading the declaration, without tracing
the value through its loader to its consuming call site to an observable
effect. It is the internal-surfaces twin of P34.

Like P29-P37, `rules.yaml` is **user-managed** so this change must be applied
manually.

Add the following entry in the `rules:` map (P38 recommended):

```yaml
P38:
  name: declaration-is-not-behavior
  scope: >-
    Internal surfaces owned by the current project — config files, schema
    declarations, feature flags, registries, constants, and policy tables.
    Complements P34, which covers external surfaces. Where P34 says "look it
    up", P38 says "a declaration is not the behavior".
  rule: >-
    A declared value is not evidence of runtime effect. Before asserting what
    a configuration, flag, constant, registry entry, or policy table DOES —
    and before designing any change to it — trace it from declaration through
    its loader to its consuming call site to an observable effect. If you can
    only cite where a value is DECLARED, you have not found the mechanism and
    must not describe its behavior, attribute an outcome to it, or design
    against it. Pay specific attention to the join between declared keys and
    runtime values: a lookup with a silent default (`.get(key, default)`,
    `getattr(obj, name, fallback)`, `dict[key] if key in dict else ...`)
    against externally-authored keys is an unvalidated join and may be
    matching nothing at all. Treat "the config says X" and "the system does X"
    as two separate claims requiring two separate pieces of evidence.
  tags: [evidence, config, verification, internal-surfaces, anti-hallucination]
  hint: declaration_is_not_behavior
  priority: 9
```

**Rationale for priority 9:** parity with `P34 no-unverified-knowledge`. P38
is the internal twin of P34 and carries the same consequence class: a
confidently-asserted falsehood that propagates into downstream decisions. It
outranks `P19 simplicity` (5) and `P23 campsite` (7) so "just read the config,
it's obviously what it says" cannot win. It sits level with `P24 tdd-first`,
`P27 due-diligence`, `P31 thoroughness`, `P33 structural-correctness`, `P36
docs-before-code-change`, and `P37 no-polling-loops`.

**Why this rule exists:** in a production incident on a separate project, an
orchestrating agent read a priority-scoring YAML and confidently reported to
the user that English cards were being deliberately deprioritized (key `en`
mapped to `0` while other languages mapped to `+4`). The consuming code read
this as `language_bonuses.get(candidate.language.lower(), 0)`, and the
candidate's language came from a database column holding `ENGLISH`,
`JAPANESE`, `CHINESE_SIMPLIFIED` — lowercased, matching **no declared key**.
Every card had silently scored a zero bonus for the entire life of the
feature. The config was not deprioritising English; the config was dead code.
A second failure on the same incident designed a suppression against a weight
that was already set to an empty tuple and never consulted, because the
priority driver was a fixed band applied before the matrix score. Both
failures passed P07 verify (the agent cited sources) and P31 thoroughness
(effort was high). Only a specifically-named rule covering the
declaration-to-effect join can catch this class of failure before it
propagates into design.

Restart OpenCode after editing.

---

## Population-Identity Rule (P39)

ADV recommends a priority-8 statistics-evidence rule that counters the agent
failure mode of asserting per-entity rates or ratios whose numerator and
denominator are drawn from different populations.

Like P29-P38, `rules.yaml` is **user-managed** so this change must be applied
manually.

Add the following entry in the `rules:` map (P39 recommended):

```yaml
P39:
  name: population-identity
  scope: >-
    Any derived statistic, rate, ratio, or per-entity claim, whether from a
    database query, log aggregation, metrics system, or test output.
  rule: >-
    A ratio is only meaningful when its numerator and denominator are drawn
    from the same verified population. Before asserting any per-entity rate —
    "N passes per card", "X% of requests", "each item retried Y times" —
    establish that both terms describe the same entity set. Compute
    COUNT(DISTINCT entity) alongside COUNT(*) whenever claiming a per-entity
    rate, and state the population explicitly when reporting the figure.
    Where a denominator is filtered (for example "rows WHERE id IS NOT NULL")
    but the numerator is not, the ratio is invalid regardless of how
    reasonable the result looks. A plausible-looking ratio derived from
    mismatched populations is more dangerous than an obviously wrong one,
    because it survives review.
  tags: [evidence, statistics, verification, data-analysis, anti-hallucination]
  hint: population_identity
  priority: 8
```

**Rationale for priority 8:** parity with `P07 verify` and `P25 related-scan`.
This is an evidence-quality rule rather than a stop-and-research rule. It
sits below `P38 declaration-is-not-behavior` (9) because a bad ratio is
usually caught by the next person who looks at the data, whereas a wrong
mechanism can survive into an implemented design.

**Why this rule exists:** in the same production incident that motivated
P38, the agent computed "Chinese cards are being processed roughly 3 times
each" by dividing 12,280 completed work items by 4,225 Chinese cards carrying
a provider ID. The work items actually covered 12,056 **distinct** cards,
most of which had no provider ID at all because they were identity-discovery
work, not price-refresh work. Real rate: 1.01 passes per card. The agent had
the data needed to disprove this and never ran `COUNT(DISTINCT)`. A
plausible-looking ratio (3×) derived from mismatched populations is more
dangerous than an obviously wrong one because it survives review.

Restart OpenCode after editing.

---

## Root-Cause-First Rule (P40)

ADV recommends a priority-9 defect-repair rule that requires causal evidence
before compensating for observed unintended behavior. Its scope is limited to
correcting observed defects in agent or application code; it does not widen
into general implementation guidance.

Like P29-P39, `rules.yaml` is **user-managed** so this change must be applied
manually.

Add the following entry in the `rules:` map (P40 recommended):

```yaml
P40:
  name: root-cause-first
  scope: >-
    Correcting observed unintended behavior in agent/application code.
  rule: >-
    Establish a causal path or executable reproduction before compensating an
    unexplained defect. Repair the owning invariant or mechanism before
    introducing a fallback, retry, duplicate validation, suppression,
    compatibility shim, or catch-all guard. Do not merely mask or bypass
    unexplained behavior. Defense-in-depth is permitted only for an
    independently stated failure mode that already has a primary control and
    verification; it must never replace a known-cause repair. Emergency
    containment is allowed only when paired with a named root-cause follow-up.
  tags: [correctness, root-cause, remediation, reliability, security]
  hint: root_cause_first
  priority: 9
```

Restart OpenCode after editing.

---

## Subtractive-First Rule (P41)

ADV recommends a priority-8 maintenance rule that prefers removing superseded
constructs and demonstrably dead code when structural evidence supports it.

Like P29-P40, `rules.yaml` is **user-managed** so this change must be applied
manually.

Add the following entry in the `rules:` map (P41 recommended):

```yaml
P41:
  name: subtractive-first
  scope: >-
    Editing existing code. Governs removal of constructs a change supersedes
    and demonstrably dead code in the touched subsystem. Complements P40,
    which covers causal repair of observed defects.
  rule: >-
    Default to subtraction when editing existing code. Remove the construct a
    change supersedes in the same change, or name and justify its retention.
    Remove other dead code in the touched subsystem only when structural
    evidence establishes no static or configured caller, dynamic, reflective,
    registry, public API, generated-entry, test-only, or plugin-discovered use;
    analyzer findings are leads, never sole authority, and uncertainty means
    retain and surface. Prohibited: Guard-and-Go, which hides superseded code
    behind a guard, fallback, feature flag, or compatibility shim; and
    Clone-instead-of-call, which copies an implementation instead of invoking
    or extracting it. Never delete tests, validation, error handling, or
    observability merely to reduce code. This is not a line-count target.
  tags: [maintainability, refactor, deletion, accretion, code-quality]
  hint: subtractive_first
  priority: 8
```

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
| `db_dir`       | `".adv/db"`      | Deprecated compatibility field; ignored by the disk-projection runtime and not allocated in external state |
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

Standalone terminal client for viewing ADV status without an OpenCode session. `adv status` reads disk-backed change projections; `adv roadmap` reads the generated roadmap snapshot file; `adv epic list --json` reads disk-backed Epic projections.

**Requirements:** Bun 1.3+ must be installed (`bun --version` to check).

```bash
# Install / repair the managed local CLI
./scripts/deploy-local.sh --fix             # ensures ~/.local/bin/adv is managed
adv --version                              # verify: "adv v0.1.0"
adv                                        # show status for current repo
```

`deploy-local.sh --fix` syncs the whole CLI payload to
`~/.local/share/Advance/bin/` and points `~/.local/bin/adv` at that stable
entrypoint. This avoids symlinks into temporary release extraction directories
and keeps `bin/adv` sibling imports intact. `scripts/deploy-local.sh --check`
reports missing installs, stale managed files, wrong symlink targets, unsafe
unrelated files, and PATH shadowing. If an unrelated `~/.local/bin/adv` already
exists, move it aside manually and rerun `--fix`; deploy-local will not overwrite
unrecognized content. If PATH resolves a different `adv`, put `~/.local/bin`
before the shadowing directory.

Flags: `--no-color` (or `NO_COLOR=1`) to disable ANSI colors; `--json` for status, roadmap, and Epic list automation. See `adv --help` for details.

---

## Troubleshooting

### Release installer errors

The release installer downloads a full `advance-v*.tar.gz` artifact and then
delegates to `bash scripts/deploy-local.sh --fix`. Common failures:

| Error text                        | Fix                                                                                                                                                                                                        |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `jq not found`                    | Install jq (`sudo apt-get install -y jq`, `sudo dnf install jq`, or `brew install jq`) so `deploy-local.sh --fix` can patch `opencode.json`.                                                               |
| `rsync not found`                 | Install rsync (`sudo apt-get install -y rsync`, `sudo dnf install rsync`, or `brew install rsync`) so the runtime plugin can sync to `~/.local/share/Advance/plugin/`.                                     |
| `pnpm not found`                  | Install pnpm (`corepack enable pnpm`, `npm install -g pnpm`, or your package manager). Release artifacts include built `plugin/dist`, but pnpm is still needed for source rebuilds and ADV worktree hooks. |
| `sha256sum not found`             | Install GNU coreutils (`sudo apt-get install -y coreutils`, `sudo dnf install coreutils`, or `brew install coreutils`) so release checksums can be verified.                                               |
| `Permission denied: ./install.sh` | Run `chmod +x install.sh`, or invoke it as `bash install.sh`.                                                                                                                                              |
| `Release artifact is incomplete`  | The downloaded archive is missing required installer assets. Delete the partial download, retry the latest release, or use the source-checkout maintainer path until a corrected release is published.     |

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
- `build.md` `tools:` — `adv_task_update: true`, `adv_run_test: true`, `adv_task_checkpoint: true`, `adv_wisdom_add: true`, plus `webfetch: true` and exact Firecrawl grants (`firecrawl_firecrawl_scrape: true`, `firecrawl_firecrawl_crawl: true`, `firecrawl_firecrawl_check_crawl_status: true`)

### Permission Issues

Ensure write access to all ADV directories:

```bash
chmod -R u+w specs changes archive docs .adv temp
```

### Shallow Clones Refuse ADV State (`UnstableIdentityError`)

ADV derives each project's identity from the repository's root commit. In a
**shallow clone** (`git clone --depth N`, or any fetch that leaves a
`.git/shallow` file), the apparent root is the moving shallow-fetch boundary —
it changes every time the fetch depth shifts. Minting ADV state under that
boundary orphans the entire store: changes and Epics appear to vanish when the
boundary moves.

ADV therefore refuses to initialize or mutate state in a shallow repository.
Any ADV state operation fails with a typed `UnstableIdentityError` naming the
repo path and the remediation command; no projection is created under the
unstable identity.

**Remediation:**

```bash
git fetch --unshallow
```

After the unshallow completes, ADV resolves the true root commit and any
previously "missing" state reappears. Partial clones created with
`--filter=blob:none` download full commit history (no `.git/shallow`) and are
**not** affected. Repositories with commit grafts (`.git/info/grafts`) refuse
the same way; remove the grafts (or migrate to `git replace`) and unshallow if
needed.

### Stale Spec Rows After Deletion

If you delete a spec from `.adv/specs/` but `adv_spec list` still shows it,
restart OpenCode. Specs are read directly from disk; there is no cache to
rebuild.

**Fix:**

1. Restart OpenCode (or reload the MCP server).
2. Re-run `adv_spec list`.

**Why restart is required:** The ADV plugin is a long-running server process.
Restarting clears in-memory handles and reloads the current disk artifacts.

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

| Variable                               | Default                      | Description                                                                                                                         |
| -------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `ADV_DEBUG`                            | `"0"`                        | Set to `"1"` for debug logging                                                                                                      |
| `ADV_PROFILE`                          | `"0"`                        | Set to `"1"` to write startup profile events to `$ADV_CACHE_DIR/adv-profile.log` (diagnostic-only; clean up after use)                |
| `ADV_CACHE_DIR`                        | `$TMPDIR` (fallback: `/tmp`) | Directory used for ADV debug log when `ADV_DEBUG=1`                                                                                 |
| `OPENCODE_EXPERIMENTAL_WORKSPACES`     | unset                        | Set to `true` and restart OpenCode to enable native workspace warp for ADV worktrees; otherwise ADV downgrades to terminal mode     |
| `OPENCODE_EXPERIMENTAL`                | unset                        | Broader OpenCode experimental opt-in that also enables workspace warp; prefer `OPENCODE_EXPERIMENTAL_WORKSPACES=true` when possible |

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
| `/adv-problem`            | Triage defects and unintended behavior before fixing or drafting a proposal |
| `/adv-epic`               | Gather Epic goals before typed creation                                  |
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
| `/adv-task`               | Fast-track small changes: assess spec-law impact, prep, and hand off                                                               |
| `/adv-validate <id>`      | Validate change against specs                                                                                                      |
| `/adv-clarify`            | Clarify ambiguous requirements                                                                                                     |
| `/adv-audit [capability]` | Spec/implementation drift check                                                                                                    |
| `/adv-slop-scan [path]`   | Scan for AI slop patterns                                                                                                          |
| `/adv-refactor [id]`      | Refresh a stale proposal — single change-id, or omit to batch-refresh the oldest 30% of active changes                             |
| `/adv-cleanup`            | Triage stale, abandoned, duplicate, and ready-to-archive active changes                                                            |
| `/adv-coordinate`         | Audit project changes, Epic alignment, sequencing, and membership health                                                           |
| `/adv-improve`            | Analyze improvements across existing specs, implementation, and external landscape; persists a reusable research pack under `docs/*-prep.md` (consumed by `/adv-discover`) |
| `/adv-tron [target]`      | Investigate codebase structure and suggest agenda candidates                                                                       |

Tradeoff-heavy decisions inside ADV flows use inline analysis by default. For deeper analysis, agents can load the prioritizer skill via `skill("prioritizer")` which provides structured criteria question templates and decision map guidance.

Parallel ADV scanners follow the same single-level delegation rule as other ADV orchestration: commands such as `/adv-slop-scan` may spawn first-level workers, but those workers must complete inline and must not spawn additional sub-agents or invoke `/adv-*` commands.

### Available Tools

The read tools below are also available via the ADV MCP server as `tools.adv.*` under Code Mode (for example, `tools.adv.status`).

**Project & Specs**

| Tool                  | Purpose                                                        |
| --------------------- | -------------------------------------------------------------- |
| `adv_status`          | Project overview: specs, active changes, recommendations       |
| `adv_project_context` | Read project.md context file                                   |
| `adv_spec`            | List, show, or search specs (`action: "list"/"show"/"search"`) |

**Changes**

| Tool                       | Purpose                                                                                                           |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `adv_change_list`          | List active changes (with `includeArchived`/`includeClosed` filters)                                              |
| `adv_change_show`          | Get full change details including tasks and deltas                                                                |
| `adv_change_create`        | Create a new change proposal                                                                                      |
| `adv_change_update`        | Update narrative artifacts (proposal/problem-statement/agreement/design/executive-summary) for an existing change |
| `adv_change_validate`      | Validate change against specs and check for conflicts                                                             |
| `adv_change_close`         | Close an active change (cancelled/superseded/not_planned)                                                         |
| `adv_change_bulk_close`    | Bulk close changes with filter-aware selection (explicit IDs or filter)                                           |
| `adv_change_archive`       | Archive a completed change (applies spec deltas)                                                                  |
| `adv_change_update_issues` | Add/remove GitHub issue URLs linked to a change                                                                   |

**Tasks**

| Tool                      | Purpose                                                       |
| ------------------------- | ------------------------------------------------------------- |
| `adv_task_list`           | List tasks for a change (with optional status filter)         |
| `adv_task_show`           | Get full task details by ID (includes parent changeId)        |
| `adv_task_ready`          | Get unblocked pending tasks ready for work                    |
| `adv_task_add`            | Add a new task to a change                                    |
| `adv_task_update`         | Update task status (done is checkpoint/recovery-only)         |
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
| `adv_wisdom_list`         | List wisdom entries, optionally project-only          |

**Agenda**

---

## Support

- **Issues**: https://github.com/Sharper-Flow/Advance/issues
- **Documentation**: See README.md and ADV_INSTRUCTIONS.md
