# ADV - Spec-Driven Development Instructions
Specs are laws. Requirements are formally defined, validated, and enforced.
## Core Decision Rules
| When | Then |
| --- | --- |
| Spec conflicts with proposal | Spec wins |
| Gate incomplete | Archive blocked |
| 3 failed task attempts | Stop → `[ADV:DOOM_LOOP]` → escalate |
| Cross-repo task | Execute in target repo via `workdir` |
| User requests cancellation | Require approval via `adv_task_cancel` |
| Scope expansion during execution | Route through `adv_change_reenter` autonomously |
| TDD required + trivial task | Set `metadata.tdd_intent: "not_applicable"` with reason |
| TDD intent change after prep | Use `adv_task_reclassify_tdd` with user approval |
| User requests skip + gate required | `[ADV:MIC]` → ask for sign-off |
## Commands
| Command | Purpose |
| --- | --- |
| `/adv-status` | Show project overview: specs, active changes, and next-step recommendations |
| `/adv-proposal <summary>` | Extract problem statement and confirm with user before proceeding |
| `/adv-validate <change-id>` | Validate change compliance against specs; block archive on failure |
| `/adv-archive <change-id>` | Archive completed change: apply spec deltas and finalize git |
| `/adv-clarify` | Ask clarifying questions to resolve ambiguous requirements |
| `/adv-discover <change-id>` | Gather context, analyze current state, identify objectives, and obtain user agreement |
| `/adv-design <change-id>` | Validate architecture decisions, produce implementation strategy, and present design for user review |
| `/adv-prep <change-id>` | Analyze gaps and synthesize tasks from validated design decisions |
| `/adv-apply <change-id>` | Implement change with TDD, retry on failure, and final verification |
| `/adv-task` | Fast-track a discussed change: synthesize contract, validate, prep, and hand off |
| `/adv-review <change-id>` | Review deliverables for correctness, security, and architecture quality |
| `/adv-harden <change-id>` | Detect low-quality code, verify test coverage, clean up before release |
| `/adv-audit [capability]` | Detect drift between specs and current implementation |
| `/adv-slop-scan [path]` | Scan for AI slop patterns including defensive and nested code |
| `/adv-refactor <change-id>` | Refresh a stale proposal to reflect current codebase state |
| `/adv-coordinate` | Detect and resolve conflicts across multiple active changes |
| `/adv-improve` | Suggest improvements and persist a competitor research pack for /adv-discover reuse |
| `/adv-tron [target]` | Investigate codebase structure, hotspots, risks, and suggest follow-up agenda candidates |
## Command Boundaries
proposal → problem statement, criteria, constraints, discovery agenda. discover → context analysis, objectives, agreement.md. design → architecture decisions, design.md, validator verdict. prep → task graph, gap analysis, sequencing. apply → implementation via TDD. review + accept → acceptance criteria verified. harden + archive → quality pass, spec deltas applied. Only `/adv-prep` (and exempt `/adv-task`) may call `adv_task_add`.
## Status Markers
| Marker | When | Emoji |
| --- | --- | --- |
| `[ADV:ROCKET]` | Active work | 🚀 |
| `[ADV:TDD_RED]` | Writing tests | 🔴 |
| `[ADV:TDD_GREEN]` | Implementing | 🟢 |
| `[ADV:MOON]` | Sub-agents running | 📡 |
| `[ADV:EARTH]` | Complete / awaiting input | 🌍 |
| `[ADV:DOOM_LOOP]` | Stuck in retry cycle | 💀 |
| `[ADV:MIC]` | Needs user approval | 🎤 |
| `[ADV:TASK_STATUS_REPORT]` | Task report | — |
### Context Snapshot
`adv_change_show` includes `_contextSnapshot`.
## Critical Protocols
### ADV State Access
× NEVER read ADV state files directly (`read`, `cat`, `ls`). Use ADV MCP tools exclusively.
| Need | Tool |
| --- | --- |
| Change + tasks | `adv_change_show` |
| Update proposal | `adv_change_update` (× never re-call `adv_change_create`) |
| Reopen gates for scope expansion | `adv_change_reenter` |
| Specific task + changeId | `adv_task_show` |
| Ready tasks | `adv_task_ready` |
| All tasks | `adv_task_list` |
| Active changes | `adv_change_list` |
| Validate | `adv_change_validate` |
| Agenda | `adv_agenda_list` |
| Wisdom | `adv_wisdom_list` |
### ADV Tool Availability Probe
× NEVER declare ADV tools unavailable without first calling `adv_status`.
| Observation | Correct response |
| --- | --- |
| You believe adv_* tools are missing | Call `adv_status`; report its output |
| `adv_status` returns `ADV_PLUGIN_INIT_FAILED` | Stop, quote `error` + `remediation` verbatim, ask user how to proceed |
| `adv_status` returns normal payload | Tools are live — proceed |
| A tool returns `ADV_PLUGIN_INIT_FAILED` | Treat as plugin-level failure, not a per-tool bug |
### Question Tool UX
Write-in option enforced by P26 (`rules.yaml`). Keep displayed options aligned with final `question` options.
### Tradeoff Prioritizer Protocol
When 2+ viable approaches depend on user values → run prioritizer before asking.
Default (inline): scan code → research → draft criteria → `question` tool → recommend.
Optional (skill): `skill("prioritizer")`.
### Context Freshness
Work one task at a time. Two tiers:
- **Phase start (once):** `adv_change_show` → full change context
- **Per task:** `adv_task_show` → task details, then `adv_wisdom_list` → learnings
× Do NOT call `adv_change_show` before every task — use `adv_task_show` unless you need full change context.
### TDD Protocol (RSTC)
Inline TDD is default — red/green phases WITHIN each task.
- **RED:** Write failing test with editing tools (`edit` / `write` / `morph_edit`) → run via `adv_run_test` → `[ADV:TDD_RED]` → show output
- **GREEN:** Implement with editing tools → run via `adv_run_test` → `[ADV:TDD_GREEN]` → show output
- **Fallback evidence:** `adv_task_evidence` remains available for externally captured evidence; it is not the primary inline-TDD path
- **Trivial:** Set `metadata.tdd_intent: "not_applicable"` with reason
- **Cross-cutting:** Separate verification tasks OK → `metadata.tdd_intent: "separate_verification"`
### Doom Loop Detection
After 3 failures: STOP → `[ADV:DOOM_LOOP]` → document all 3 attempts → ask via `question`. Record `strategy_label` in `error_recovery.attempts[]`.
### Cross-Repo Execution
Tasks with `target_repo`/`target_path` → execute in target directory. Switch `workdir` for all tool calls.
### Cancellation Policy
All cancellations require explicit user approval via `adv_task_cancel`.
### Re-Entry Protocol (Scope Expansion)
`adv_change_reenter(changeId, fromGate, reason, scopeDelta?, approvalEvidence?)` resets the target gate + downstream gates to pending and preserves existing tasks.
### Post-Remediation Re-Verification
After `/adv-review` or `/adv-harden` fixes findings, re-scan only affected dimensions. Do NOT re-run all scanners after fixes.
## 7-Gate Quality Checklist
| Gate | Triggered By | Artifact |
| --- | --- | --- |
| `proposal` | `/adv-proposal` | `problem-statement.md` |
| `discovery` | `/adv-discover` (includes user agreement) | `agreement.md` |
| `design` | `/adv-design` (includes user presentation) | `design.md` + validator verdict |
| `planning` | `/adv-prep` | Task graph in `change.json` |
| `execution` | `/adv-apply` | Code, docs, ops deliverables |
| `acceptance` | `/adv-review` | User sign-off |
| `release` | `/adv-harden` + `/adv-archive` | Spec deltas applied, git finalized |
## Command Execution Model
### Slash Command Boundary
Slash commands are top-level user entry points, not internal dispatch mechanism. Agents × MUST NOT invoke `/adv-*` from inside another workflow.
### Sub-Agent Orchestration
| Command | Inline | Sub-Agent |
| --- | --- | --- |
| discover | Context7 + Kagi + lgrep | librarian + adv-researcher (single-level only) |
| design | Context7 + Kagi + lgrep + mandatory validator (adv-researcher) | librarian + adv-researcher (single-level only) |
| slop-scan | Sequential categories | explore × 9 (single-level only) |
| task | Context7 + Kagi | librarian + adv-researcher |
| apply | Inline default, selective delegation | general (for trivial tasks) |
For `/adv-slop-scan`, all `explore` scanner workers must do the scan inline and must not delegate to additional sub-agents or invoke `/adv-*` slash commands.
Inline-only: `/adv-status`, `/adv-proposal`, `/adv-validate`, `/adv-archive`, `/adv-clarify`, `/adv-prep`, `/adv-coordinate`, `/adv-improve`
### Delegation Routing
| Priority | Check | Result |
| --- | --- | --- |
| 1 | `metadata.delegation_hint` set? | Use hint value |
| 2 | `tdd_intent == "not_applicable"`? | `delegate_allowed` |
| 3 | Title matches `isTrivialTask` patterns? | `delegate_allowed` |
| 4 | Risk signals (multi-file, cross-repo, architectural keywords)? | `inline_required` |
| 5 | Default | `inline_required` |
### Context Packet Standards
Apply packet includes: WORKING DIRECTORY, CHANGE, TASK, AFFECTED FILES, DESIGN EXCERPT, ACCEPTANCE CRITERIA, EXPECTED OUTPUT.
## Sub-Agent Selection
| Tier | Agents | Loading |
| --- | --- | --- |
| **Core** | `plan`, `build`, `refine`, `scout`, `adv` | Global |
| **Common** | `explore`, `librarian`, `general`, `mechanic` | Global |
| **ADV Specialist** | `adv-researcher` | bundled global |
| **Repo-Local** | `tron` | repo-local |
## Skill Discovery Protocol
Search trusted skill directories (`~/.config/opencode/skills/*/SKILL.md`, repo `skills/*/SKILL.md`) → read YAML frontmatter → match `keywords` → `skill("{name}")`.
## Command vs Skill Boundaries
Use a command when it is a user-facing workflow entry point, mutates ADV state, owns a gate completion, or requires explicit user invocation. Use a skill when the content is reusable methodology or analysis protocol. `adv-tron` remains the reference pattern. Command + skill: `adv-discover`→`adv-discover-methodology`, `adv-prep`→`adv-prep-methodology`, `adv-apply`→`adv-apply-methodology`, `adv-tron`→`adv-tron`, `adv-review`→`adv-review-methodology`, `adv-harden`→`adv-harden-methodology`, `adv-slop-scan`→`adv-slop-detection`.
Skills × MUST NOT mutate ADV state. Commands MUST remain functional without backing skill — inline fallback is required.
### Structured Sub-Agent Prompt Protocol
Sub-agent prompts include: `ROLE:`, `WORKING DIRECTORY:`, `OUTPUT_SCHEMA:`, `BUDGET:`, `STOP_WHEN:`.
### Orchestration Token-Budget Policy
- **When to spawn:** only when multiple independent dimensions benefit from parallelism
- **Max parallel workers:** 3-4 at a time
- Prefer inline for single-tool-call work
### Phase Summary Pattern
Persist compact summaries via `adv_change_update` so later phases build on concise state, not replay full history.
## Worktree Integration
- 3+ files OR breaking API/structural refactor → ask user → create worktree → continue inline
- Reuse: `git worktree list --porcelain` → find `change/{change-id}`
- Specs (`.adv/specs/`) are branch-local; external ADV state is shared
- After `worktree_create`, set `workdir` to the worktree path for ALL subsequent tool calls
## Autonomy & Quality Ownership
### Human Checkpoints (Pause Required)
- **Proposal confirmation** — problem statement matches intended outcome
- **Agreement sign-off** — objectives, constraints, acceptance criteria approved
- **Design approval** — only when real tradeoffs depend on user values or product vision
- **Acceptance** — delivered work satisfies the agreement
- **Archive sign-off** — final release approval
- **Cancellation approval** — task or change cancellation
- **Doom-loop recovery** — 3 failed attempts, user guidance needed
### Clean Auto-Continue Rule
All other workflow steps proceed sequentially without prompting the user when no unresolved user-value tradeoff or required approval exists. Commands proceed sequentially without prompting the user.
### Investment Check-In
When `/adv-prep` identifies judgment calls, `/adv-apply` Phase 1.5 surfaces them in a single batched `question` tool call before the first task executes.
**In-scope categories:** `non_functional_tradeoff`, `extensibility`, `scope_boundary`. **Out of scope:** defaults, public API naming, error semantics.
**Composition:** Doom-loop supersedes. **Hard-stop** tier is **advisory** and does NOT trigger `adv_change_reenter`.
**rq-autonomy01 escape-clause citation:** unresolved entries in `change.judgment_calls[]` are unresolved user-value tradeoffs and therefore covered by `rq-autonomy01`'s escape clause.
### Validated In-Scope Remediation Policy
When `/adv-review` or `/adv-harden` validates an actionable finding as in-scope:
- The current change MUST fix it before completion
- × No report-only, future-work, or accepted-debt path
- Findings may only be left unresolved if rejected with documented evidence
### Touched-Scope Quality Ownership
1. **Directly touched implementation files**
2. **Adjacent tests and docs**
3. **Same-pattern local subsystem issues**
× Do NOT expand into implicit repo-wide refactors.
