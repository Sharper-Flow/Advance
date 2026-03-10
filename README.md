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
- `.opencode/agents/` - hidden sub-agents used by higher-level ADV commands
- `skills/` - bundled skills synced into the global OpenCode skill registry
- `docs/` - workflow references, gates, checklists, and supporting docs
- `scripts/` - maintenance and migration helpers

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
/adv-proposal  -> define the change
/adv-validate  -> check it against specs
/adv-apply     -> execute tasks with TDD and evidence
/adv-review    -> adversarial review and remediation
/adv-harden    -> final quality pass
/adv-archive   -> apply deltas and finalize the change
```

## Commands

### Core Workflow

| Command | Purpose |
|---------|---------|
| `/adv-status` | Show project overview: specs, active changes, and next-step recommendations |
| `/adv-proposal <summary>` | Propose a new change with intent, scope, and success criteria |
| `/adv-validate <change-id>` | Validate change compliance against specs; block archive on failure |
| `/adv-apply <change-id>` | Implement change with TDD, retry on failure, and final verification |
| `/adv-archive <change-id>` | Archive completed change: apply spec deltas and finalize git |

### Pre-Implementation

| Command | Purpose |
|---------|---------|
| `/adv-clarify` | Ask clarifying questions to resolve ambiguous requirements |
| `/adv-prep <change-id>` | Analyze gaps and add missing scenarios, tasks, and dependencies |
| `/adv-research <target>` | Validate architectural decisions via docs and web search; complete research gate |

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
- **Worktree-aware state** - share mutable change state across worktrees and sessions
- **Validation and archive flow** - reduce drift between proposal, implementation, and specs
- **Tradeoff prioritization** - route multi-approach decisions through a prioritizer sub-agent before asking users to weigh criteria

### Prioritizer example

For tradeoff-heavy decisions, ADV agents should call the hidden `prioritizer` sub-agent first, then pass its drafted questions to the `question` tool.

```json
{
  "subagent_type": "prioritizer",
  "description": "Draft tradeoff criteria for auth decision",
  "prompt": "Decision: choose between Redis-backed sessions, JWT cookies, and Auth.js delegation for protected routes. Domain: authentication. Key files: src/hooks.server.ts, src/lib/auth/, src/routes/login/+page.server.ts. Real tradeoff: operational simplicity vs extensibility vs dependency surface. Draft context-specific criteria questions and a decision map following the prioritizer output format."
}
```

## Repository structure

```text
.
├── .adv/specs/             # Capability specs (the laws)
├── .opencode/agents/       # Hidden sub-agents used by ADV commands
├── .opencode/command/      # Slash-command implementations and workflows
├── docs/                   # Workflow docs, references, and checklists
├── plugin/                 # TypeScript OpenCode plugin
│   ├── src/
│   ├── schemas/
│   └── package.json
├── scripts/                # Maintenance and migration utilities
├── skills/                 # Bundled OpenCode skills synced globally
├── ADV_INSTRUCTIONS.md
├── INSTALL.md
└── project.json
```

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
- `docs/checklists/` - prep, review, and harden checklists

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
