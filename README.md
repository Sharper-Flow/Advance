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

## Without Advance / With Advance

| Without Advance                    | With Advance                                      |
| ---------------------------------- | ------------------------------------------------- |
| Requirements live in chat history  | Requirements live in specs and agreements         |
| Work expands silently              | Changes stay tied to explicit scope               |
| "Tests passed" is often unverified | Red/green evidence is captured on tasks           |
| Review is ad hoc and shallow       | Review and hardening are explicit workflow stages |
| Context disappears across sessions | State, wisdom, and task history persist           |
| Failed attempts loop forever       | Retry spirals stop and escalate                   |

## Core workflow

```text
/adv-proposal -> define problem and scope
/adv-discover -> gather evidence, agree on objectives and acceptance criteria
/adv-design   -> produce, validate, and present implementation strategy
/adv-prep     -> synthesize task graph
/adv-apply    -> execute with TDD evidence
/adv-review   -> review delivered work and record user acceptance
/adv-harden   -> final quality pass
/adv-archive  -> finalize, preserve wisdom, close loop
```

The point is not command count. The point is that work moves through explicit stages with artifacts, evidence, and validation at each step.

## Command + skill architecture

Advance uses **commands** for user-facing workflow entry points and **skills** for reusable methodology.

- Commands own workflow state, artifacts, and gate completion.
- Skills provide reusable guidance (discovery, prep, apply, review, harden) without mutating ADV state.
- The system is **inline by default**: commands run directly unless a bounded specialist sub-agent materially improves the result.

### Prioritizer protocol

When a change has multiple viable directions with real user-value tradeoffs, prioritization runs **inline by default** before asking the user. The optional `prioritizer` skill can help frame tradeoff questions, but the goal is the same: ask about outcomes, not implementation trivia, so the downstream `task` graph reflects the user's actual priorities.

## Command reference

| Command           | Description                                                                              |
| ----------------- | ---------------------------------------------------------------------------------------- |
| `/adv-status`     | Show project overview: specs, active changes, and next-step recommendations              |
| `/adv-proposal`   | Extract problem statement, success criteria, and constraints without creating tasks      |
| `/adv-validate`   | Validate change compliance against specs; block archive on failure                       |
| `/adv-archive`    | Archive completed change: apply spec deltas and finalize git                             |
| `/adv-clarify`    | Ask clarifying questions to resolve ambiguous requirements                               |
| `/adv-research`   | Produce a defined, fully-researched proposed plan ready for user approval                |
| `/adv-discover`   | Gather context, analyze current state, identify objectives, and obtain user agreement    |
| `/adv-design`     | Validate architecture decisions, produce implementation strategy, and present design for user review |
| `/adv-prep`       | Analyze gaps and synthesize tasks from validated research findings                       |
| `/adv-apply`      | Implement change with TDD, retry on failure, and final verification                      |
| `/adv-task`       | Fast-track a discussed change: synthesize contract, validate best practices, prep, and hand off |
| `/adv-review`     | Review code for correctness, security, and architecture; emit REVIEW_FINDINGS           |
| `/adv-harden`     | Detect low-quality code, verify test coverage, clean up; block archive on open findings  |
| `/adv-audit`      | Detect drift between specs and current implementation                                    |
| `/adv-slop-scan`  | Scan for AI slop patterns including defensive and nested code                            |
| `/adv-refactor`   | Refresh a stale proposal to reflect current codebase state                               |
| `/adv-coordinate` | Detect and resolve conflicts across multiple active changes                              |
| `/adv-improve`    | Suggest targeted improvements to existing specs or implementation                        |
| `/adv-tron`       | Investigate codebase structure, hotspots, risks, and suggest follow-up agenda candidates |

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

### Temporal runtime expectations

ADV storage now targets a **Node worker runtime** plus a probe-gated client
path for Bun. Current defaults (used in tests and local bootstrap helpers)
are:

- address: `127.0.0.1:7233`
- namespace: `default`
- project-scoped task queue: `advance-<projectId>`

Useful commands while developing the migration:

```bash
cd plugin
pnpm run build:worker     # compile temporal/worker.ts + temporal/workflows.ts
pnpm exec vitest run src/temporal/*.test.ts
```

If `probeTemporalClientRuntime()` reports unsupported Bun runtime/bootstrap
capabilities, run the plugin on Node or use the local Temporal dev server via
the `temporal server start-dev` command generated by `runtime-manager.ts`.

Environment variables (see `plugin/.env.example`):

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `ADV_TEMPORAL_ADDRESS` | `127.0.0.1:7233` | Temporal frontend address. Non-loopback requires opt-in. |
| `ADV_TEMPORAL_NAMESPACE` | `default` | Temporal namespace (regex-validated). |
| `ADV_TEMPORAL_ALLOW_REMOTE` | unset | Set to `true` to permit non-loopback addresses. |
| `ADV_TEMPORAL_TASK_QUEUE` | worker-only | Task queue the worker subscribes to. |
| `ADV_TEMPORAL_PROJECT_ID` | worker-only | Set by the runtime manager when spawning a worker. |

Activation path:

```ts
import { createStore } from "./plugin/src/storage/store";
// Production bootstrap wires a Temporal client bundle before calling createStore().
const store = await createStore(projectDir, { temporalBundle, projectIdOverride });
```

`createStore()` remains parameterized for tests and explicit callers, but the
intended production path is Temporal-backed state. The legacy JSON+SQLite
backend is transitional compatibility substrate during cutover and is being
retired.

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
- **Per-task checkpoints** — every `/adv-apply` task with file changes produces a git commit via `adv_task_checkpoint` before being marked done; clean trees return `{status:'clean'}` without committing (see `ADV_INSTRUCTIONS.md § Task Checkpoint Commits`)
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
