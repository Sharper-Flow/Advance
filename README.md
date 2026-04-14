<h1 align="center">Advance</h1>

<p align="center">
  <strong>Sanity infrastructure for AI-assisted development.</strong><br>
  <em>Vibe coding doesn't scale.</em>
</p>

<p align="center">
  <a href="https://sharperflow.com/projects/advance">
    <img src="https://sharperflow.com/og/advance-preview.png" alt="Advance preview banner showing spec-driven development workflow for OpenCode" width="640" />
  </a>
</p>

<p align="center">
  <a href="https://github.com/Sharper-Flow/Advance/actions"><img src="https://img.shields.io/github/actions/workflow/status/Sharper-Flow/Advance/ci.yml?label=CI" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green.svg" alt="License: MIT"></a>
  <a href="https://github.com/Sharper-Flow/Advance"><img src="https://img.shields.io/github/stars/Sharper-Flow/Advance?style=social" alt="GitHub stars"></a>
</p>

<p align="center">
  <a href="https://sharperflow.com/projects/advance">Project Page</a>
  &middot;
  <a href="https://github.com/Sharper-Flow/Advance">GitHub</a>
  &middot;
  <a href="CHANGELOG.md">Changelog</a>
</p>

---

## Why Advance exists

AI coding agents are fast. They're also unreliable in ways that compound:

**They drift from requirements.** What started as "add OAuth" becomes a sprawling refactor nobody asked for. There's no contract tying the work back to what was agreed.

**They lose context between sessions.** Compaction, session switches, worktree hops — each one sheds critical context. The agent forgets what it learned, what it tried, what failed.

**They skip verification under pressure.** "The tests pass" means "I didn't write any." Without enforced TDD evidence, you're trusting vibes.

**They do shallow review.** Ask for a code review and you get "looks good" with generic suggestions. Real review needs structure — security, architecture, error handling, test coverage — checked systematically.

**They leave changes half-finished.** Work gets abandoned mid-implementation. No archive, no spec updates, no record of decisions. The next session starts from scratch.

These aren't edge cases. They're the default behavior of every AI coding tool at scale.

## How Advance fixes it

Advance is an [OpenCode](https://github.com/anomalyco/opencode) plugin that replaces ad-hoc AI coding with a structured engineering workflow.

**Specs are laws, not suggestions.** Define what must be true. Every change is validated against specs before it can ship. Drift gets caught, not discovered in production.

**Every change passes 7 gates.** Proposal → Discovery → Design → Planning → Execution → Acceptance → Release. No shortcuts. Each gate has explicit completion criteria.

**TDD evidence is captured, not claimed.** Red phase, green phase — the actual test output is recorded. "It works" has proof attached.

**Context survives everything.** Session switches, worktree hops, compaction — Advance persists change state, task progress, and accumulated wisdom outside the conversation. Nothing is lost when the context window resets.

**Wisdom compounds.** Patterns, gotchas, failures, and conventions are recorded per-change and promoted to project-level learnings. The agent gets smarter across changes, not just within them.

**Failure is bounded.** Three failed attempts on a task triggers doom loop detection — the agent stops, documents what it tried, and escalates. No infinite retry spirals.

## Core workflow

```text
/adv-proposal  -> confirm the problem statement and create the change scaffold
/adv-discover  -> gather current-state findings and objectives
/adv-agree     -> resolve open questions, confirm objectives, AC, constraints
/adv-design    -> produce the design artifact and implementation strategy
/adv-present   -> present the design before planning
/adv-prep      -> synthesize tasks from validated design decisions
/adv-apply     -> execute deliverables with TDD and evidence
/adv-review    -> review delivered work before user acceptance
/adv-accept    -> record user acceptance against the agreement
/adv-harden    -> final release-stage quality pass
/adv-validate  -> check the completed change against specs
/adv-archive   -> apply deltas and finalize the change
```

## Commands

### Core Workflow

| Command | Purpose |
|---------|---------|
| `/adv-status` | Show project overview: specs, active changes, and next-step recommendations |
| `/adv-proposal <summary>` | Extract problem statement and confirm with user before proceeding |
| `/adv-validate <change-id>` | Validate change compliance against specs; block archive on failure |
| `/adv-apply <change-id>` | Implement change with TDD, retry on failure, and final verification |
| `/adv-archive <change-id>` | Archive completed change: apply spec deltas and finalize git |

### Pre-Implementation

| Command | Purpose |
|---------|---------|
| `/adv-clarify` | Ask clarifying questions to resolve ambiguous requirements |
| `/adv-discover <change-id>` | Gather context, analyze current state, and identify objectives |
| `/adv-agree <change-id>` | Present objectives and constraints for user acceptance |
| `/adv-design <change-id>` | Validate architecture decisions and produce implementation strategy |
| `/adv-present <change-id>` | Present concise design overview for user review before planning |
| `/adv-prep <change-id>` | Analyze gaps and synthesize tasks from validated design decisions |

### Implementation

| Command | Purpose |
|---------|---------|
| `/adv-task` | Fast-track a discussed change: synthesize contract, validate, prep, and hand off |

### Post-Implementation

| Command | Purpose |
|---------|---------|
| `/adv-review <change-id>` | Review deliverables for correctness, security, and architecture quality |
| `/adv-accept <change-id>` | Present deliverable summary and acceptance criteria checklist to user |
| `/adv-harden <change-id>` | Detect low-quality code, verify test coverage, clean up before release |
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
- **7-gate flow** - proposal, discovery, design, planning, execution, acceptance, release
- **Accumulated wisdom** - persist patterns, gotchas, conventions, successes, and failures with SQLite-backed search, cross-change aggregation, and archive-time promotion of durable learnings
- **Worktree-aware state** - share mutable change state across worktrees and sessions; detect and reuse existing worktrees
- **Validation and archive flow** - reduce drift between proposal, implementation, and specs while carrying forward durable wisdom during archive
- **Tradeoff prioritization** - route multi-approach decisions through inline analysis or the prioritizer skill before asking users to weigh criteria
- **Command + skill architecture** - slash commands own workflow/state/gates; reusable methodology (review, harden, slop detection) lives in loadable skills following the `adv-tron` pattern

### Prioritizer protocol

For tradeoff-heavy decisions, ADV agents analyze the decision space inline by default — scanning relevant code with `lgrep`, researching via Context7/Kagi, then drafting criteria questions for the `question` tool.

When deeper analysis is needed, agents can load the prioritizer skill via `skill("prioritizer")` for structured criteria question templates and decision map guidance.

### Agent architecture

ADV slash commands are top-level entrypoint contracts; they do not carry command-level `agent:` routing. Agent behavior lives in agent prompts and ADV tools instead of command frontmatter, which keeps context overhead lower and avoids OpenCode re-dispatch surprises.

Agents with the `task` tool can spawn sub-agents for parallel research and validation. Sub-agents cannot spawn further sub-agents — all orchestration flows through the parent agent, with a hard runtime nesting depth limit of `1`. The ADV orchestrator should cap parallel bursts at 3-4 sub-agents and avoid spawning for work achievable inline.

That same single-level rule also applies to scan-style workflows such as `/adv-slop-scan`: first-level scanner workers may fan out, but those workers must complete inline and must not spawn further sub-agents or re-enter `/adv-*` commands.

Shared global agents such as `adv`, `general`, `plan`, and `scout` are synced through small repo-owned managed overlay blocks rather than full-file replacement, so ADV can keep critical anti-recursion rules current without overwriting user customization.

| Agent | Role | Can Orchestrate? |
|-------|------|-----------------|
| `adv` | ADV orchestrator — drives spec-driven development workflows through the 7-gate lifecycle | Yes |
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
| `adv-researcher` | Architectural validation, simplicity analysis (ADV-managed bundled global) |
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
├── SETUP.md
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
  "db_dir": ".adv/db",
  "project_file": "project.md"
}
```

After cloning, run `./scripts/sync-global.sh --fix` to sync commands, agents,
skills, and patch `~/.config/opencode/opencode.json` with ADV entries.

See `SETUP.md` for setup details.

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

- `SETUP.md` - installation, project setup, and upgrade notes
- `ADV_INSTRUCTIONS.md` - agent operating rules and workflow protocol
- `AGENTS.md` - agent-facing quickstart: concepts, tools, directory layout
- `docs/adv-workflow.md` - visual 7-gate workflow diagram
- `docs/adv-gates.md` - gate contracts and sequencing
- `docs/adv-task-report.md` - task handoff/status reporting
- `docs/adv-context-agreement.md` - context snapshot and cross-repo switch formatting
- `docs/adv-question-tool.md` - question tool UX policy
- `docs/checklists/` - prep, review, and harden checklists
- `docs/specs/` - generated spec documentation (adv-discover, adv-prep, adv-proposal, advance, context-display, contract-system, prep-readiness, slop-scan, tdd-contract)

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
