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

Supporting commands such as `/adv-status`, `/adv-prep`, `/adv-research`, `/adv-refactor`, `/adv-task`, and `/adv-audit` round out the workflow.

## Key capabilities

- **Spec-driven changes** - define what must be true before implementation starts
- **Task orchestration** - break changes into explicit, trackable work units
- **TDD evidence** - capture red/green proof as part of execution
- **6-gate flow** - research, prep, implementation, review, harden, signoff
- **Accumulated wisdom** - persist patterns, gotchas, conventions, successes, and failures
- **Worktree-aware state** - share mutable change state across worktrees and sessions
- **Validation and archive flow** - reduce drift between proposal, implementation, and specs

## Repository structure

```text
.
├── .adv/specs/             # Capability specs (the laws)
├── .opencode/command/      # Slash-command implementations and workflows
├── docs/                   # Workflow docs, references, and checklists
├── plugin/                 # TypeScript OpenCode plugin
│   ├── src/
│   ├── schemas/
│   └── package.json
├── scripts/                # Maintenance and migration utilities
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
