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

**Failure is bounded.** Three failed attempts on a task trigger doom loop detection — the agent stops, documents what it tried, and escalates. No infinite retry spirals.

## At a glance

Advance gives OpenCode a real engineering workflow instead of a glorified chat log.

- **Specs as laws** — requirements become executable constraints
- **7 gated stages** — proposal, discovery, design, planning, execution, acceptance, release
- **Task-level evidence** — red/green TDD proof lives with the work
- **Durable state** — changes, wisdom, and task history survive compaction and worktrees
- **Bounded failure** — retry loops are detected and escalated instead of spinning forever
- **Scriptable workflow** — MCP tools expose the system, not just the chat surface

## Core workflow

```text
/adv-proposal -> define problem and scope
/adv-discover -> gather evidence and objectives
/adv-agree    -> confirm constraints and acceptance criteria
/adv-design   -> produce and validate implementation strategy
/adv-prep     -> synthesize task graph
/adv-apply    -> execute with TDD evidence
/adv-review   -> review delivered work
/adv-accept   -> record user acceptance
/adv-harden   -> final quality pass
/adv-archive  -> finalize, preserve wisdom, close loop
```

The point is not command count. The point is that work moves through explicit stages with artifacts, evidence, and validation at each step.

## Why it feels different

Most AI coding workflows optimize for speed of output.

Advance optimizes for **quality of completion**:

- work starts with a contract
- tasks are explicit and inspectable
- tests are evidence, not claims
- review and hardening are mandatory stages
- decisions and learnings survive the session that produced them

For serious projects, this is not prompt engineering. It is process infrastructure.

## Quick start

### Use Advance in OpenCode

```bash
git clone https://github.com/Sharper-Flow/Advance.git
cd Advance
./scripts/sync-global.sh --fix
```

That syncs the plugin, commands, overlays, bundled agents, and skills into your local OpenCode setup.

Then in an OpenCode project, start with:

```text
/adv-proposal add OAuth login without breaking existing session flows
```

From there, Advance walks the change through discovery, agreement, design, planning, execution, review, and archive.

For setup details, troubleshooting, and project bootstrapping, see [`SETUP.md`](SETUP.md).

### Develop the plugin

All buildable code lives in [`plugin/`](plugin/).

```bash
cd plugin
pnpm install
pnpm test
pnpm run check
pnpm run build
```

## What lives in this repo

This repository is both the implementation and the operating manual.

- `plugin/` — TypeScript OpenCode plugin implementation
- `.adv/specs/` — capability specs that define ADV behavior
- `.opencode/command/` — slash-command workflow contracts
- `.opencode/agents/` — repo-local agents and managed overlays
- `skills/` — bundled skills synced into the OpenCode skill registry
- `docs/` — workflow docs, gate contracts, and checklists
- `scripts/` — sync, migration, and maintenance helpers

## Key capabilities

- **Spec-driven changes** — define what must be true before implementation starts
- **Task orchestration** — break changes into explicit, trackable work units
- **TDD evidence** — capture red/green proof as part of execution
- **Worktree-aware state** — share mutable change state across worktrees and sessions
- **Accumulated wisdom** — persist patterns, gotchas, conventions, successes, and failures
- **Validation and archive flow** — reduce drift between proposal, implementation, and specs

## Documentation map

- [`SETUP.md`](SETUP.md) — installation, project setup, and troubleshooting
- [`ADV_INSTRUCTIONS.md`](ADV_INSTRUCTIONS.md) — full workflow protocol and agent rules
- [`AGENTS.md`](AGENTS.md) — contributor-facing repo architecture and commands
- [`docs/adv-gates.md`](docs/adv-gates.md) — gate contracts and sequencing
- [`docs/adv-task-report.md`](docs/adv-task-report.md) — task handoff and status reporting
- [`docs/checklists/`](docs/checklists/) — prep, review, and harden checklists
- [`docs/specs/`](docs/specs/) — generated spec documentation

## Development

Useful commands from `plugin/`:

```bash
pnpm test
pnpm run build
pnpm run typecheck
pnpm run lint
pnpm run check
```

## License

MIT
