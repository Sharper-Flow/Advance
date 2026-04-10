# ADV - Spec-Driven Development Instructions

Specs are laws. Requirements are formally defined, validated, and enforced.

## Notation

| Symbol | Meaning |
|--------|---------|
| `→` | Sequence / leads to |
| `←` | Blocked by / depends on |
| `✓` | Complete / verified |
| `○` | Pending / optional |
| `×` | Forbidden / never |
| `⚠` | Attention / warning |

## Core Decision Rules

| When | Then |
|------|------|
| Spec conflicts with proposal | Spec wins |
| Gate incomplete | Archive blocked |
| 3 failed task attempts | Stop → `[ADV:DOOM_LOOP]` → escalate |
| Cross-repo task | Execute in target repo via `workdir` |
| User requests cancellation | Require approval via `adv_task_cancel` |
| TDD required + trivial task | Set `metadata.tdd_intent: "not_applicable"` with reason |
| TDD intent change after prep | Use `adv_task_reclassify_tdd` with user approval |
| User requests skip + gate required | `[ADV:MIC]` → ask for sign-off |

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
| `/adv-research <change-id>` | Retired: use /adv-discover and /adv-design instead |
| `/adv-prep <change-id>` | Analyze gaps and synthesize tasks from validated design decisions |

### Post-Implementation

| Command | Purpose |
|---------|---------|
| `/adv-review <change-id>` | Review deliverables for correctness, security, and architecture quality |
| `/adv-accept <change-id>` | Present deliverable summary and acceptance criteria checklist to user |
| `/adv-harden <change-id>` | Detect low-quality code, verify test coverage, clean up before release |
| `/adv-audit [capability]` | Detect drift between specs and current implementation |
| `/adv-slop-scan [path]` | Scan for AI slop patterns including defensive and nested code |

### Fast-Track / Advanced

| Command | Purpose |
|---------|---------|
| `/adv-task` | Fast-track a discussed change: synthesize contract, validate, prep, and hand off |
| `/adv-refactor <change-id>` | Refresh a stale proposal to reflect current codebase state |
| `/adv-coordinate` | Detect and resolve conflicts across multiple active changes |
| `/adv-improve` | Suggest targeted improvements to existing specs or implementation |
| `/adv-tron [target]` | Investigate codebase structure, hotspots, risks, and suggest follow-up agenda candidates |

## Command Boundaries

| Command | Produces | × MUST NOT | Gate |
|---------|----------|------------|------|
| proposal | Problem statement, criteria, constraints | Create tasks, complete non-owned gates, impl decisions | `proposal` |
| discover | Context analysis, objectives, agreement.md | Create tasks, complete non-discovery gates | `discovery` |
| design | Architecture decisions, design.md | Create tasks, complete non-owned gates, skip research | `design` |
| prep | Task graph, gap analysis, sequencing | Complete non-planning gates, architecture decisions | `planning` |
| task | Change + tasks + gates (fast-track exempt) | — | `proposal` → `planning` |
| apply | Implementation via TDD | Auto-complete pre-implementation gates | `execution` |
| review + accept | Acceptance criteria verified | — | `acceptance` |
| harden + archive | Quality pass, spec deltas applied | — | `release` |

- Only `/adv-prep` (and exempt `/adv-task`) may call `adv_task_add`
- `/adv-apply` stops if discovery, design, or planning gates are pending
- Commands that own boundary-sensitive workflow steps should include `## Command Boundary` details

## Status Markers

Emit at START of each response:

| Marker | When | Emoji |
|--------|------|-------|
| `[ADV:ROCKET]` | Active work | 🚀 |
| `[ADV:TDD_RED]` | Writing tests | 🔴 |
| `[ADV:TDD_GREEN]` | Implementing | 🟢 |
| `[ADV:MOON]` | Sub-agents running | 📡 |
| `[ADV:EARTH]` | Complete / awaiting input | 🌍 |
| `[ADV:DOOM_LOOP]` | Stuck in retry cycle | 💀 |
| `[ADV:MIC]` | Needs user approval | 🎤 |
| `[ADV:TASK_STATUS_REPORT]` | Task report | — |

Tab title: `<emoji> <normalized change>` (strip verb prefixes, Title Case). System-emitted: `[ADV:ACCUMULATED_WISDOM]`, `[ADV:TODO_CONTINUATION]`, `[ADV:RECORD_WISDOM]`

### Context Snapshot

`adv_change_show` includes `_contextSnapshot` — compact summary closing the context agreement gap:
- Change ID/title, gate progress (`[✓ proposal] [✓ discovery] [○ execution] ...`), task counts, current task, workdir

Emitted on: `adv_change_show`, `adv_gate_complete`, `adv_task_update` to `in_progress`.

**Cross-Repo Switch** — emit via `formatCrossRepoSwitch()`:
```
╔═══════════════════════════════════════════════════════════╗
║ 🔀 SWITCHING REPOSITORY CONTEXT                          ║
║ From: ~/dev/frontend  →  To: ~/dev/backend                ║
║ Task: tk-backend01 (Add /api/oauth/callback endpoint)     ║
╚═══════════════════════════════════════════════════════════╝
```

## Critical Protocols

### ADV State Access

× NEVER read ADV state files directly (`read`, `cat`, `ls`). Use ADV MCP tools exclusively.

Forbidden: `~/.local/share/opencode/plugins/advance/**/{change.json,proposal.md,agenda.jsonl,wisdom.jsonl,handoff.json}`

| Need | Tool |
|------|------|
| Change + tasks | `adv_change_show` |
| Update proposal | `adv_change_update` (× never re-call `adv_change_create`) |
| Specific task + changeId | `adv_task_show` |
| Ready tasks | `adv_task_ready` |
| All tasks | `adv_task_list` |
| Active changes | `adv_change_list` |
| Validate | `adv_change_validate` |
| Agenda | `adv_agenda_list` |
| Wisdom | `adv_wisdom_list` |

On direct-read failure → stop, call `adv_change_show` or `adv_task_show`.

### Question Tool UX

Write-in option enforced by P26 (`rules.yaml`). ADV notes:
- Contextual write-in labels (`Other`, `Different approach`) — not generic
- 2-5 options including write-in, concise labels
- Leave custom input enabled

### Autonomy vs User Intuition Protocol

Default to agent autonomy whenever the answer can be derived from the conversation, specs, codebase, prior changes, or tool output.

**Autonomous by default (do not ask just to classify or confirm mechanics):**
- infer change type from the confirmed problem statement and current codebase
- determine affected specs/capabilities and whether a new capability/spec is required
- determine likely spec deltas needed to satisfy the change
- detect cross-repo impact from code paths, interfaces, and related repo config
- auto-select the only plausible target change when resolving `change-id`
- reuse a healthy existing worktree for the same change automatically
- begin execution once the contract/design/planning flow already established intent

**Ask the user when intuition, vision, or approval is required:**
- confirming the problem statement or quick contract matches the desired outcome
- agreeing on objectives, constraints, avoidances, and acceptance criteria
- validating design direction when multiple viable outcomes depend on taste, workflow, or product vision
- resolving conflicts where long-term best practice differs from the user's stated direction
- accepting delivered work against the agreement
- doom-loop recovery after retry budget exhaustion
- task cancellation, destructive actions, or policy-mandated approvals

Rule of thumb: if the question is really "what outcome do you want?" or "are you approving this risk?" → ask. If the question is really "what does the repo/spec/code imply?" → decide.

### Target Resolution Policy

When a command needs a `change-id`:

1. If the user provided one → use it.
2. If there is exactly one plausible active change → auto-select it and state that choice.
3. If multiple changes exist, use arguments + conversation + current workflow stage to choose the best match.
4. Ask via `question` only if 2+ plausible targets remain after that analysis.

× Do NOT ask the user to pick from a list when the agent can resolve the target confidently.

### Tradeoff Prioritizer Protocol

When 2+ viable approaches depend on user values → run prioritizer before asking.

**Default (inline):** Scan code → research tradeoffs → draft criteria questions → pass to `question` tool → restate priorities → recommend.

**Optional (skill):** Load `skill("prioritizer")` for structured criteria question templates and decision map guidance.

Skip for: bug fixes, mechanical work, choices constrained by security/API/architecture.

### Context Freshness

Work one task at a time. Load context in two tiers:

**Phase start (once):** `adv_change_show` → load full change context including proposal, design, gates, and task summary.

**Per task:** `adv_task_show` → load only the current task's details and parent changeId. Review relevant proposal/design sections only when the task description references them.

× Do NOT call `adv_change_show` before every task — it returns the entire change payload and wastes context on already-known information. Reserve it for phase transitions and initial context load.

TodoWrite: use task IDs only (`tk-abc123`), not descriptions.

### TDD Protocol (RSTC)

Inline TDD is default — red/green phases WITHIN each task. × Do NOT create separate test tasks for same scope.

- **RED:** Write failing test → run → `[ADV:TDD_RED]` → show output
- **GREEN:** Implement → run → `[ADV:TDD_GREEN]` → show output
- **Trivial:** Set `metadata.tdd_intent: "not_applicable"` with reason
- **Cross-cutting:** Separate verification tasks OK → mark `metadata.tdd_intent: "separate_verification"`

**TDD Intent Immutability:** After planning gate completes, `metadata.tdd_intent` is frozen on all tasks. To reclassify, use `adv_task_reclassify_tdd` with user approval (mirrors `adv_task_cancel` audit trail). New tasks cannot be added after planning gate is complete.

### Doom Loop Detection

| Exit | Condition |
|------|-----------|
| ✓ Done | Acceptance criteria met |
| 🔁 Doom Loop | 3 failed attempts |
| 🌍 Environmental | Missing dependency → escalate |

After 3 failures: STOP → `[ADV:DOOM_LOOP]` → document all 3 attempts → ask via `question`.

| × Bad | ✓ Good |
|-------|--------|
| Retry same approach | Try different strategy |
| Silent retries | Document each attempt |
| 4+ same method | Escalate after 3 |

### Cross-Repo Execution

| × Invalid Cancellation | ✓ Correct |
|------------------------|-----------|
| "Out of scope for this repo" | Switch `workdir`, execute |
| "Different repository" | Switch `workdir`, execute |
| "Cannot modify external code" | Use `workdir` parameter |

Rules:
1. Tasks with `target_repo`/`target_path` → execute in target directory
2. Switch `workdir` for all tool calls on that task
3. "Different repo" is × NEVER valid cancellation
4. Task hints at another repo but lacks metadata → confirm via `question`

Config: `related_repos` in `project.json` maps repo IDs to paths.

Review/Harden gates block if cross-repo tasks incomplete or cancelled without approval.

### Cancellation Policy

All cancellations require explicit user approval via `adv_task_cancel`.

Workflow: identify tasks + reasons → present to user via `question` → user approves → call `adv_task_cancel` with evidence.

### Task Status Report

On loop stop or compaction: emit `[ADV:TASK_STATUS_REPORT]` with completed/cancelled/remaining. See [docs/adv-task-report.md](docs/adv-task-report.md).

## 7-Gate Quality Checklist

| # | Gate | Triggered By | Artifact |
|---|------|--------------|----------|
| 1 | `proposal` | `/adv-proposal` | `problem-statement.md` |
| 2 | `discovery` | `/adv-discover` + `/adv-agree` | `agreement.md` |
| 3 | `design` | `/adv-design` + `/adv-present` | `design.md` |
| 4 | `planning` | `/adv-prep` | Task graph in `change.json` |
| 5 | `execution` | `/adv-apply` (all tasks done) | Code, docs, ops deliverables |
| 6 | `acceptance` | `/adv-review` + `/adv-accept` | User sign-off |
| 7 | `release` | `/adv-harden` + `/adv-archive` | Spec deltas applied, git finalized |

Gates are sequential. Archive blocks until all 7 are satisfied. See [docs/adv-gates.md](docs/adv-gates.md).

Gate behaviors:
- `discovery`/`planning` evaluate full change including completed tasks — completed work is evidence to validate, not acceptance proof. Add follow-up tasks where gaps found.
- `acceptance` absorbs the old `review` + `signoff` gates. `/adv-review` emits `REVIEW_FINDINGS` block (blocker, issue, suggestion, question). `/adv-accept` presents criteria checklist for user confirmation.
- `release` absorbs the old `harden` gate. `/adv-harden` blocks on unresolved review findings (except `nit:`). Runs merge compatibility check first.
- `/adv-archive` runs Phase 9 Git Finalization: stage → commit → detect default branch → merge/PR → verify → cleanup worktree → remove temp artifacts.

## Command Execution Model

All commands run inline by default. Agents without `task` tool work inline exclusively.

### Slash Command Boundary

Slash commands are top-level entry points for the user/session, not an internal dispatch mechanism for agents.

- Agents must NOT invoke `/adv-*` from inside another agent workflow or sub-agent prompt
- OpenCode may re-dispatch slash commands through command frontmatter `agent:` routing, which can override the current agent context and compound orchestration
- When an agent needs an ADV workflow, it must execute that workflow inline with tools (or read the command file as a contract) rather than calling the slash command itself

### Sub-Agent Orchestration (optional, requires `task` tool)

Available to: `orca`, `plan`, `scout`, `refine`, `general`. Use when 3+ independent scan dimensions benefit from parallelism.

| Command | Inline | Sub-Agent |
|---------|--------|-----------|
| discover | Context7 + Kagi + lgrep | librarian + adv-researcher (single-level only) |
| design | Context7 + Kagi + lgrep | librarian + adv-researcher (single-level only) |
| review | Sequential per dimension | explore × 5 + librarian + general |
| harden | Sequential scans | explore × 6 |
| audit | Sequential pipeline | explore × 4 |
| slop-scan | Sequential categories | explore × 9 (single-level only) |
| tron | lgrep + read | tron agent |
| task | Context7 + Kagi | librarian + adv-researcher |
| refactor | Sequential drift | explore × 3 |

Rules:
- Sub-agents × NEVER spawn sub-agents (`enforceTaskPolicy` blocks nesting)
- Cap parallel bursts at 3-4
- Batch independent work into single spawn message
- × Don't spawn for single-tool-call work
- For `/adv-discover` and `/adv-design`, `librarian`, `adv-researcher`, and `explore` fallback must do the research inline and must not delegate to additional research sub-agents
- For `/adv-slop-scan`, all `explore` scanner workers must do the scan inline and must not delegate to additional sub-agents or invoke `/adv-*` slash commands

Inline-only: `/adv-status`, `/adv-proposal`, `/adv-validate`, `/adv-apply`, `/adv-archive`, `/adv-clarify`, `/adv-agree`, `/adv-present`, `/adv-accept`, `/adv-prep`, `/adv-coordinate`, `/adv-improve`

### Structured Sub-Agent Prompt Protocol

All ADV sub-agent spawns must use this compact prompt format to minimize token overhead:

```
ROLE: {dimension or scanner name}
INPUT: {file list, change-id, workdir}
OUTPUT_SCHEMA: {JSON keys the orchestrator expects back}
BUDGET: {max files to read, max findings to return}
STOP_WHEN: {exit condition — e.g., "all files scanned" or "5 findings reached"}
```

Rules:
- Send only the research question or scan scope — not the full proposal, agreement, or design artifacts
- Pre-filter with `lgrep` or file lists before spawning so workers receive targeted inputs
- Include `WORKING DIRECTORY: {workdir}` (critical in worktrees — sub-agents inherit the default project root, not the worktree path)
- Workers return structured JSON; orchestrator handles synthesis, formatting, and gate decisions

### Orchestration Token-Budget Policy

| Decision | Rule |
|----------|------|
| When to spawn | 3+ independent scan dimensions that benefit from parallelism |
| When to stay inline | Single-tool-call work, sequential dependencies, or fewer than 3 dimensions |
| Max parallel workers | 3-4 concurrent sub-agents per burst |
| Batching | Batch independent spawns into a single message; do not spawn one-at-a-time |
| Worker prompt size | Structured prompt protocol only — no prose narratives, no full proposal text |
| What enters worker context | ROLE/INPUT/OUTPUT/BUDGET/STOP_WHEN + workdir + file paths. × Never full proposal, agreement, or design artifacts |
| Result handling | Workers return JSON; orchestrator synthesizes in a single pass after all workers return |

### Phase Summary Pattern

Large multi-phase commands (discover, design, review, harden) must persist full phase output to artifacts and emit only compact summaries into active context:

1. **Execute phase** — produce full analysis
2. **Persist** — write full output via `adv_change_update` or task notes
3. **Emit summary** — output a 2-5 line structured summary to context (e.g., "Discovery: 4 gaps found, 2 edge cases, 1 LBP concern")
4. **Proceed** — orchestrator continues with the summary, not the full output

This prevents discovery/design/review artifacts from accumulating in the active context window and triggering premature compaction.

## Sub-Agent Selection

### Agent Tiers

| Tier | Agents | Loading |
|------|--------|---------|
| **Core** (always loaded) | `plan`, `build`, `refine`, `scout`, `orca` | Global `~/.config/opencode/agents/` |
| **Common** (always loaded) | `explore`, `librarian`, `general`, `mechanic` | Global `~/.config/opencode/agents/` |
| **Specialist** (repo-scoped) | `adv-researcher`, `tron` | Repo-local `.opencode/agents/` |

### Agent Roster

| Agent | Use For | Tools |
|-------|---------|-------|
| `librarian` | Docs, API refs, code examples | Context7, grep.app, Kagi |
| `adv-researcher` | Architecture validation, simplicity | Context7, Kagi, ADV read-only |
| `explore` | Codebase navigation, find usages | Read, Glob, Grep, lgrep |
| `general` | Complex multi-step implementation | Full tool access |
| `mechanic` | System/infra issues | Vision, bash, read/write |
| `tron` | Reconnaissance, hotspot detection | Read, Glob, Grep, lgrep |

> **Note:** `adv-researcher` and `tron` are repo-local agents — only available in ADV-enabled repos (repos with `.opencode/agents/` containing their definitions).

Orchestrator pattern: spawn `librarian` + `adv-researcher` in parallel → synthesize.

## Skill Discovery Protocol

Implemented in `/adv-discover` Phase 1.5. Improves research quality via domain-specific skills. See also `skills/adv-discover-methodology/SKILL.md` and `docs/checklists/discover-checklist.md`.

Flow: search trusted skill directories only (`~/.config/opencode/skills/*/SKILL.md`, repo `skills/*/SKILL.md`) → read YAML frontmatter → match `keywords` against tech stack + change domain → `skill("{name}")` → apply guidance.

Skill metadata:
```yaml
---
name: my-skill
description: "What this skill provides"
keywords: ["term1", "term2", "term3"]
---
```

Trust boundary: repo-local skills are trusted only from the repository's `skills/` directory. × Never auto-load arbitrary `*/SKILL.md` elsewhere in the repo. Any other path requires explicit user approval.

Graceful degradation: skip skills without frontmatter or `keywords`. No matches → proceed normally. Filesystem-only, no API calls.

## Command vs Skill Boundaries

Commands and skills serve different roles. Use this table to decide where new functionality belongs:

| Use a **command** when | Use a **skill** when |
|------------------------|----------------------|
| User-facing workflow entry point | Reusable methodology or analysis protocol |
| Mutates ADV state (changes, tasks, gates) | Read-only guidance or checklist framework |
| Owns a gate completion | Loaded by multiple commands or sub-agents |
| Requires explicit user invocation | Domain knowledge independent of workflow state |

### Reference Pattern

`adv-tron` is the canonical example of a command backed by a skill:
- **Command** (`.opencode/command/adv-tron.md`) — owns orchestration, sub-agent spawning, ADV state reads, user interaction
- **Skill** (`skills/adv-tron/SKILL.md`) — holds investigation protocol, search priorities, evidence requirements, report schema
- **Fallback** — command includes embedded protocol if skill is unavailable

Commands that fan out to sub-agents with reusable methodology should follow this pattern: load the skill before spawning workers, pass condensed guidance, fall back to embedded protocol if the skill is missing.

### Classification

**Command-only** (no backing skill needed):
`adv-proposal`, `adv-agree`, `adv-design`, `adv-present`, `adv-task`, `adv-validate`, `adv-archive`, `adv-status`, `adv-accept`, `adv-coordinate`, `adv-clarify`, `adv-refactor`

**Retired** (redirects to successor commands):
- `adv-research` → use `/adv-discover` + `/adv-design`

**Command + backing skill** (reusable methodology extracted):
- `adv-discover` → `adv-discover-methodology` skill
- `adv-tron` → `adv-tron` skill
- `adv-review` → `adv-review-methodology` skill
- `adv-harden` → `adv-harden-methodology` skill
- `adv-slop-scan` → `adv-slop-detection` skill
- `adv-prep` → `adv-prep-methodology` skill
- `adv-apply` → `adv-apply-methodology` skill

### Constraints

- Skills × MUST NOT mutate ADV state (no `adv_change_create`, `adv_task_add`, `adv_gate_complete`).
- Skills × MUST NOT own gate completion or workflow sequencing.
- Commands MUST remain functional if a backing skill is unavailable — inline fallback is required.
- Checklist docs (`docs/checklists/`) remain the canonical source; skills reference them, not duplicate them.

## Worktree Integration

ADV uses external mutable state — all worktrees share changes, archive, wisdom, agenda, SQLite cache. Specs remain in-repo (`.adv/specs/`).

### External State

Location: `$XDG_DATA_HOME/opencode/plugins/advance/{project-id}/` (project-id = root commit SHA).

```
{project-id}/
├── changes/     # Active proposals
├── archive/     # Completed
├── db/spec.db   # SQLite FTS cache
├── wisdom.jsonl # Learnings
├── agenda.jsonl # Work queue
└── handoff.json # Session handoff (multi-session only)
```

### Worktree Decision

- 3+ files OR db schema/auth/shared types/breaking API/structural refactor → ask user → create → continue inline
- 1-2 files AND trivial, OR docs/config → proceed in-place

### Worktree Reuse

Before creating: `git worktree list --porcelain` → find `change/{change-id}` branch.
- Path exists → offer reuse (switch `workdir`)
- Path missing → `git worktree prune` → proceed fresh

### Spec Divergence

| Data | Location | Shared? |
|------|----------|---------|
| Specs (`.adv/specs/`) | In-repo, git-tracked | No (branch-local) |
| Changes, archive, wisdom, agenda | External | Yes (keyed by project-id) |

Implication: spec changes in worktree A invisible to B until merged. `/adv-validate` and `/adv-audit` in B may see stale specs. Mitigation: merge promptly after archive (Phase 9 handles this).

### Inline Worktree Protocol

1. `worktree_create` → capture returned worktree path
2. **Immediately** set `workdir` to the worktree path for ALL subsequent tool calls
3. Continue inline — no handoff, no new terminal, no navigation hints needed
4. When deleting, pass `branch` arg to `worktree_delete` (required in inline mode)

### Session Handoff (Fallback)

Multi-session only: parent writes `handoff.json` → child reads/clears on startup → `[ADV:WORKTREE_SESSION]` marker injected.

### Worktree Cleanup

`/adv-archive` Phase 9 handles: stage → commit → detect default branch → merge/PR → verify → `worktree_delete` → remove `.bak`/`.tmp`/`.orig`. × Never delete worktree with unmerged commits.

If `worktree_create`/`worktree_delete` unavailable: `[ADV:INFO] Worktree tools not available — proceeding in-place.`

## When to Use ADV

**Use for:** New features, breaking changes, architecture, compliance
**Skip for:** Bug fixes, typos, deps, exploration
