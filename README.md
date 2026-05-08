<h1 align="center">Advance</h1>

<p align="center">
  <strong>Spec-driven engineering infrastructure for AI-assisted development.</strong><br>
  <em>Vibe coding does not scale. Durable engineering loops do.</em>
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
  &middot;
  <a href="SETUP.md">Setup</a>
</p>

---

## What Advance is

Advance is an [OpenCode](https://github.com/anomalyco/opencode) plugin that turns AI coding from a chat-driven activity into a governed engineering system.

It combines:

- **Spec law** — durable capability requirements in `.adv/specs/`
- **7-gate delivery** — proposal → discovery → design → planning → execution → acceptance → release
- **Temporal-backed orchestration** — durable change/task workflows that survive process and context loss
- **MCP tool surface** — structured state mutation and inspection, not hidden chat memory
- **TDD evidence capture** — red/green proof recorded on tasks
- **Worktree isolation** — branch-local specs, shared external change state, safe parallel implementation
- **Task checkpoint commits** — local rollback/audit commits before task completion
- **Review + hardening loops** — explicit correctness, security, architecture, test, and slop checks
- **Wisdom accumulation** — reusable project learnings promoted from completed work
- **Runtime guardrails** — bash safety, sub-agent nesting limits, cancellation policy, doom-loop detection
- **External conformance hooks** — optional black-box CI verification for spec drift

The result: AI agents can move fast without losing the engineering contract.

## Why it exists

AI coding tools are powerful, but raw chat has weak guarantees:

| Failure mode       | What usually happens                                |
| ------------------ | --------------------------------------------------- |
| Scope drift        | “Add OAuth” becomes unrelated refactors             |
| Context loss       | Compaction or new sessions drop critical decisions  |
| Fake verification  | “Tests pass” means no evidence was captured         |
| Shallow review     | Generic comments replace systematic review          |
| Infinite retries   | Agents repeat failing strategies without escalation |
| Half-finished work | No archive, no spec update, no durable handoff      |

Advance treats these as infrastructure problems, not prompt problems.

## Why Advance is different

Many tools solve one slice of this problem. Some provide durable workflows. Some enforce test commands. Some add memory. Some add review bots. Some add task plans.

Advance is different because it balances all of those parts in one loop.

| Single-aspect approach               | What it helps with             | What it still misses                                              | Advance adds                                                         |
| ------------------------------------ | ------------------------------ | ----------------------------------------------------------------- | -------------------------------------------------------------------- |
| Durable functions / workflow engines | Process survival               | Requirements, review, TDD proof, acceptance, archive              | Temporal-backed workflows bound to specs, gates, tasks, and evidence |
| Prompt checklists                    | Agent behavior hints           | Enforcement, persistence, machine-readable state                  | MCP tools, gate state, validators, guardrails                        |
| Test runners                         | Verification command execution | Scope control, red/green audit trail, design agreement            | Per-task TDD evidence plus change contract                           |
| Memory layers                        | Session continuity             | Acceptance criteria, release governance, conflict detection       | External change state, wisdom, agenda, context snapshots             |
| Review bots                          | Post-hoc feedback              | Planning, implementation discipline, archival closure             | Review and harden as first-class gates                               |
| Task managers                        | Work breakdown                 | Spec conformance, retries, checkpointing, cross-session execution | Task graph tied to specs, worktrees, evidence, commits               |

Advance does not claim one mechanism is enough. It makes the mechanisms cooperate:

```text
specs define truth
gates define lifecycle
Temporal preserves workflow
MCP tools expose state
tasks carry evidence
worktrees isolate change
checkpoints preserve rollback
review/harden catch drift
archive promotes learnings back into law
```

That combination is the product.

## Unique technical stack

Advance is intentionally unusual. It is not just commands around an LLM.

| Layer                 | Technology / system                                 | Why it matters                                                                     |
| --------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Host                  | OpenCode plugin                                     | Runs where coding agents already work                                              |
| Runtime               | Bun host + Node worker path                         | Matches OpenCode runtime while supporting worker code that needs Node              |
| Durable orchestration | Temporal workflows                                  | Recovers task/change state across crashes, compaction, and long-running work       |
| Tool API              | MCP-style ADV tools                                 | State changes are explicit, typed, inspectable, and auditable                      |
| Contracts             | `.adv/specs/` + proposal/agreement/design artifacts | Requirements become durable law, not chat context                                  |
| Validation            | Zod v4 schemas + spec validators                    | Tool inputs and change state stay structured                                       |
| Workflow UX           | Slash commands + gate contracts                     | Humans approve the right checkpoints; agents run autonomous phases                 |
| Methodology reuse     | Skills                                              | Discovery, prep, review, harden, slop detection, and cost governance stay reusable |
| Specialist execution  | Bounded sub-agents                                  | Research and implementation can be delegated without recursive agent sprawl        |
| Isolation             | Git worktrees                                       | Implementation can happen away from the main checkout while sharing ADV state      |
| Evidence              | TDD logs + task checkpoints                         | “Done” means auditable proof exists                                                |
| Learning loop         | Wisdom + reflection                                 | Successful patterns and gotchas survive the change that produced them              |
| Safety                | Bash guard, task nesting guard, doom-loop detection | Agent autonomy has hard limits                                                     |
| Conformance           | External CI verdict ingestion                       | Specs can be checked by black-box tests outside the agent’s reach                  |

This is why Advance is more than durable functions, more than a memory layer, more than a prompt pack, and more than a test wrapper.

## Standalone maintenance surfaces

OCA owns the offline `oca maintain` operator command, but Advance provides the runtime-safe inspection surfaces it consumes:

- `scripts/maintenance/inspect.mjs --project-root <path>` emits `schema_version: 1`, archived change summaries, release-gate eligibility, and a verification summary. OCA uses this to merge only archived changes whose `release` gate is `done`.
- `adv_change_update_issues` accepts full GitHub issue URLs only (`https://github.com/<owner>/<repo>/issues/<number>`). Shorthand refs are rejected before persistence so invalid state cannot be saved.
- `adv_status view=health` includes `plugin_runtime`, reporting the loaded module path, process start time, `dist/oca-build.json` marker path/data when present, worker script path, and the caveat that host-loaded tool code requires restarting OpenCode after rebuild.

Maintenance remains offline by design. OCA should close/refuse active sessions before executing merge/rebuild/cleanup work; Temporal recovery is report-only unless a future Advance standalone script exposes a safe executor.

## Core workflow

```text
/adv-proposal -> define problem, success criteria, constraints
/adv-discover -> gather evidence, agree objectives and acceptance criteria
/adv-design   -> design implementation strategy and validate architecture
/adv-prep     -> synthesize task graph and close gaps
/adv-apply    -> implement autonomously with TDD evidence and checkpoints
/adv-review   -> verify delivered work against the contract
/adv-harden   -> production-readiness and quality pass
/adv-archive  -> promote deltas to specs, preserve wisdom, finalize release
```

The command count is not the point. The point is that every phase produces artifacts that later phases can verify.

## The 7 gates

| Gate       | Purpose                                           | Human role                                                        |
| ---------- | ------------------------------------------------- | ----------------------------------------------------------------- |
| Proposal   | Clarify problem, scope, success criteria          | Confirm problem statement                                         |
| Discovery  | Gather evidence and define agreement              | Approve objectives and acceptance criteria                        |
| Design     | Validate architecture and implementation strategy | Approve only when tradeoffs need judgment or validation conflicts |
| Planning   | Build task graph and flight-check readiness       | Explicit prep approval                                            |
| Execution  | Implement tasks with TDD, retries, checkpoints    | Autonomous unless blocked                                         |
| Acceptance | Review delivered work against agreement           | Confirm delivered result                                          |
| Release    | Harden, archive, reflect, finalize                | Sign off archive                                                  |

No gate is a vibe check. Each gate has a contract.

## What “done” means

Advance narrows “done” to evidence:

- Agreement exists and acceptance criteria are explicit.
- Design has been validated before implementation.
- Tasks are tracked and blocked dependencies are known.
- TDD evidence exists where applicable.
- Changed work is checkpointed before task completion.
- Review and hardening findings are fixed or classified out of scope.
- Specs are updated when behavior becomes law.
- Wisdom and reflection are recorded for the next change.

## Without Advance / With Advance

| Without Advance                                       | With Advance                                                         |
| ----------------------------------------------------- | -------------------------------------------------------------------- |
| Requirements live in chat history                     | Requirements live in specs, proposals, and agreements                |
| Work expands silently                                 | Scope is tied to explicit gates and acceptance criteria              |
| Durable execution is separate from engineering policy | Temporal state is integrated with specs, tasks, evidence, and gates  |
| Memory is unstructured                                | Context snapshots, wisdom, agenda, and task ledgers are structured   |
| “Tests passed” is a claim                             | Red/green output is captured as task evidence                        |
| Review is optional or generic                         | Review and harden are required workflow stages                       |
| Agent retries are invisible                           | Failures are classified; doom loops escalate after 3 failed attempts |
| Worktrees fragment state                              | Worktrees share external ADV state while specs stay branch-local     |
| Completion disappears after merge                     | Archive promotes decisions and learnings back into the project       |

## Key capabilities

### Spec-driven changes

Specs are laws. Proposals and implementations can evolve, but archive validates against the current spec contract. When behavior changes permanently, archive applies spec deltas.

### Durable task orchestration

Temporal-backed workflows track changes, task runs, gates, evidence, and recovery state. If an agent session dies or compacts, the next session resumes from durable state instead of reconstructing intent from chat.

### TDD evidence, not test theater

For implementation tasks, Advance records red and green phases with command, output, test file, and exit code. If TDD is not applicable, the task must say why.

### Checkpoint commits

Every `/adv-apply` task with file changes creates a local checkpoint through `adv_task_checkpoint` before it is marked done. Checkpoints include change ID, task ID, mode, and verification summary.

### Worktree-aware execution

Mutating work runs in per-change worktrees. ADV state is external and shared across worktrees; specs remain git-tracked and branch-local. That gives isolation without losing coordination.

### Bounded autonomy

Advance lets agents work autonomously only inside approved boundaries. It stops for human checkpoints, design conflicts, doom loops, cancellation approval, archive sign-off, and scope drift that changes the agreement.

### Accumulated wisdom

Patterns, successes, failures, conventions, and gotchas can be recorded per change and promoted to project-level wisdom. The system gets better as it ships.

### External conformance

Optional CI-isolated conformance checks can verify specs from outside the agent’s editable context. Drift blocks archive unless a human explicitly unlocks or overrides.

### Prioritizer protocol

When 2+ viable approaches depend on user values, Advance runs the prioritizer before asking. The tradeoff Prioritizer protocol is inline by default — the orchestrator agent researches tradeoffs, drafts criteria questions, and surfaces them via the prioritizer skill or inline question tool. Delegated sub-agents use the same protocol for task-level decisions.

## Command + skill architecture

Advance separates workflow ownership from reusable methodology.

- **Commands** own user entry points, gate transitions, state mutation, and artifacts.
- **Skills** own reusable guidance and checklists.
- **Sub-agents** handle bounded research, validation, and implementation work when context can be safely shed.
- **The ADV orchestrator** keeps sequencing, approvals, and state consistent.

This keeps methodology reusable without letting random helper prompts mutate workflow state.

## Why one agent per provider, not one agent per role

Advance generates provider-specific orchestrator agents (`adv-claude`, `adv-gpt`, `adv-glm`, `adv-kimi`) instead of role-based agents like `planner`, `coder`, or `reviewer`. This is deliberate.

**The problem with role agents:** Splitting the 7-gate lifecycle across agents means each agent only sees a slice of the workflow. The planner never sees how its design survives implementation. The coder never sees the acceptance criteria that govern review. The reviewer never sees the discovery evidence that shaped the agreement. Every handoff loses context — and context loss is the exact problem Advance exists to solve.

**The provider-agent model:** A single ADV agent per LLM provider carries the full change lifecycle from proposal through archive. The agent sees the problem statement, the agreement, the design, the task graph, the implementation evidence, and the review findings in one continuous context. When specialized work is needed, the orchestrator delegates to bounded sub-agents for a single task — not for an entire lifecycle phase.

| Aspect | Role agents (planner / coder / reviewer) | Provider agents (adv-claude / adv-gpt / …) |
| --- | --- | --- |
| Context continuity | Lost at every handoff | Full lifecycle in one agent |
| Gate coherence | Each agent sees a phase slice | One agent owns all 7 gates |
| Model tuning | One prompt fits all models | Provider-specific prompt tuning |
| Model comparison | Hard — different agents run different phases | Same workflow, different models, directly comparable |
| User model | "Which agent handles this phase?" | Pick a provider, get the full lifecycle |
| Tool surface | Per-role tool subsets to maintain | Shared MCP tools, single policy layer |
| Delegation | Role-to-role handoffs, no recovery | Scoped sub-agent tasks within a workflow |

The sub-agent system still exists — `adv-engineer` handles delegated implementation, `adv-researcher` validates architecture, `explore` scans code, `librarian` fetches docs. But these are scoped tasks, not lifecycle phases. The orchestrator stays in the loop from start to finish.

This design also enables model competition: run the same change on two providers and compare results. The gates, specs, tools, and evidence format are identical — only the reasoning varies.

## Command reference

| Command           | Description                                                                       |
| ----------------- | --------------------------------------------------------------------------------- |
| `/adv-status`     | Show project overview: specs, active changes, and next-step recommendations       |
| `/adv-idea`       | Explore rough ideas before drafting a proposal                                    |
| `/adv-problem`    | Triage issues before fixing or drafting a proposal                                |
| `/adv-proposal`   | Extract problem statement, success criteria, and constraints without creating tasks |
| `/adv-discover`   | Gather context, analyze current state, identify objectives, and obtain user agreement |
| `/adv-design`     | Validate architecture decisions, produce implementation strategy, and present design for user review |
| `/adv-prep`       | Analyze gaps and synthesize tasks from validated research findings                |
| `/adv-apply`      | Implement change with TDD, retry on failure, and final verification              |
| `/adv-review`     | Review code for correctness, security, and architecture; emit REVIEW_FINDINGS     |
| `/adv-harden`     | Detect low-quality code, verify test coverage, clean up; block archive on open findings |
| `/adv-archive`    | Archive completed change: apply spec deltas and finalize git                      |
| `/adv-validate`   | Validate change compliance against specs; block archive on failure                |
| `/adv-clarify`    | Ask clarifying questions to resolve ambiguous requirements                        |
| `/adv-research`   | Produce a defined, fully-researched proposed plan ready for user approval         |
| `/adv-task`       | Fast-track a discussed change: synthesize contract, validate best practices, prep, and hand off |
| `/adv-autopilot`  | Delegate routine checkpoints to the agent, stop only on safety boundaries         |
| `/adv-audit`      | Detect drift between specs and current implementation                             |
| `/adv-slop-scan`  | Scan for AI slop patterns including defensive and nested code                     |
| `/adv-arch-scan`  | Scan for architecture inconsistencies using deterministic tools, research fallback, and AI heuristic |
| `/adv-comp-scan`  | Scan competitor capabilities against this project for competitive intelligence    |
| `/adv-refactor`   | Refresh a stale proposal or batch-refresh the oldest 30% of active changes       |
| `/adv-cleanup`    | Triage stale, abandoned, duplicate, and ready-to-archive active changes          |
| `/adv-triage`     | Triage all backlog sources, score features with WSJF, regenerate ROADMAP.md      |
| `/adv-improve`    | Suggest targeted improvements to existing specs or implementation                 |
| `/adv-tron`       | Investigate codebase structure, hotspots, risks, and suggest follow-up agenda candidates |
| `/adv-reflect`    | Produce a structured two-plane reflection report for an archived change           |

## Quick start

### Install into OpenCode

```bash
git clone https://github.com/Sharper-Flow/Advance.git
cd Advance
./scripts/sync-global.sh --fix
```

That syncs the plugin, commands, overlays, bundled agents, and skills into the local OpenCode setup.

Then, inside an OpenCode project:

```text
/adv-proposal add OAuth login without breaking existing session flows
```

Advance will move the change through discovery, agreement, design, planning, implementation, review, hardening, and archive.

For setup details and troubleshooting, see [`SETUP.md`](SETUP.md).

## Develop the plugin

All buildable code lives in [`plugin/`](plugin/). Run commands from that directory.

```bash
cd plugin
pnpm install
pnpm test
pnpm run check
pnpm run build
```

CI runs typecheck → lint → format check → tests → build on Node 20.x and 22.x.

## Runtime model

OpenCode ships as a Bun executable. Advance supports that host while running Temporal worker code through a Node-compatible worker path.

Current Temporal defaults:

| Setting    | Default               |
| ---------- | --------------------- |
| Address    | `127.0.0.1:7233`      |
| Namespace  | `default`             |
| Task queue | `advance-<projectId>` |

Environment variables:

| Variable                    | Default          | Purpose                                                           |
| --------------------------- | ---------------- | ----------------------------------------------------------------- |
| `ADV_TEMPORAL_ADDRESS`      | `127.0.0.1:7233` | Temporal frontend address. Non-loopback requires opt-in.          |
| `ADV_TEMPORAL_NAMESPACE`    | `default`        | Temporal namespace.                                               |
| `ADV_TEMPORAL_ALLOW_REMOTE` | unset            | Set to `true` to permit non-loopback addresses.                   |
| `ADV_NODE_PATH`             | unset            | Absolute Node v20+ path for Bun hosts when Node is not on `PATH`. |

Production storage is Temporal-only. Legacy file/SQLite utilities are retained for tests, migrations, repair, and cross-repo tooling; they are not a runtime fallback.

See [`docs/temporal-recovery.md`](docs/temporal-recovery.md) for worker recovery details.

## Repository map

```text
plugin/              TypeScript OpenCode plugin implementation
  src/tools/         MCP tool implementations
  src/storage/       persistence, migrations, Temporal integration, external state
  src/temporal/      workflows, worker bootstrap, recovery helpers
  src/guards/        bash and sub-agent policy enforcement
  src/validator/     spec validation, prep readiness, task classification
  src/events/        terminal UI/status helpers
  src/utils/         project IDs, debug logs, context snapshots, safe helpers
  schemas/           schema anchor stubs; Zod types are authoritative
.adv/specs/          git-tracked capability specs
.opencode/command/   slash-command workflow contracts
.opencode/agents/    bundled/repo-local ADV agents and overlays
skills/              reusable methodology skills
docs/                gates, checklists, design notes, specs, recovery docs
scripts/             sync, migration, maintenance, blind-test helpers
```

## Documentation map

| Document                                                 | Purpose                                                      |
| -------------------------------------------------------- | ------------------------------------------------------------ |
| [`SETUP.md`](SETUP.md)                                   | Installation, project setup, troubleshooting                 |
| [`ADV_INSTRUCTIONS.md`](ADV_INSTRUCTIONS.md)             | Full ADV operating protocol                                  |
| [`AGENTS.md`](AGENTS.md)                                 | Contributor quick-reference: architecture, commands, gotchas |
| [`docs/adv-gates.md`](docs/adv-gates.md)                 | Gate contracts and sequencing                                |
| [`docs/checklists/`](docs/checklists/)                   | Prep, review, and harden checklists                          |
| [`docs/temporal-recovery.md`](docs/temporal-recovery.md) | Temporal worker recovery model                               |
| [`docs/specs/`](docs/specs/)                             | Generated/spec-facing documentation                          |

## Philosophy

Advance is not trying to make AI coding slower. It is trying to make fast work finish cleanly.

For throwaway scripts, raw chat may be enough. For serious projects, speed without durable scope, evidence, review, recovery, and archive is not speed. It is deferred cleanup.

Advance makes the cleanup part of the system.

## License

MIT
