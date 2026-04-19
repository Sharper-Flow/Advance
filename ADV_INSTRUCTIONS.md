# ADV - Spec-Driven Development Instructions

Specs are laws. Requirements are formally defined, validated, and enforced.

## Notation

| Symbol | Meaning                 |
| ------ | ----------------------- |
| `→`    | Sequence / leads to     |
| `←`    | Blocked by / depends on |
| `✓`    | Complete / verified     |
| `○`    | Pending / optional      |
| `×`    | Forbidden / never       |
| `⚠`    | Attention / warning     |

## Core Decision Rules

| When                               | Then                                                    |
| ---------------------------------- | ------------------------------------------------------- |
| Spec conflicts with proposal       | Spec wins                                               |
| Gate incomplete                    | Archive blocked                                         |
| 3 failed task attempts             | Stop → `[ADV:DOOM_LOOP]` → escalate                     |
| Cross-repo task                    | Execute in target repo via `workdir`                    |
| User requests cancellation         | Require approval via `adv_task_cancel`                  |
| Scope expansion during execution   | Route through `adv_change_reenter` with user approval   |
| TDD required + trivial task        | Set `metadata.tdd_intent: "not_applicable"` with reason |
| TDD intent change after prep       | Use `adv_task_reclassify_tdd` with user approval        |
| User requests skip + gate required | `[ADV:MIC]` → ask for sign-off                          |

## Commands

### Core Workflow

| Command                     | Purpose                                                                     |
| --------------------------- | --------------------------------------------------------------------------- |
| `/adv-status`               | Show project overview: specs, active changes, and next-step recommendations |
| `/adv-proposal <summary>`   | Extract problem statement and confirm with user before proceeding           |
| `/adv-validate <change-id>` | Validate change compliance against specs; block archive on failure          |
| `/adv-apply <change-id>`    | Implement change with TDD, retry on failure, and final verification         |
| `/adv-archive <change-id>`  | Archive completed change: apply spec deltas and finalize git                |

### Pre-Implementation

| Command                     | Purpose                                                             |
| --------------------------- | ------------------------------------------------------------------- |
| `/adv-clarify`              | Ask clarifying questions to resolve ambiguous requirements          |
| `/adv-discover <change-id>` | Gather context, analyze current state, and identify objectives      |
| `/adv-agree <change-id>`    | Present objectives and constraints for user acceptance              |
| `/adv-design <change-id>`   | Validate architecture decisions and produce implementation strategy |
| `/adv-present <change-id>`  | Present concise design overview for user review before planning     |
| `/adv-research <change-id>` | Retired: use /adv-discover and /adv-design instead                  |
| `/adv-prep <change-id>`     | Analyze gaps and synthesize tasks from validated design decisions   |

### Post-Implementation

| Command                   | Purpose                                                                 |
| ------------------------- | ----------------------------------------------------------------------- |
| `/adv-review <change-id>` | Review deliverables for correctness, security, and architecture quality |
| `/adv-accept <change-id>` | Present deliverable summary and acceptance criteria checklist to user   |
| `/adv-harden <change-id>` | Detect low-quality code, verify test coverage, clean up before release  |
| `/adv-audit [capability]` | Detect drift between specs and current implementation                   |
| `/adv-slop-scan [path]`   | Scan for AI slop patterns including defensive and nested code           |

### Fast-Track / Advanced

| Command                     | Purpose                                                                                  |
| --------------------------- | ---------------------------------------------------------------------------------------- |
| `/adv-task`                 | Fast-track a discussed change: synthesize contract, validate, prep, and hand off         |
| `/adv-refactor <change-id>` | Refresh a stale proposal to reflect current codebase state                               |
| `/adv-coordinate`           | Detect and resolve conflicts across multiple active changes                              |
| `/adv-improve`              | Suggest improvements and persist a competitor research pack for /adv-discover reuse      |
| `/adv-tron [target]`        | Investigate codebase structure, hotspots, risks, and suggest follow-up agenda candidates |

## Command Boundaries

| Command                                                                                                                                                                                                            | Produces                                                                    | × MUST NOT                                                                                              | Gate                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------- |
| proposal                                                                                                                                                                                                           | Problem statement, criteria, constraints, discovery agenda (knowledge gaps) | Create tasks, complete non-owned gates, impl decisions, recommendations based on unverified assumptions | `proposal`              |
| discover                                                                                                                                                                                                           | Context analysis, objectives, agreement.md                                  | Create tasks, complete non-discovery gates                                                              | `discovery`             |
| design                                                                                                                                                                                                             | Architecture decisions, design.md, validator verdict                        | Create tasks, complete non-owned gates, skip research                                                   | `design`                |
| prep                                                                                                                                                                                                               | Task graph, gap analysis, sequencing                                        | Complete non-planning gates, architecture decisions                                                     | `planning`              |
| task                                                                                                                                                                                                               | Change + tasks + gates (fast-track exempt)                                  | —                                                                                                       | `proposal` → `planning` |
| apply                                                                                                                                                                                                              | Implementation via TDD                                                      | Auto-complete pre-implementation gates                                                                  | `execution`             |
| review + accept                                                                                                                                                                                                    | Acceptance criteria verified                                                | —                                                                                                       | `acceptance`            |
| harden + archive                                                                                                                                                                                                   | Quality pass, spec deltas applied                                           | —                                                                                                       | `release`               |
| Only `/adv-prep` (and exempt `/adv-task`) may call `adv_task_add`. `/adv-apply` stops if pre-impl gates pending. Commands that own boundary-sensitive workflow steps should include `## Command Boundary` details. |                                                                             |                                                                                                         |                         |

## Status Markers

Emit at START of each response:

| Marker                                                                                                                                                                   | When                      | Emoji |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------- | ----- |
| `[ADV:ROCKET]`                                                                                                                                                           | Active work               | 🚀    |
| `[ADV:TDD_RED]`                                                                                                                                                          | Writing tests             | 🔴    |
| `[ADV:TDD_GREEN]`                                                                                                                                                        | Implementing              | 🟢    |
| `[ADV:MOON]`                                                                                                                                                             | Sub-agents running        | 📡    |
| `[ADV:EARTH]`                                                                                                                                                            | Complete / awaiting input | 🌍    |
| `[ADV:DOOM_LOOP]`                                                                                                                                                        | Stuck in retry cycle      | 💀    |
| `[ADV:MIC]`                                                                                                                                                              | Needs user approval       | 🎤    |
| `[ADV:TASK_STATUS_REPORT]`                                                                                                                                               | Task report               | —     |
| Tab title: `<emoji> <normalized change>` (strip verb prefixes, Title Case). System-emitted: `[ADV:ACCUMULATED_WISDOM]`, `[ADV:TODO_CONTINUATION]`, `[ADV:RECORD_WISDOM]` |                           |       |

### Context Snapshot

`adv_change_show` includes `_contextSnapshot` — change ID/title, gate progress (`[✓ proposal] [✓ discovery] [○ execution] ...`), task counts, current task, workdir. Emitted on: `adv_change_show`, `adv_gate_complete`, `adv_task_update` to `in_progress`. For lightweight refresh use `adv_change_summary`.
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

| Need                                                                      | Tool                                                      |
| ------------------------------------------------------------------------- | --------------------------------------------------------- |
| Change + tasks                                                            | `adv_change_show`                                         |
| Lightweight change context                                                | `adv_change_summary`                                      |
| Update proposal                                                           | `adv_change_update` (× never re-call `adv_change_create`) |
| Reopen gates for scope expansion                                          | `adv_change_reenter`                                      |
| Specific task + changeId                                                  | `adv_task_show`                                           |
| Ready tasks                                                               | `adv_task_ready`                                          |
| All tasks                                                                 | `adv_task_list`                                           |
| Active changes                                                            | `adv_change_list`                                         |
| Validate                                                                  | `adv_change_validate`                                     |
| Agenda                                                                    | `adv_agenda_list`                                         |
| Wisdom                                                                    | `adv_wisdom_list`                                         |
| On direct-read failure → stop, call `adv_change_show` or `adv_task_show`. |                                                           |

### ADV Tool Availability Probe

× NEVER declare ADV tools "unavailable" or self-block a command without first calling `adv_status`. The plugin installs a degraded tool map when init fails — every `adv_*` tool remains callable and returns a structured `ADV_PLUGIN_INIT_FAILED` payload with the root cause and remediation.

| Observation                                   | Correct response                                                        |
| --------------------------------------------- | ----------------------------------------------------------------------- |
| You believe adv_* tools are missing           | Call `adv_status`; report its output                                    |
| `adv_status` returns `ADV_PLUGIN_INIT_FAILED` | Stop, quote `error` + `remediation` verbatim, ask user how to proceed   |
| `adv_status` returns normal payload           | Tools are live — proceed with the command contract                      |
| A tool returns `ADV_PLUGIN_INIT_FAILED`       | Treat as plugin-level failure, not a per-tool bug; report once and stop |

× DO NOT assume tool unavailability from knowledge or pattern-matching; verify with one call. × DO NOT attempt direct filesystem reads as a workaround.

### Question Tool UX

Write-in option enforced by P26 (`rules.yaml`). Use contextual labels, 2-5 options, leave custom input enabled.

When subjective layout/UX/tradeoff choices benefit from side-by-side comparison, render a compact visual comparison block in normal assistant output **before** the `question` call. Use text-first deterministic formats, keep screenshots optional with text fallback, and do not add visual blocks for simple confirmations/cancellations. Keep displayed options aligned with final `question` options. See `docs/adv-question-tool.md`.

### Tradeoff Prioritizer Protocol

When 2+ viable approaches depend on user values → run prioritizer before asking.

**Default (inline):** scan code → research → draft criteria → `question` tool → recommend.

**Optional (skill):** `skill("prioritizer")`.

Skip for: bug fixes, mechanical work, constrained choices.

### Context Freshness

Work one task at a time. Two tiers:

- **Phase start (once):** `adv_change_show` → full change context
- **Per task:** `adv_task_show` → task details, then `adv_wisdom_list` → learnings
  × Do NOT call `adv_change_show` before every task — use `adv_change_summary` or `adv_task_show` instead. TodoWrite: task IDs only (`tk-abc123`).

### TDD Protocol (RSTC)

Inline TDD is default — red/green phases WITHIN each task. × Do NOT create separate test tasks for same scope.

- **RED:** Write failing test → run → `[ADV:TDD_RED]` → show output
- **GREEN:** Implement → run → `[ADV:TDD_GREEN]` → show output
- **Trivial:** Set `metadata.tdd_intent: "not_applicable"` with reason
  | **Cross-cutting:** Separate verification tasks OK → `metadata.tdd_intent: "separate_verification"`
  After planning gate, `metadata.tdd_intent` is frozen. To reclassify: `adv_task_reclassify_tdd` with user approval.

### Doom Loop Detection

| Exit                                                                                                                                                                                                                      | Condition                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| ✓ Done                                                                                                                                                                                                                    | Acceptance criteria met       |
| 🔁 Doom Loop                                                                                                                                                                                                              | 3 failed attempts             |
| 🌍 Environmental                                                                                                                                                                                                          | Missing dependency → escalate |
| After 3 failures: STOP → `[ADV:DOOM_LOOP]` → document all 3 attempts → ask via `question`. Each retry must use a different strategy. Record `strategy_label` in each `error_recovery.attempts[]` entry for deduplication. |                               |

### Cross-Repo Execution

| × Invalid Cancellation                                                                                                                                                                                                                                                                | ✓ Correct                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| "Out of scope for this repo"                                                                                                                                                                                                                                                          | Switch `workdir`, execute |
| "Different repository"                                                                                                                                                                                                                                                                | Switch `workdir`, execute |
| "Cannot modify external code"                                                                                                                                                                                                                                                         | Use `workdir` parameter   |
| Tasks with `target_repo`/`target_path` → execute in target directory. Switch `workdir` for all tool calls. Config: `related_repos` in `project.json`. Task hints at another repo without metadata → confirm via `question`. Review/Harden gates block if cross-repo tasks incomplete. |                           |

### Cancellation Policy

All cancellations require explicit user approval via `adv_task_cancel`. Workflow: identify tasks + reasons → present via `question` → user approves → execute.

### Re-Entry Protocol (Scope Expansion)

New scope after gate progress → `adv_change_reenter(changeId, fromGate, reason, scopeDelta?, approvalEvidence?)`. Reopening gate X resets X + all downstream to `pending`; upstream stays `done`; tasks preserved.

Use for: new acceptance criteria, invalidated architecture, scope expansion on completed gates. NOT for: bug fixes, clarifications (`adv_change_update`), minor doc edits.

Flow: identify affected gate → `adv_change_reenter` → walk reopened gates → resume `/adv-apply`. Each re-entry appends to `reentry_history[]`.

### Task Status Report

On loop stop or compaction: emit `[ADV:TASK_STATUS_REPORT]` with completed/cancelled/remaining. See [docs/adv-task-report.md](docs/adv-task-report.md).

## 7-Gate Quality Checklist

| #                                                                                                                                                                                                                                                                                                                                                                                   | Gate         | Triggered By                   | Artifact                           |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------ | ---------------------------------- |
| 1                                                                                                                                                                                                                                                                                                                                                                                   | `proposal`   | `/adv-proposal`                | `problem-statement.md`             |
| 2                                                                                                                                                                                                                                                                                                                                                                                   | `discovery`  | `/adv-discover` + `/adv-agree` | `agreement.md`                     |
| 3                                                                                                                                                                                                                                                                                                                                                                                   | `design`     | `/adv-design` + `/adv-present` | `design.md` + validator verdict    |
| 4                                                                                                                                                                                                                                                                                                                                                                                   | `planning`   | `/adv-prep`                    | Task graph in `change.json`        |
| 5                                                                                                                                                                                                                                                                                                                                                                                   | `execution`  | `/adv-apply` (all tasks done)  | Code, docs, ops deliverables       |
| 6                                                                                                                                                                                                                                                                                                                                                                                   | `acceptance` | `/adv-review` + `/adv-accept`  | User sign-off                      |
| 7                                                                                                                                                                                                                                                                                                                                                                                   | `release`    | `/adv-harden` + `/adv-archive` | Spec deltas applied, git finalized |
| Gates are sequential. Archive blocks until all 7 satisfied. Can reopen via `adv_change_reenter`. Gate behaviors: `discovery`/`planning` evaluate full change including completed tasks. `acceptance` = `/adv-review` REVIEW_FINDINGS + `/adv-accept` criteria checklist. `release` = `/adv-harden` (blocks on unresolved findings except `nit:`) + `/adv-archive` Git Finalization. |              |                                |                                    |

## Command Execution Model

All commands run inline by default. Agents without `task` tool work inline exclusively.

### Slash Command Boundary

Slash commands are top-level user entry points, not internal dispatch mechanism. Agents × MUST NOT invoke `/adv-*` from inside another workflow. Use ADV tools directly or read command file as contract.

### Sub-Agent Orchestration (optional, requires `task` tool)

Available to: `adv`, `plan`, `scout`, `refine`, `general`.

| Command   | Inline                                                         | Sub-Agent                                      |
| --------- | -------------------------------------------------------------- | ---------------------------------------------- |
| discover  | Context7 + Kagi + lgrep                                        | librarian + adv-researcher (single-level only) |
| design    | Context7 + Kagi + lgrep + mandatory validator (adv-researcher) | librarian + adv-researcher (single-level only) |
| review    | Sequential per dimension                                       | explore × 5 + librarian + general              |
| harden    | Sequential scans                                               | explore × 6                                    |
| audit     | Sequential pipeline                                            | explore × 4                                    |
| slop-scan | Sequential categories                                          | explore × 9 (single-level only)                |
| tron      | lgrep + read                                                   | tron agent                                     |
| task      | Context7 + Kagi                                                | librarian + adv-researcher                     |
| apply     | Inline default, selective delegation                           | general (for trivial tasks)                    |
| refactor  | Sequential drift                                               | explore × 3                                    |

Sub-agents × NEVER spawn sub-agents (`enforceTaskPolicy` blocks nesting). Cap parallel bursts at 3-4. Don't spawn for single-tool-call work. `/adv-discover` and `/adv-design` workers must research inline. `/adv-slop-scan` workers must scan inline.

For `/adv-slop-scan`, all `explore` scanner workers must do the scan inline and must not delegate to additional sub-agents or invoke `/adv-*` slash commands.

Inline-only: `/adv-status`, `/adv-proposal`, `/adv-validate`, `/adv-archive`, `/adv-clarify`, `/adv-agree`, `/adv-present`, `/adv-accept`, `/adv-prep`, `/adv-coordinate`, `/adv-improve`

### Delegation Routing

`/adv-apply` evaluates each task for delegation eligibility before TDD phases:

| Priority                                                                                                                                                                                                                                                                                                                                                    | Check                                                 | Result             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------ |
| 1                                                                                                                                                                                                                                                                                                                                                           | `metadata.delegation_hint` set?                       | Use hint value     |
| 2                                                                                                                                                                                                                                                                                                                                                           | `tdd_intent == "not_applicable"`?                     | `delegate_allowed` |
| 3                                                                                                                                                                                                                                                                                                                                                           | Title matches `isTrivialTask` patterns?               | `delegate_allowed` |
| 4                                                                                                                                                                                                                                                                                                                                                           | Risk signals (multi-file, cross-repo, arch keywords)? | `inline_required`  |
| 5                                                                                                                                                                                                                                                                                                                                                           | Default                                               | `inline_required`  |
| `delegation_hint` values: `inline_required` (never delegate), `delegate_allowed` (delegate when no risk signals force inline), `delegate_preferred` (delegate by default unless an execution precondition makes delegation impossible). Set during `/adv-prep` via task metadata. If delegated task fails → immediate inline fallback (no sub-agent retry). |                                                       |                    |

### Context Packet Standards

Three packet shapes for delegated work. Built from `adv_task_list` + `adv_change_show` at spawn time.
**Apply packet:** WORKING DIRECTORY, CHANGE (id + title), TASK (id + title + type + tdd_intent), AFFECTED FILES, DESIGN EXCERPT (if referenced), ACCEPTANCE CRITERIA (relevant to task), EXPECTED OUTPUT.
**Review/Harden packet:** WORKING DIRECTORY, CHANGE (id + title + gate), AFFECTED FILES (with change summary), ACCEPTANCE CRITERIA (full list), TASK EVIDENCE SUMMARY (one line per task: id, title, status, tdd phase), EXPECTED OUTPUT (dimension-specific schema). See command contracts for full templates.
**Slop-scan packet:** WORKING DIRECTORY, CHANGE (id + title + gate, when an active change exists), AFFECTED FILES (with change summary), TASK EVIDENCE SUMMARY, EXPECTED OUTPUT (JSON findings array). When no active change exists, omit CHANGE and TASK EVIDENCE SUMMARY. See command contract for standalone behavior.

### Post-Remediation Re-Verification

After `/adv-review` or `/adv-harden` fixes findings, re-scan only affected dimensions:

1. Spawn targeted scanner with PRIOR FINDINGS and scoped evaluation
2. Evaluate only whether listed findings are resolved
3. New findings from re-scan → queue for next cycle, NOT current verdict
   × Do NOT re-run all scanners after fixes. Only re-verify touched dimensions.

## Sub-Agent Selection

### Agent Tiers

| Tier                                | Agents                                        | Loading                             |
| ----------------------------------- | --------------------------------------------- | ----------------------------------- |
| **Core** (always loaded)            | `plan`, `build`, `refine`, `scout`, `adv`     | Global `~/.config/opencode/agents/` |
| **Common** (always loaded)          | `explore`, `librarian`, `general`, `mechanic` | Global `~/.config/opencode/agents/` |
| **ADV Specialist** (bundled global) | `adv-researcher`                              | Synced globally by `sync-global.sh` |
| **Repo-Local Specialist**           | `tron`                                        | Repo-local `.opencode/agents/`      |

### Agent Roster

| Agent            | Use For                             | Tools                         |
| ---------------- | ----------------------------------- | ----------------------------- |
| `librarian`      | Docs, API refs, code examples       | Context7, grep.app, Kagi      |
| `adv-researcher` | Architecture validation, simplicity | Context7, Kagi, ADV read-only |
| `explore`        | Codebase navigation, find usages    | Read, Glob, Grep, lgrep       |
| `general`        | Complex multi-step implementation   | Full tool access              |
| `mechanic`       | System/infra issues                 | Vision, bash, read/write      |
| `tron`           | Reconnaissance, hotspot detection   | Read, Glob, Grep, lgrep       |

## Skill Discovery Protocol

Search trusted skill directories (`~/.config/opencode/skills/*/SKILL.md`, repo `skills/*/SKILL.md`) → read YAML frontmatter → match `keywords` → `skill("{name}")`. Trust: repo-local from `skills/` only. Graceful degradation: skip malformed, proceed on no matches.

## Command vs Skill Boundaries

| Use a **command** when                    | Use a **skill** when                           |
| ----------------------------------------- | ---------------------------------------------- |
| User-facing workflow entry point          | Reusable methodology or analysis protocol      |
| Mutates ADV state (changes, tasks, gates) | Read-only guidance or checklist framework      |
| Owns a gate completion                    | Loaded by multiple commands or sub-agents      |
| Requires explicit user invocation         | Domain knowledge independent of workflow state |

### Reference Pattern

`adv-tron`: command owns orchestration/state/UI, skill holds protocol/schema/evidence. Load skill → pass condensed guidance → fall back to embedded protocol.

### Classification

**Command-only:** `adv-proposal`, `adv-agree`, `adv-design`, `adv-present`, `adv-task`, `adv-validate`, `adv-archive`, `adv-status`, `adv-accept`, `adv-coordinate`, `adv-clarify`, `adv-refactor`

**Retired:** `adv-research` → `/adv-discover` + `/adv-design`
**Command + skill:** `adv-discover`→`adv-discover-methodology`, `adv-prep`→`adv-prep-methodology`, `adv-apply`→`adv-apply-methodology`, `adv-tron`→`adv-tron`, `adv-review`→`adv-review-methodology`, `adv-harden`→`adv-harden-methodology`, `adv-slop-scan`→`adv-slop-detection`

### Constraints

- Skills × MUST NOT mutate ADV state or own gate completion
- Commands MUST remain functional without backing skill — inline fallback is required
- Checklist docs (`docs/checklists/`) canonical source; skills reference, not duplicate

### Structured Sub-Agent Prompt Protocol

Sub-agent prompts include: `ROLE:`, `WORKING DIRECTORY:`, `OUTPUT_SCHEMA:`, `BUDGET:`, `STOP_WHEN:`.

### Orchestration Token-Budget Policy

- **When to spawn:** only when multiple independent dimensions benefit from parallelism
- **Max parallel workers:** 3-4 at a time
- Prefer inline for single-tool-call work

### Phase Summary Pattern

Commands gathering substantial context should persist compact summaries via `adv_change_update` so later phases build on concise state, not replay full history.

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

Before creating: `git worktree list --porcelain` → find `change/{change-id}`. Path exists → offer reuse. Path missing → `git worktree prune` → proceed fresh.

### Spec Divergence

| Data                                                                                  | Location             | Shared?                   |
| ------------------------------------------------------------------------------------- | -------------------- | ------------------------- |
| Specs (`.adv/specs/`)                                                                 | In-repo, git-tracked | No (branch-local)         |
| Changes, archive, wisdom, agenda                                                      | External             | Yes (keyed by project-id) |
| Spec changes in worktree A invisible to B until merged. Merge promptly after archive. |                      |                           |

### Inline Worktree Protocol

1. `worktree_create` → capture path
2. Set `workdir` to worktree path for ALL subsequent tool calls
3. Continue inline — no handoff needed
4. Delete: pass `branch` arg to `worktree_delete`

### Session Handoff (Fallback)

Multi-session only: parent writes `handoff.json` → child reads/clears on startup → `[ADV:WORKTREE_SESSION]` marker injected.

### Worktree Cleanup

`/adv-archive` Phase 9 handles: stage → commit → detect default branch → merge/PR → verify → `worktree_delete` → remove `.bak`/`.tmp`/`.orig`. × Never delete worktree with unmerged commits. If `worktree_create`/`worktree_delete` unavailable: `[ADV:INFO] Worktree tools not available — proceeding in-place.`

## Autonomy & Quality Ownership

### Human Checkpoints (Pause Required)

ADV pauses for human input ONLY at these explicit checkpoints:

- **Proposal confirmation** — problem statement matches intended outcome
- **Agreement sign-off** — objectives, constraints, acceptance criteria approved
- **Design approval** — only when real tradeoffs depend on user values or product vision; design validation by `adv-researcher` is agent-owned (auto-continues unless CONFLICT found)
- **Acceptance** — delivered work satisfies the agreement
- **Archive sign-off** — final release approval
- **Cancellation approval** — task or change cancellation
- **Doom-loop recovery** — 3 failed attempts, user guidance needed

### Clean Auto-Continue Rule

All other workflow steps proceed sequentially without prompting the user when no unresolved user-value tradeoff or required approval exists. This includes: discovery, deterministic design, prep, apply, review, and harden. The orchestrator does not ask "shall I continue?" between clean agent-owned steps.

### Investment Check-In

When `/adv-prep` identifies **judgment calls** (decisions that need user intuition, preference, or context rather than autonomous agent judgment), `/adv-apply` Phase 1.5 surfaces them in a single batched `question` tool call before the first task executes. **Cadence is single:** post-prep batch only. Doom-loop-clearance re-surface is the only secondary path.

**In-scope categories (v1):** `non_functional_tradeoff` (latency vs consistency, simplicity vs extensibility), `extensibility` (plugin point vs hardcoded, config-driven vs const), `scope_boundary` (handle here or defer to follow-up). **Out of scope:** defaults, public API naming, error semantics — agent resolves autonomously.

**Composition:** Doom-loop supersedes — active doom-loop scan across all tasks (via `getDoomLoopInfo`) defers batch surfacing to doom-loop recovery. Cancellation, re-entry, and TDD reclassification operate independently. **Hard-stop tier is advisory in v1** — does NOT trigger `adv_change_reenter`. Re-entry remains scope-expansion-driven per `rq-scopeReentry01`.

**rq-autonomy01 escape-clause citation:** Phase 1.5 surfacing does **not** introduce a new enumerated human checkpoint. Unresolved entries in `change.judgment_calls[]` are, by construction, "unresolved user-value tradeoffs" — covered by the existing `rq-autonomy01` escape clause. The 8 enumerated checkpoints above remain the only enumerated pause points.

**Tunable config:** `.opencode/instructions/cost-governance.md` (YAML frontmatter thresholds + scope + category enum). Rule: `rules.yaml` P28 (user-managed; see `SETUP.md`). **Methodology:** `skills/adv-cost-governance-methodology/SKILL.md` (canonical protocol, cadence, composition rules, worked examples). **Data layer:** `adv_investment_report` tool.

### Validated In-Scope Remediation Policy

When `/adv-review` or `/adv-harden` validates an actionable finding or suggestion as in-scope:

- The current change MUST fix it before completion
- × No report-only, future-work, or accepted-debt path for validated in-scope findings
- Findings may only be left unresolved if rejected with documented evidence showing they are invalid or out of scope

### Touched-Scope Quality Ownership

A change owns quality and test coverage for:

1. **Directly touched implementation files** — code changed or added by the change
2. **Adjacent tests and docs** — test files and documentation needed for correctness and clarity of touched code
3. **Same-pattern local subsystem issues** — identical defect/quality patterns in the local touched subsystem that are cheap and clearly the same class of issue

Ownership boundary: local touched subsystem only. × Do NOT expand into implicit repo-wide refactors. `/adv-prep` synthesizes tasks covering these obligations. `/adv-apply` verifies them before execution completes. `/adv-review` and `/adv-harden` enforce them.

## When to Use ADV

**Use for:** New features, breaking changes, architecture, compliance
**Skip for:** Bug fixes, typos, deps, exploration
