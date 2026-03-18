# Advance

**Spec-driven development for OpenCode.**

Advance (ADV) gives OpenCode a durable workflow for serious engineering work: specs, changes, tasks, gates, evidence, and learnings all live in one system instead of being scattered across chat history.

The idea is simple:

- specs become laws
- changes are proposed explicitly
- tasks are tracked with evidence
- review and hardening are first-class workflow stages
- context survives worktrees, session switches, and compaction

## What Advance is

Advance is an OpenCode plugin plus a repository of workflow definitions, specs, and command logic.

This repo contains:

- `plugin/` - the TypeScript plugin implementation
- `.adv/specs/` - the capability specs that define behavior
- `.opencode/command/` - slash-command workflows like `/adv-proposal` and `/adv-review`
- `.opencode/agents/` - sub-agents used by ADV commands (adv-researcher, tron, etc.)
- `skills/` - bundled skills synced into the global OpenCode skill registry
- `docs/` - workflow references, gates, checklists, and supporting docs
- `scripts/` - maintenance, migration, and global config sync helpers

If you want to understand how ADV works, this repository is both the code and the operating manual.

## What it solves

AI coding agents fail in predictable ways:

- they drift from requirements
- they lose context across sessions
- they skip verification under pressure
- they do shallow review unless forced into rigor
- they leave changes half-finished and poorly archived

Advance exists to make those failure modes harder.

## Core workflow

```text
/adv-proposal  -> extract problem statement, success criteria, and constraints (no tasks)
/adv-research  -> validate architecture and best practices
/adv-prep      -> synthesize tasks from validated findings
/adv-apply     -> execute tasks with TDD and evidence
/adv-review    -> adversarial review and remediation
/adv-harden    -> final quality pass
/adv-validate  -> check the completed change against specs
/adv-archive   -> apply deltas and finalize the change
```

## Commands

### Core Workflow

| Command | Purpose |
|---------|---------|
| `/adv-status` | Show project overview: specs, active changes, and next-step recommendations |
| `/adv-proposal <summary>` | Extract problem statement, success criteria, and constraints without creating tasks |
| `/adv-validate <change-id>` | Validate change compliance against specs; block archive on failure |
| `/adv-apply <change-id>` | Implement change with TDD, retry on failure, and final verification |
| `/adv-archive <change-id>` | Archive completed change: apply spec deltas and finalize git |

### Pre-Implementation

| Command | Purpose |
|---------|---------|
| `/adv-clarify` | Ask clarifying questions to resolve ambiguous requirements |
| `/adv-research <target>` | Validate architectural decisions and best practices without creating tasks |
| `/adv-prep <change-id>` | Analyze gaps and synthesize tasks from validated research findings |

### Implementation

| Command | Purpose |
|---------|---------|
| `/adv-task` | Fast-track a discussed change: synthesize contract, validate best practices, prep, and hand off |

### Post-Implementation

| Command | Purpose |
|---------|---------|
| `/adv-review <change-id>` | Review code for correctness, security, and architecture; emit REVIEW_FINDINGS |
| `/adv-harden <change-id>` | Detect low-quality code, verify test coverage, clean up; block archive on open findings |
| `/adv-audit [capability]` | Detect drift between specs and current implementation |
| `/adv-slop-scan [path]` | Scan for AI slop patterns including defensive and nested code |

### Advanced

| Command | Purpose |
|---------|---------|
| `/adv-refactor <change-id>` | Refresh a stale proposal to reflect current codebase state |
| `/adv-coordinate` | Detect and resolve conflicts across multiple active changes |
| `/adv-improve` | Suggest targeted improvements to existing specs or implementation |
| `/adv-tron [target]` | Investigate codebase structure, hotspots, risks, and suggest follow-up agenda candidates |

## Key capabilities

- **Spec-driven changes** - define what must be true before implementation starts
- **Task orchestration** - break changes into explicit, trackable work units
- **TDD evidence** - capture red/green proof as part of execution
- **6-gate flow** - research, prep, implementation, review, harden, signoff
- **Accumulated wisdom** - persist patterns, gotchas, conventions, successes, and failures
- **Worktree-aware state** - share mutable change state across worktrees and sessions; detect and reuse existing worktrees
- **Validation and archive flow** - reduce drift between proposal, implementation, and specs
- **Tradeoff prioritization** - route multi-approach decisions through inline analysis or the prioritizer skill before asking users to weigh criteria

### Prioritizer protocol

For tradeoff-heavy decisions, ADV agents analyze the decision space inline by default — scanning relevant code with `lgrep`, researching via Context7/Kagi, then drafting criteria questions for the `question` tool.

When deeper analysis is needed, agents can load the prioritizer skill via `skill("prioritizer")` for structured criteria question templates and decision map guidance.

### Agent architecture

ADV commands are executed by OpenCode agents. Agents with the `task` tool can spawn sub-agents for parallel research and validation. Sub-agents cannot spawn further sub-agents — all orchestration flows through the parent agent. Orchestrators (especially `orca`) should cap parallel bursts at 3-4 sub-agents and avoid spawning for work achievable in a single tool call.

| Agent | Role | Can Orchestrate? |
|-------|------|-----------------|
| `orca` | Orchestrator — drives multi-step workflows with research between steps | Yes |
| `plan` | Planning — produces structured plans and task breakdowns | Yes |
| `scout` | Reconnaissance — investigates codebases and brainstorms ideas | Yes |
| `refine` | Refinement — surgical scope-locked editing and quality gates | Yes |
| `build` | Build/CI — runs tests, linters, type checkers | No (inline only) |

Sub-agents available for orchestration:

| Sub-Agent | Purpose |
|-----------|---------|
| `librarian` | Documentation, API references, code examples |
| `explore` | Codebase navigation, find usages |
| `general` | Complex multi-step implementation |
| `mechanic` | System/infra issues — MCP servers, config, toolchain |
| `adv-researcher` | Architectural validation, simplicity analysis |
| `tron` | Codebase reconnaissance, hotspot detection |

## Repository structure

```text
.
├── .adv/specs/             # Capability specs (the laws)
├── .opencode/agents/       # Sub-agents used by ADV commands
├── .opencode/command/      # Slash-command implementations and workflows
├── docs/                   # Workflow docs, references, and checklists
├── plugin/                 # TypeScript OpenCode plugin
│   ├── src/
│   ├── schemas/
│   └── package.json
├── scripts/                # Maintenance, migration, and global config sync
├── skills/                 # Bundled OpenCode skills synced globally
├── ADV_INSTRUCTIONS.md
├── INSTALL.md
└── project.json
```

## Worktree integration

ADV uses git worktrees as an **isolation layer on top of branches**, not as a replacement for them. The branch `change/{change-id}` carries the commit history; the worktree provides a separate working directory so changes don't interfere with other work.

### How it works

1. **Risk assessment** — `/adv-apply` Phase 0 evaluates whether the change is high-risk (3+ files, breaking API, auth, schema changes). Low-risk changes work in-place.
2. **Reuse detection** — Before creating a new worktree, ADV checks `git worktree list --porcelain` for an existing `change/{change-id}` worktree. If found and healthy, it offers to switch to it. If stale (path deleted), it prunes the record.
3. **Shared mutable state** — Changes, wisdom, agenda, and archive live in `~/.local/share/opencode/plugins/advance/{project-id}/`, keyed by root commit SHA. All worktrees of the same repo share this state.
4. **Branch-local specs** — Specs (`.adv/specs/`) are git-tracked and branch-specific. A spec modified in worktree A is not visible in worktree B until the branch is merged.
5. **Automatic cleanup** — `/adv-archive` Phase 9 commits, merges to the default branch, verifies the merge, and deletes the worktree.

### What's shared vs. branch-local

| Data | Location | Shared? |
|------|----------|---------|
| Changes, archive, wisdom, agenda | External (`~/.local/share/...`) | Yes |
| Specs (`.adv/specs/`) | In-repo, git-tracked | No — branch-local |
| Handoff state | External | Yes |

### Spec divergence

If a spec is modified in one worktree (e.g., via `/adv-archive` applying deltas), other worktrees won't see the update until the branch is merged. This means `/adv-validate` or `/adv-audit` in another worktree may operate on stale specs. Merge promptly after archiving spec-modifying changes.

## Quick start

### Develop the plugin

```bash
git clone https://github.com/Sharper-Flow/Advance.git
cd Advance/plugin
pnpm install
pnpm test
pnpm run check
```

### Use ADV in an OpenCode project

An ADV-enabled project needs a `project.json` plus spec/change/archive directories.

Example `project.json`:

```json
{
  "name": "my-project",
  "version": "0.1.0",
  "specs_dir": "specs",
  "changes_dir": "changes",
  "archive_dir": "archive",
  "docs_dir": "docs/specs",
  "db_dir": ".specdb",
  "project_file": "project.md"
}
```

After cloning, run `./scripts/sync-global.sh --fix` to sync commands, agents,
skills, and patch `~/.config/opencode/opencode.json` with ADV entries.

See `INSTALL.md` for setup details.

## MCP surface

Advance exposes MCP tools for:

- reading specs
- creating and validating changes
- managing tasks and TDD evidence
- tracking gates and agenda state
- recording and promoting wisdom
- querying project context and status

The important point is not the raw tool count. The value is that the workflow is scriptable, inspectable, and durable across sessions.

## Documentation map

- `INSTALL.md` - installation and project setup
- `ADV_INSTRUCTIONS.md` - agent operating rules and workflow protocol
- `docs/adv-workflow.md` - lifecycle overview
- `docs/adv-gates.md` - gate model and sequencing
- `docs/adv-task-report.md` - task handoff/status reporting
- `docs/adv-context-agreement.md` - context snapshot and cross-repo switch formatting
- `docs/adv-question-tool.md` - question tool UX policy
- `docs/checklists/` - prep, review, and harden checklists
- `docs/specs/` - generated spec documentation (advance, context-display, contract-system, prep-readiness, slop-scan, tdd-contract)

## Development

Useful commands from `plugin/`:

```bash
pnpm install
pnpm test
pnpm run build
pnpm run typecheck
pnpm run lint
pnpm run check
```

## License

MIT
