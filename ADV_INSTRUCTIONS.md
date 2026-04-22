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
| TDD required + trivial task | Mark trivial with reason, skip TDD |
| User requests skip + gate required | `[ADV:MIC]` → ask for sign-off |

## HITL Boundary Model

Each workflow phase has a defined collaboration mode. Agents self-enforce these boundaries.

| Phase | Mode | Detail |
|-------|------|--------|
| `/adv-proposal` | Collaborative | Fully collaborative; approve at end |
| `/adv-research` | Collaborative | Fully collaborative; approve at end |
| `/adv-prep` | HITL hard gate | Vision document → explicit user approval → `userApproved: true` on prep gate |
| `/adv-apply` | Autonomous | No "Begin work" prompt; proceeds after prep approval. Escalate only on failure |
| `/adv-review` | Autonomous + drift detection | Auto-fix within scope; stop on drift |
| `/adv-harden` | Autonomous + drift detection | Auto-fix scoped issues; stop on drift |
| `/adv-archive` | Autonomous | Apply spec deltas, capture wisdom, finalize git |

### Drift Detection Rule

For autonomous phases (`/adv-review`, `/adv-harden`), before auto-remediating any finding, the agent must evaluate:

> "If I apply this fix, will `proposal.md`'s **Success Criteria**, **Acceptance Criteria**, or **Out-of-Scope** sections need to change?"

- **YES** → STOP. Present finding to user via `question` tool (`[ADV:MIC]`).
- **NO** → Auto-remediate within scope.

### Prep Gate Machine Enforcement

The prep gate requires `userApproved: true` in `adv_gate_complete`. Without it, the gate returns an error prompting the agent to obtain user approval first. This is the only machine-enforced HITL gate; other collaborative phases rely on command instructions.

### Backward Compatibility

For changes created before HITL enforcement, `/adv-apply` emits a soft advisory suggesting retroactive approval. This is informational, not a hard block.

### Human Checkpoints (Pause Required)

ADV pauses ONLY at these checkpoints:
- Proposal confirmation — user confirms problem statement
- Agreement sign-off — user approves objectives and acceptance criteria
- Design approval — ONLY when real tradeoffs depend on user values or product vision, OR when the design validator returns CONFLICT, OR when the agent identifies contract-compromise risk (rq-designval04)
- Prep approval — user approves vision doc and task graph (machine-enforced: `userApproved: true` required)
- Acceptance — user confirms delivered work satisfies the agreement
- Archive sign-off — user approves final release
- Cancellation approval — explicit user approval required
- Doom-loop recovery — user guidance required after 3 failed attempts

### Post-Approval Auto-Continue

When the user selects an "approve" or "approve and continue" option at any checkpoint above, the next phase begins inline immediately. No "shall I proceed?", no "ready to start /adv-X?", no second confirmation.

### Between-Checkpoint Flow

Between checkpoints, only system-level interrupts cause pauses:
- Doom-loop detection (3 failed task attempts)
- Cost governance / investment check-in (judgment calls to surface)
- Drift detection (auto-fix boundary exceeded in review/harden)
- Contract-compromise risk identified during design
- Design validator `CONFLICT` verdict
- Prep gate machine enforcement (`userApproved` required)
- Worktree decision (3+ files, ask user)

No other pauses or "shall I continue?" prompts are permitted.

## Phase Goals

Each workflow command has a defined phase goal. These are canonical in `manifest.ts` (`phaseGoal` field on `CommandDef`). Agents should self-check: "Am I still working toward this phase's goal?"

| Phase | Goal |
|-------|------|
| `/adv-proposal` | Clarify the problem, user needs, and acceptance criteria scope. Establish *what* and *why* — no *how*. |
| `/adv-research` | Produce a defined, fully-researched proposed plan ready for user approval. Validate the *how*. |
| `/adv-prep` | Complete the flight-check: every gap closed, every dependency mapped, every task ready — ready for autonomous implementation. |
| `/adv-apply` | Execute the approved plan autonomously. Add discovered tasks within scope. Escalate only on failure. |
| `/adv-review` | Verify implementation matches the approved plan. Auto-fix within scope. Stop on drift. |
| `/adv-harden` | Verify production-readiness. Auto-fix scoped issues. Stop on drift. |
| `/adv-archive` | Promote the change from contract to law: apply spec deltas, capture wisdom, clean up. |

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
| `/adv-research <target>` | Produce a defined, fully-researched proposed plan ready for user approval |
| `/adv-discover <change-id>` | Gather context, analyze current state, identify objectives, and obtain user agreement |
| `/adv-design <change-id>` | Validate architecture decisions, produce implementation strategy, and present design for user review |
| `/adv-prep <change-id>` | Analyze gaps and synthesize tasks from validated research findings |

### Post-Implementation

| Command | Purpose |
|---------|---------|
| `/adv-review <change-id>` | Review code for correctness, security, and architecture; emit REVIEW_FINDINGS |
| `/adv-harden <change-id>` | Detect low-quality code, verify test coverage, clean up; block archive on open findings |
| `/adv-audit [capability]` | Detect drift between specs and current implementation |
| `/adv-slop-scan [path]` | Scan for AI slop patterns including defensive and nested code |

### Fast-Track / Advanced

| Command | Purpose |
|---------|---------|
| `/adv-task` | Fast-track a discussed change: synthesize contract, validate best practices, prep, and hand off |
| `/adv-refactor <change-id>` | Refresh a stale proposal to reflect current codebase state |
| `/adv-coordinate` | Detect and resolve conflicts across multiple active changes |
| `/adv-improve` | Suggest targeted improvements to existing specs or implementation |
| `/adv-tron [target]` | Investigate codebase structure, hotspots, risks, and suggest follow-up agenda candidates |

## Command Boundaries

| Command | Produces | × MUST NOT | Gate |
|---------|----------|------------|------|
| proposal | Problem statement, criteria, constraints | Create tasks, complete gates, impl decisions | None |
| research | Validated approach, findings in proposal.md | Create tasks, complete non-research gates | research |
| prep | Task graph, gap analysis, sequencing | Complete non-prep gates, architecture decisions | prep |
| task | Change + tasks + gates (fast-track exempt) | — | research + prep |
| apply | Implementation via TDD | Auto-complete research/prep gates | implementation |

- Only `/adv-prep` (and exempt `/adv-task`) may call `adv_task_add`
- `/adv-apply` stops if research or prep gates pending
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
- Change ID/title, gate progress (`[✓ research] [○ impl] ...`), task counts, current task, workdir

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

### Tradeoff Prioritizer Protocol

When 2+ viable approaches depend on user values → run prioritizer before asking.

**Default (inline):** Scan code → research tradeoffs → draft criteria questions → pass to `question` tool → restate priorities → recommend.

**Optional (skill):** Load `skill("prioritizer")` for structured criteria question templates and decision map guidance.

Skip for: bug fixes, mechanical work, choices constrained by security/API/architecture.

### Context Freshness

Phase start (once): `adv_change_show` → load full context snapshot.
Per task: `adv_task_show` → refresh only the current task. Do NOT call adv_change_show before every task — use the lighter per-task refresh.

TodoWrite: use task IDs only (`tk-abc123`), not descriptions.

### TDD Protocol (RSTC)

Inline TDD is default — red/green phases WITHIN each task. × Do NOT create separate test tasks for same scope.

- **RED:** `[ADV:TDD_RED]` → write failing test using editing tool (`edit` / `write` / `morph_edit`) → run with `adv_run_test phase:'red'` → show failure evidence
- **GREEN:** `[ADV:TDD_GREEN]` → implement using editing tool → run with `adv_run_test phase:'green'` → if fails: retry protocol → show pass evidence
- **Trivial:** Note `(trivial: docs change)`, skip TDD
- **Cross-cutting:** Separate verification tasks OK → mark `metadata.tdd_intent: "separate_verification"`

`adv_task_evidence` is fallback for externally captured evidence, not the primary inline-TDD path.

### Task Checkpoint Commits

Every `/adv-apply` task with file changes in its workdir MUST produce a git commit via `adv_task_checkpoint` before transitioning to `status:'done'`. Cancellations MUST checkpoint before `status:'cancelled'`. Enforcement is at the `/adv-apply` command seam (step 3c.5), not in `adv_task_update` itself.

**Apply-loop ordering:**

| Step | Action |
|------|--------|
| 3a | Start — `adv_task_update status: "in_progress"` |
| 3b | Red Phase — write failing test |
| 3c | Green Phase — implement, tests pass |
| 3c.5 | **Checkpoint** — `adv_task_checkpoint` |
| 3d | Complete — `adv_task_update status: "done"` |

**Failure classification:**

| Classification | Action |
|----------------|--------|
| `SEMANTIC` (hook rejection, merge conflict) | Diagnose, re-run (retry budget) |
| `ENVIRONMENTAL` (not a git repo, detached HEAD) | Escalate via `question` |
| `TRANSIENT` (index.lock contention) | Tool retries internally; remaining failure → SEMANTIC |

**Commit message format:**
- Complete: `task(tk-xxxx): completed`
- Cancel: `task(tk-xxxx): cancel — <reason>`

**Staging:** `git add -A` — `.gitignore` is the safety net.

**Anti-patterns:**
- × Do NOT run git from inside a Temporal workflow or activity
- × Do NOT create `--allow-empty` commits
- × Do NOT bypass checkpoint for "small" tasks — clean-tree returns `{status:'clean'}` without committing

Cross-link: `/adv-apply` command (`.opencode/command/adv-apply.md`) step 3c.5. `/adv-task` fast-track parity is tracked as a follow-up.

### Doom Loop Detection

| Exit | Condition |
|------|-----------|
| ✓ Done | Acceptance criteria met |
| 🔁 Doom Loop | 3 failed attempts |
| 🌍 Environmental | Missing dependency → escalate |

After 3 failures: STOP → `[ADV:DOOM_LOOP]` → document all 3 attempts → ask via `question`. Record `strategy_label` in `error_recovery.attempts[]`.

| × Bad | ✓ Good |
|-------|--------|
| Retry same approach | Try different strategy |
| Silent retries | Document each attempt |
| 4+ same method | Escalate after 3 |

### Investment Check-In

When an ADV change reaches /adv-apply, pending judgment calls are surfaced before execution. The `adv_investment_report` tool produces tier classification (auto/escalate/hardstop). Hard-stop is advisory in v1 — does NOT trigger adv_change_reenter. Doom-loop supersede: doom-loop recovery supersedes investment check-in on simultaneous trigger. Unresolved user-value tradeoff triggers escape-clause citation (rq-autonomy01). See `.opencode/instructions/cost-governance.md` and `skills/adv-cost-governance-methodology/SKILL.md` for methodology and thresholds.

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

### Post-Remediation Re-Verification

After `/adv-review` or `/adv-harden` fixes findings, re-scan only affected dimensions. Do NOT re-run all scanners after fixes.

### Validated In-Scope Remediation Policy

Validated in-scope findings from review/harden MUST be fixed before archive. No report-only, future-work, or accepted-debt path for findings within the change's touched scope. Out-of-scope findings are documented separately and do not block archive.

### Touched-Scope Quality Ownership

Quality obligations extend to:
- Directly touched implementation files
- Adjacent tests and docs
- Same-pattern local subsystem issues (P25 related-scan)

Do NOT expand into implicit repo-wide refactors or untouched subsystems. Campsite-rule fixes (P23) are opportunistic and must be small, safe, and local.

## 6-Gate Quality Checklist

| Gate | Triggered By |
|------|--------------|
| 1. `research` | `/adv-research` |
| 2. `prep` | `/adv-prep` |
| 3. `implementation` | All tasks done |
| 4. `review` | `/adv-review` |
| 5. `harden` | `/adv-harden` |
| 6. `signoff` | User confirmation |

Gates are sequential. Archive blocks until all 6 satisfied. See [docs/adv-gates.md](docs/adv-gates.md).

Gate behaviors:
- `research`/`prep` evaluate full change including completed tasks — completed work is evidence to validate, not acceptance proof. Add follow-up tasks where gaps found.
- `review` emits `REVIEW_FINDINGS` block (blocker, issue, suggestion, question).
- `harden` blocks on unresolved review findings (except `nit:`). Runs merge compatibility check first.
- `archive` runs Phase 9 Git Finalization: stage → commit → detect default branch → merge/PR → verify → cleanup worktree → remove temp artifacts.

## Command Execution Model

All commands run inline by default. Agents without `task` tool work inline exclusively.

### Slash Command Boundary

Slash commands are top-level entry points for the user/session, not an internal dispatch mechanism for agents.

- Agents must NOT invoke `/adv-*` from inside another agent workflow or sub-agent prompt
- OpenCode may re-dispatch slash commands through command frontmatter `agent:` routing, which can override the current agent context and compound orchestration
- When an agent needs an ADV workflow, it must execute that workflow inline with tools (or read the command file as a contract) rather than calling the slash command itself

### Sub-Agent Orchestration (optional, requires `task` tool)

Available to agents with `task: true` in their frontmatter: `adv`, `build`, `plan`. Use when 3+ independent scan dimensions benefit from parallelism.

| Command | Inline | Sub-Agent |
|---------|--------|-----------|
| research | Context7 + Kagi + lgrep | librarian + adv-researcher (single-level only) |
| review | Sequential per dimension | explore × 5 + librarian + general |
| harden | Sequential scans | explore × 6 |
| audit | Sequential pipeline | explore × 4 |
| slop-scan | Sequential categories | explore × 9 (single-level only) |
| tron | lgrep + read | adv-tron agent |
| task | Context7 + Kagi | librarian + adv-researcher |
| refactor | Sequential drift | explore × 3 |

Rules:
- Sub-agents × NEVER spawn sub-agents (`enforceTaskPolicy` blocks nesting)
- Cap parallel bursts at 3-4
- Batch independent work into single spawn message
- × Don't spawn for single-tool-call work
- For `/adv-research`, `librarian`, `adv-researcher`, and `explore` fallback must do the research inline and must not delegate to additional research sub-agents
- For `/adv-slop-scan`, all `explore` scanner workers must do the scan inline and must not delegate to additional sub-agents or invoke `/adv-*` slash commands

Design gate requires mandatory independent validator (adv-researcher) before gate completion. See /adv-design command for verdict handling (VALIDATED, CAUTION, CONFLICT, INCONCLUSIVE).

Inline-only: `/adv-status`, `/adv-proposal`, `/adv-validate`, `/adv-archive`, `/adv-clarify`, `/adv-prep`, `/adv-coordinate`, `/adv-improve`

### Delegation Routing

| Priority | Check | Result |
| --- | --- | --- |
| 1 | `metadata.delegation_hint` set? | Use hint value |
| 2 | `tdd_intent == "not_applicable"`? | `delegate_allowed` |
| 3 | Title matches `isTrivialTask` patterns? | `delegate_allowed` |
| 4 | Risk signals (multi-file, cross-repo, architectural keywords)? | `inline_required` |
| 5 | Default | `inline_required` |

ADV code-writing delegation targets `adv-engineer` (not `general`). Verify-burst and non-ADV multi-step work remain on `general`.

### Context Packet Standards

Apply packet includes: WORKING DIRECTORY, CHANGE, TASK, AFFECTED FILES, DESIGN EXCERPT, ACCEPTANCE CRITERIA, EXPECTED OUTPUT.

EXPECTED OUTPUT for delegated implementation: implement the task, run tests, emit a fenced `ENGINEER_REPORT` JSON block per `.opencode/agents/adv-engineer.md`.

#### ENGINEER_REPORT Payload

Required top-level keys: `schema_version`, `change_id`, `task_id`, `agent`, `scope`, `status`, `files_touched`, `verification`, `decisions`, `blockers`, `follow_ups`, `related_scan`, `context_update_for_adv` (with `what_ads_needs_to_know`, `suggested_next_action`).

The `agent` field MUST be the literal string `"adv-engineer"` — matching the subagent filename in `.opencode/agents/adv-engineer.md`.

Full schema and example: `.opencode/agents/adv-engineer.md` § ENGINEER_REPORT Payload.

### Structured Sub-Agent Prompt Protocol

Every sub-agent spawn must include: ROLE:, OUTPUT_SCHEMA:, BUDGET:, STOP_WHEN:. See individual command files for dimension-specific packets.

### Orchestration Token-Budget Policy

When to spawn: 3+ independent scan dimensions. Max parallel workers: 3-4. Cap total sub-agents per command at 6. Use inline work for sequential or context-dependent tasks.

### Phase Summary Pattern

After each phase, use `adv_change_update` to record compact summaries. Do not duplicate full context — reference change state via `adv_change_show` for detailed inspection.

## Sub-Agent Selection

### Agent Tiers

| Tier | Agents | Loading |
|------|--------|---------|
| **Primary** (user-selectable top-level) | `adv`, `plan`, `build` | Global `~/.config/opencode/agents/` |
| **Common subagents** (spawnable via Task tool) | `explore`, `general`, `librarian`, `mechanic`, `prioritizer` | Global `~/.config/opencode/agents/` |
| **ADV Specialist** (spawnable, bundled global) | `adv-researcher`, `adv-engineer` | Global `~/.config/opencode/agents/` |
| **Repo-Local** (spawnable, repo-scoped) | `adv-tron` | Repo-local `.opencode/agents/` |

> **Primary vs subagent:** Only `mode: subagent` agents are spawnable via the Task tool. `adv`, `plan`, and `build` are primary agents — users switch to them directly; they cannot be invoked through sub-agent spawning.

### Agent Roster

| Agent | Use For | Tools |
|-------|---------|-------|
| `librarian` | Docs, API refs, code examples | Context7, grep.app, Kagi |
| `adv-researcher` | Architecture validation, simplicity | Context7, Kagi, ADV read-only |
| `explore` | Codebase navigation, find usages | Read, Glob, Grep, lgrep |
| `adv-engineer` | Delegated ADV code-writing executor | Full write (read/write/edit/bash) + narrow ADV reads + evidence |
| `general` | Verify-only bursts + generic multi-step non-ADV work | Full tool access |
| `mechanic` | System/infra issues | Vision, bash, read/write |
| `adv-tron` | Reconnaissance, hotspot detection | Read, Glob, Grep, lgrep |

> **Note:** `adv-tron` is a repo-local agent — only available in ADV-enabled repos (repos with `.opencode/agents/adv-tron.md`). `adv-researcher` and `adv-engineer` are bundled global specialists — synced to `~/.config/opencode/agents/` by this repo's sync script; they are available in any session where the global install has been synced from an ADV-enabled repo. All ADV-shipped sub-agents follow the `adv-<name>` naming convention.

Orchestrator pattern: spawn `librarian` + `adv-researcher` in parallel → synthesize.

## Skill Discovery Protocol

Enabled in `/adv-research` Phase 1.5. Improves research quality via domain-specific skills.

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

**Command-only** (no fixed skill load; may reference skill-discovery protocol):
`adv-proposal`, `adv-research`, `adv-task`, `adv-validate`, `adv-archive`, `adv-status`, `adv-coordinate`, `adv-clarify`, `adv-refactor`, `adv-improve`, `adv-design`, `adv-audit`

**Command + dedicated backing skill** (loads a single-purpose skill with inline fallback):
- `adv-tron` → `adv-tron` skill

**Command + shared/cross-cutting skill** (loads a reusable methodology skill also used by other commands):
- `adv-prep` → `adv-cost-governance-methodology` (Phase J: judgment-call identification)
- `adv-apply` → `adv-cost-governance-methodology` (Phase 1.5: investment check-in)
- `adv-harden` → `adv-slop-detection` (Phase 0: AI-slop scanner methodology)
- `adv-slop-scan` → `adv-slop-detection` (Phase 0: two-phase detection strategy)

**Command with embedded methodology** (inlined `## Phase 0: Embedded Methodology` block; may also load a cross-cutting skill):
- `adv-discover` — dynamic skill discovery (Phase 1.5) + embedded methodology
- `adv-prep` — embedded prep methodology + `adv-cost-governance-methodology`
- `adv-apply` — embedded apply methodology + `adv-cost-governance-methodology`
- `adv-review` — methodology inlined in `.opencode/command/adv-review.md` Phase 0

**Dynamic skill discovery** (no fixed backing skill; scans and loads matching skills at runtime):
- `adv-discover` — loads skills matching change domain via `skill("{name}")` (Phase 1.5)
- `adv-research` — references skill discovery protocol; may load matching skills

> Stale-reference note: earlier iterations shipped `adv-review-methodology` and `adv-harden-methodology` skill files. These were inlined into the commands and the skill files deleted. If you see an agent call `skill("adv-review-methodology")` or `skill("adv-apply-methodology")`, it is a stale/hallucinated reference — read the command file's Phase 0 section instead.

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
