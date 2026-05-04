# ADV - Spec-Driven Development Instructions

Specs are laws. Requirements are formally defined, validated, and enforced.

## Notation

`→` sequence · `←` blocked by · `✓` complete · `○` pending · `×` forbidden · `⚠` attention

## Core Decision Rules

| When                               | Then                                   |
| ---------------------------------- | -------------------------------------- |
| Spec conflicts with proposal       | Spec wins                              |
| Gate incomplete                    | Archive blocked                        |
| 3 failed task attempts             | Stop → `[ADV:BLOCKED]` → escalate      |
| Cross-repo task                    | Execute in target repo via `workdir`   |
| User requests cancellation         | Require approval via `adv_task_cancel` |
| TDD required + trivial task        | Mark trivial with reason, skip TDD     |
| User requests skip + gate required | `[ADV:ATTN]` → ask for sign-off        |

## HITL Boundary Model

Per-phase collaboration mode. Planning gate machine-enforced via `adv_gate_complete` (`userApproved: true`); other modes are agent self-enforced.

**Agent-side gap:** Only planning is machine-enforced. Other phase boundaries rely on command-doc adherence.

| Phase           | Mode                         | Detail                                                                         |
| --------------- | ---------------------------- | ------------------------------------------------------------------------------ |
| `/adv-idea`     | Collaborative                | Fully collaborative; ideation loop before a proposal exists                    |
| `/adv-problem`  | Collaborative                | Fully collaborative; issue triage before deciding fix path                     |
| `/adv-proposal` | Collaborative                | Fully collaborative; approve at end                                            |
| `/adv-research` | Collaborative                | Fully collaborative; approve at end                                            |
| `/adv-prep`     | HITL hard gate               | Vision document → explicit user approval → `userApproved: true` on prep gate   |
| `/adv-apply`    | Autonomous                   | No "Begin work" prompt; proceeds after prep approval. Escalate only on failure |
| `/adv-review`   | Autonomous + drift detection | Auto-fix within scope; stop on drift                                           |
| `/adv-harden`   | Autonomous + drift detection | Auto-fix scoped issues; stop on drift                                          |
| `/adv-archive`  | Autonomous                   | Apply spec deltas, capture wisdom, finalize git                                |

### Drift Detection Rule

In autonomous phases (`/adv-review`, `/adv-harden`), before auto-remediating ask: "Will `proposal.md`'s **Success Criteria**, **Acceptance Criteria**, or **Out-of-Scope** sections need to change?"

| Answer | Action                                                    |
| ------ | --------------------------------------------------------- |
| YES    | STOP. Present finding via `question` tool (`[ADV:ATTN]`). |
| NO     | Auto-remediate within scope.                              |

### Prep Gate Machine Enforcement

`adv_gate_complete gateId: 'planning'` requires `userApproved: true`. Without it, the gate returns an error. Only machine-enforced HITL gate.

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

**Approval surface:** Human checkpoints listed above MUST use inline handoff text per `docs/command-voice-standard.md` § Inline Approval Voice — NOT the `question` tool. Spec ref: `rq-inlineApproval01`. Doom-loop recovery uses `question` tool (safety-critical structured choices).

| Tier             | Checkpoints                                   | Parser                          |
| ---------------- | --------------------------------------------- | ------------------------------- |
| A (reversible)   | proposal, agreement, design, prep, acceptance | whitelist + LLM fallback        |
| B (irreversible) | archive sign-off, cancellation                | whitelist-only, NO LLM fallback |

Archive sign-off executes inline in the same response as the whitelist match — no separate confirmation-echo turn.

### Post-Approval Auto-Continue

Tier A whitelist reply (continue, go, approve, yes, ok, proceed, accept, lgtm, etc.) → next phase begins inline immediately. No "shall I proceed?", no second confirmation. Slash-command replies (`/adv-X`) are no-ops; OpenCode dispatches them to fresh sessions.

### Between-Checkpoint Flow

Only system-level interrupts cause pauses between checkpoints:

| Interrupt                             | Trigger                                     |
| ------------------------------------- | ------------------------------------------- |
| Doom-loop                             | 3 failed task attempts                      |
| Cost governance / investment check-in | judgment calls to surface                   |
| Drift detection                       | auto-fix boundary exceeded in review/harden |
| Contract-compromise risk              | identified during design                    |
| Design validator `CONFLICT`           | verdict requires user resolution            |
| Prep gate machine enforcement         | `userApproved` required                     |

No other pauses or "shall I continue?" prompts permitted.

## Phase Goals

Each workflow command has a defined phase goal. Canonical in `manifest.ts` (`phaseGoal` field on `CommandDef`). Self-check: "Am I still working toward this phase's goal?"

| Phase            | Goal                                                                                                                          |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `/adv-proposal`  | Clarify the problem, user needs, and acceptance criteria scope. Establish _what_ and _why_ — no _how_.                        |
| `/adv-research`  | Produce a defined, fully-researched proposed plan ready for user approval. Validate the _how_.                                |
| `/adv-discover`  | Gather current-state evidence, resolve agreement, and capture objectives and acceptance criteria before design.               |
| `/adv-design`    | Convert the approved agreement into a validated implementation strategy ready for planning.                                   |
| `/adv-prep`      | Complete the flight-check: every gap closed, every dependency mapped, every task ready — ready for autonomous implementation. |
| `/adv-apply`     | Execute the approved plan autonomously. Add discovered tasks within scope. Escalate only on failure.                          |
| `/adv-review`    | Verify implementation matches the approved plan. Auto-fix within scope. Stop on drift.                                        |
| `/adv-harden`    | Verify production-readiness. Auto-fix scoped issues. Stop on drift.                                                           |
| `/adv-archive`   | Promote the change from contract to law: apply spec deltas, capture wisdom, clean up.                                         |
| `/adv-autopilot` | Execute a full change pipeline autonomously, delegating routine human checkpoints while preserving all safety boundaries.     |
| `/adv-reflect`   | Synthesize post-completion learnings into a durable reflection artifact for process improvement.                              |

## Commands

### Core Workflow

| Command                     | Purpose                                                                             |
| --------------------------- | ----------------------------------------------------------------------------------- |
| `/adv-idea`                 | Explore rough ideas before drafting a proposal                                      |
| `/adv-problem`              | Triage issues before fixing or drafting a proposal                                  |
| `/adv-status`               | Show project overview: specs, active changes, and next-step recommendations         |
| `/adv-proposal <summary>`   | Extract problem statement, success criteria, and constraints without creating tasks |
| `/adv-validate <change-id>` | Validate change compliance against specs; block archive on failure                  |
| `/adv-apply <change-id>`    | Implement change with TDD, retry on failure, and final verification                 |
| `/adv-archive <change-id>`  | Archive completed change: apply spec deltas and finalize git                        |
| `/adv-reflect <change-id>`  | Produce a structured two-plane reflection report for an archived change             |

### Pre-Implementation

| Command                     | Purpose                                                                                              |
| --------------------------- | ---------------------------------------------------------------------------------------------------- |
| `/adv-clarify`              | Ask clarifying questions to resolve ambiguous requirements                                           |
| `/adv-research <target>`    | Produce a defined, fully-researched proposed plan ready for user approval                            |
| `/adv-discover <change-id>` | Gather context, analyze current state, identify objectives, and obtain user agreement                |
| `/adv-design <change-id>`   | Validate architecture decisions, produce implementation strategy, and present design for user review |
| `/adv-prep <change-id>`     | Analyze gaps and synthesize tasks from validated research findings                                   |

### Post-Implementation

| Command                   | Purpose                                                                                              |
| ------------------------- | ---------------------------------------------------------------------------------------------------- |
| `/adv-review <change-id>` | Review code for correctness, security, and architecture; emit REVIEW_FINDINGS                        |
| `/adv-harden <change-id>` | Detect low-quality code, verify test coverage, clean up; block archive on open findings              |
| `/adv-audit [capability]` | Detect drift between specs and current implementation                                                |
| `/adv-slop-scan [path]`   | Scan for AI slop patterns including defensive and nested code                                        |
| `/adv-arch-scan [path]`   | Scan for architecture inconsistencies using deterministic tools, research fallback, and AI heuristic |
| `/adv-comp-scan <target>` | Scan competitor capabilities against this project for competitive intelligence                       |

### Fast-Track / Advanced

| Command                     | Purpose                                                                                         |
| --------------------------- | ----------------------------------------------------------------------------------------------- |
| `/adv-task`                 | Fast-track a discussed change: synthesize contract, validate best practices, prep, and hand off |
| `/adv-autopilot [target]`   | Delegate routine checkpoints to the agent, stop only on safety boundaries                       |
| `/adv-refactor [change-id]` | Refresh a stale proposal or batch-refresh the oldest 30% of active changes                      |
| `/adv-cleanup`              | Triage stale, abandoned, duplicate, and ready-to-archive active changes                         |
| `/adv-improve`              | Suggest targeted improvements to existing specs or implementation                               |
| `/adv-tron [target]`        | Investigate codebase structure, hotspots, risks, and suggest follow-up agenda candidates        |

## Command Boundaries

| Command  | Produces                                                                        | × MUST NOT                                                               | Gate                 |
| -------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------- |
| proposal | Problem statement, criteria, constraints                                        | Create tasks, complete gates, impl decisions                             | None                 |
| discover | Current-state evidence, objectives, agreement, acceptance criteria              | Create tasks, complete non-discovery gates                               | discovery            |
| design   | Validated implementation strategy                                               | Create tasks, bypass validator                                           | design               |
| prep     | Task graph, gap analysis, sequencing                                            | Complete non-planning gates, architecture decisions                      | planning             |
| task     | Change + tasks + gates (fast-track exempt)                                      | —                                                                        | discovery + planning |
| apply    | Implementation via TDD                                                          | Auto-complete discovery/planning gates                                   | execution            |
| review   | Review findings and acceptance evidence                                         | Archive, release, or expand scope silently                               | acceptance           |
| archive  | Spec promotion, release readiness, cleanup                                      | Skip validation, conformance, or sign-off                                | release              |
| reflect  | Reflection report (JSON + Markdown), friction analysis, improvement suggestions | Mutate change state, tasks, or gates; block archive when invoked from it | None                 |

- Only `/adv-prep` (and exempt `/adv-task`) may call `adv_task_add`
- `/adv-apply` stops if discovery or planning gates pending
- Commands that own boundary-sensitive workflow steps should include `## Command Boundary` details

## Status Markers

Emit at START of each response:

| Marker                     | When                                                          | Emoji |
| -------------------------- | ------------------------------------------------------------- | ----- |
| `[ADV:WORK]`               | Agent actively working                                        | 🟩    |
| `[ADV:TOOLING]`            | Tool run or sub-agent in flight                               | 🟨    |
| `[ADV:ATTN]`               | User needed (permission pending, approval, or question)       | 🟥    |
| `[ADV:IDLE]`               | Agent idle, no action needed (session start or finished work) | ⬜    |
| `[ADV:BLOCKED]`            | Doom-loop / stuck / crash                                     | 🟥💀  |
| `[ADV:TASK_STATUS_REPORT]` | Task report                                                   | —     |
| `[ADV:SKILL_CREATED]`      | Auto-created skill persisted (skill name, domain)             | 🟦    |
| `[ADV:REFLECTION]`         | Reflection report emitted                                     | 🟪    |
| `[ADV:PEER_SESSIONS]`      | Informational; peer sessions detected in same project         | ⬜    |

Tab title: `<emoji> <shortname> · <normalized change>` when a change is active, or `<emoji> <shortname>` when idle. System-emitted: `[ADV:ACCUMULATED_WISDOM]`, `[ADV:TODO_CONTINUATION]`, `[ADV:RECORD_WISDOM]`

### Context Snapshot

`_contextSnapshot` — compact summary closing the context agreement gap:

- Change ID/title, gate progress (`[✓ proposal] [○ execution] ...`), task counts, current task, workdir

Emitted by mutation/ticker tools such as `adv_change_create`, `adv_change_reenter`, `adv_gate_complete`, `adv_status` primary change, and task-state ticker tools (`adv_task_update`, `adv_task_ready`, `adv_task_add`, `adv_task_cancel`). Read tools omit it by default, except `adv_change_show include: { snapshot: true }`, which returns `_contextSnapshot` on request.

**Cross-Repo Switch** — emit via `formatCrossRepoSwitch()`.

## Critical Protocols

### ADV State Access

× NEVER read ADV state files directly (`read`, `cat`, `ls`). Use ADV MCP tools exclusively.

Forbidden: `~/.local/share/opencode/plugins/advance/**/{change.json,proposal.md,problem-statement.md,agenda.jsonl,wisdom.jsonl,conformance.json}`

| Need                     | Tool                                                      |
| ------------------------ | --------------------------------------------------------- |
| Change + tasks           | `adv_change_show`                                         |
| Update proposal          | `adv_change_update` (× never re-call `adv_change_create`) |
| Specific task + changeId | `adv_task_show`                                           |
| Ready tasks              | `adv_task_ready`                                          |
| All tasks                | `adv_task_list`                                           |
| Active changes           | `adv_change_list`                                         |
| Validate                 | `adv_change_validate`                                     |
| Agenda                   | `adv_agenda_list`                                         |
| Wisdom                   | `adv_wisdom_list`                                         |

On direct-read failure → stop, call `adv_change_show` or `adv_task_show`.

### Multi-Session Coordination

Multi-session is the supported design center. Temporal serializes ADV state writes via workflow updates; per-worktree git isolation eliminates working-tree races.

**Operational model:**

- Each session owns its own worktree (or runs in main checkout for single-worktree projects)
- ADV state mutations are serialized by Temporal — no client-side locks needed
- Git filesystem ops (`git worktree add/remove`) coordinate via narrow per-repo flock (~50ms hold)

**Plugin behavior:** At init, the plugin scans for peer `opencode` processes that share the same project (matched by `git rev-parse --git-common-dir` OR ADV project-id). When peers are found, it emits:

```
[ADV:PEER_SESSIONS] N peer session(s) active in this project.
```

Informational only — peer sessions are first-class and supported. No agent rule restricts behavior based on this marker.

Peer-session visibility (`adv_status`, `adv_session_list`) assumes same project = same trust domain. Multi-developer / shared-CI scenarios are out of scope; revisit via separate change if needed. The defensive opaque `session_id` schema (no PID, no full path in public output) mitigates leak risk.

**Useful tools:**

- `adv_status` — Peer Sessions section (session_id + started_at + worktree-basename)
- `adv_session_list` — list peer sessions in same project
- `adv_session_show <session_id>` — own-session details only (privacy-defensive)
- `adv_temporal_diagnose` — peer count, worker-lock holder PID, project workflow presence

**Known OpenCode-core race (out of ADV's layer):** OpenCode's snapshot service is keyed on `projectID`, not on worktree path. Two sessions on the same project — even in different worktrees — race on `~/.local/share/opencode/snapshot/{projectID}/{sha}/index.lock` and lose between-turn snapshots with `exitCode=128 ... 'index.lock': File exists`. ADV's task-checkpoint commits (separate git ops in the worktree) are unaffected, but OpenCode's snapshot history develops gaps. Tracked at [Sharper-Flow/Opencode-Advance#1](https://github.com/Sharper-Flow/Opencode-Advance/issues/1) — fix is oca/OpenCode-core, not ADV. The "Multi-session is the supported design center" claim above applies to **ADV state and per-worktree git**, not to OpenCode's snapshot subsystem.

### ADV MCP Tool Invocation

× NEVER invoke ADV tools with empty parameter sets. Always provide all required args explicitly.

- `adv_change_update` — always pass `changeId` + at least one of `proposal`, `problemStatement`, `agreement`, `design`. Zero-args calls hit a 10s safety-net timeout and return `errorClass: ToolExecutionTimeout`. Confirm the target with `adv_change_show` or `adv_change_list` first.
- `adv_task_add` — before passing `blockedBy`, call `adv_task_list changeId: <id>` to fetch current task IDs. Unknown IDs are rejected with the list of valid IDs so you can self-correct, but this costs a round trip.
- `adv_task_add` — `metadata.tdd_intent` defaults to `"inline"` when omitted. Pass it explicitly for `"separate_verification"` (cross-cutting verify tasks) or `"not_applicable"` (docs/config/verification-only tasks). The validator's logic-heavy heuristic flags missing TDD evidence on tasks defaulted to `inline` regardless of content prose; explicit metadata at creation time avoids `adv_task_reclassify_tdd` ceremony at archive time.
- `adv_task_cancel` — all `taskIds` must exist in the same change. Cancellations are atomic: if any ID is unknown, NO task is cancelled. Verify with `adv_task_list` before calling.
- `adv_change_archive` — when archiving from a worktree, pass `worktreePath: <worktree-root>` so the in-repo bundle lands inside the worktree's `.adv/archive/` (where `/adv-archive` Phase 9 Step 1 stages it on the change branch). Omitting the arg defaults to `store.paths.root` (main checkout) and the bundle ends up untracked in main, requiring a separate trunk commit.
- `adv_run_test` — pass `timeoutMs` (range `[1000, 300_000]` ms, default `30_000`) for slow commands like `pnpm run check` or full suites. Without it, commands taking >30s SIGTERM and the tool returns `errorClass: TestExecutionTimeout`. Use `adv_task_evidence` as fallback only when external execution is required (e.g. external CI artifact replay).
- `adv_gate_complete` — planning gate requires `userApproved: true`. Other gates accept the flag but only planning enforces it.
- Tool `describe()` text documents relational constraints (which other tool to call first, at-least-one-of patterns, valid enum values). Read field descriptions before constructing calls.

### Question Tool UX

Write-in option enforced by P26 (`rules.yaml`). ADV notes:

- Contextual write-in labels (`Other`, `Different approach`) — not generic
- 2-5 options including write-in, concise labels
- Leave custom input enabled

**Scope of question tool use:** Reserved for non-checkpoint structured choices: change-id selection / disambiguation, doom-loop recovery, drift detection in `/adv-review` and `/adv-harden`, AC clarification rounds (Phase 4.5 of `/adv-discover`), investment check-in / judgment-call surfacing (`/adv-apply` Phase 1.5), and triage commands (`/adv-idea`, `/adv-problem`, `/adv-clarify`). Human checkpoints listed above use inline handoff text per `docs/command-voice-standard.md` § Inline Approval Voice and `rq-inlineApproval01`.

### Tradeoff Prioritizer Protocol

When 2+ viable approaches depend on user values → run prioritizer before asking.

**Default (inline):** Scan code → research tradeoffs → draft criteria questions → pass to `question` tool → restate priorities → recommend.

**Optional (skill):** Load `skill("prioritizer")` for structured criteria question templates and decision map guidance.

Skip for: bug fixes, mechanical work, choices constrained by security/API/architecture.

### Context Freshness

Phase start (once): prefer the augmented form
`adv_change_show changeId: <id> include: { ledger: true, snapshot: true, readyTasks: true }` —
this single call collapses the legacy quartet
(`adv_change_show + adv_gate_status + adv_task_ready + adv_task_run_status`)
into one round trip:

| Flag                                | Attached field                                                               | Replaces                                                            |
| ----------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `include.snapshot: true`            | `_contextSnapshot` (top-level rendered string)                               | `adv_change_show` proposal/gate-row reading + manual reconstruction |
| `include.ledger: true`              | `_ledger` (TaskRunState for in-progress task or `null`)                      | `adv_task_run_status taskId: <id>`                                  |
| `include.readyTasks: true`          | `_readyTasks` (top-N) + `_readyTasksMeta` (`{ total, limit, blockedCount }`) | `adv_task_ready changeId: <id>`                                     |
| `include.readyTasksLimit: N` (1-50) | overrides default top-10 slice                                               | —                                                                   |

Default behavior is preserved when `include` is omitted (legacy callers and read-only inspections continue to work unchanged).

Per task: `adv_task_show` → refresh only the current task. Do NOT call adv_change_show before every task — use the lighter per-task refresh.

TodoWrite: use task IDs only (`tk-abc123`), not descriptions.

### TDD Protocol (RSTC)

Inline TDD is default — red/green phases WITHIN each task. × Do NOT create separate test tasks for same scope.

- **RED:** Write failing test using editing tool (`edit` / `write` / `morph_edit`) → run with `adv_run_test phase:'red'` → show failure evidence
- **GREEN:** Implement using editing tool → run with `adv_run_test phase:'green'` → if fails: retry protocol → show pass evidence
- **Trivial:** Note `(trivial: docs change)`, skip TDD
- **Cross-cutting:** Separate verification tasks OK → mark `metadata.tdd_intent: "separate_verification"`

`adv_run_test` is prescribed for ordinary inline red/green work because it provides executable proof, durable evidence, and task-run ledger continuity. `adv_task_evidence` is fallback for externally captured or manual evidence only when it adds unique audit/recovery value; do not add evidence-tool ceremony without reproducibility, durable audit, or recovery value.

### Reflection Protocol

Post-completion two-plane analysis for every archived change. Tool: `adv_reflect`. Persisted in `reflections.jsonl` in ADV state directory.

| Aspect                      | Detail                                                                                        |
| --------------------------- | --------------------------------------------------------------------------------------------- |
| Plane 1 — Project Execution | Efficiency, quality, process adherence, wisdom captured                                       |
| Plane 2 — System Friction   | Tool gaps, workarounds, missing capabilities, doc gaps, UX friction, provider-specific issues |
| Triggers                    | Auto during archive/release flow; manual via `/adv-reflect <change-id>`                       |
| Audience                    | Informational — human review; does NOT trigger autonomous process modification                |
| Retrieval                   | `adv_change_show` for archived changes                                                        |

### Task Checkpoint Commits

Every `/adv-apply` task with file changes in its workdir MUST produce a git commit via `adv_task_checkpoint` before transitioning to `status:'done'`. Cancellations MUST checkpoint before `status:'cancelled'`. Enforcement is at the `/adv-apply` command seam (step 3c.5), not in `adv_task_update` itself.

**Durable Task-Run Ledger.**

<!-- rq-taskRunLedger01 -->

Each `/adv-apply` task records a durable task-run ledger in Temporal. Use `adv_task_run_status` to recover the current phase, `requiredNextAction`, resume hint, baseline, evidence, verification, checkpoint, and recent events after context loss or session restart. Ledger status never creates an extra user pause; it tells the agent where to resume inside the existing no-pause apply loop.

Ledger recording points: task start, clean baseline, red evidence, green evidence, incremental verification, checkpoint, completion, failures, and blockers. `adv_task_checkpoint` records the checkpoint event after clean/committed git result; if git succeeds but ledger recording fails, surface remediation before marking the task done.

**Apply-loop ordering:**

| Step | Action                                                                                                                                                                                     |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 3a   | Start — `adv_task_update status: "in_progress"`                                                                                                                                            |
| 3a.6 | Clean Baseline Capture — verify clean tree, record HEAD/branch                                                                                                                             |
| 3b   | Red Phase — write failing test                                                                                                                                                             |
| 3c   | Green Phase — implement, tests pass                                                                                                                                                        |
| 3c.4 | **Incremental Verification** — build/tests/lint pass                                                                                                                                       |
| 3c.5 | **Checkpoint** — `adv_task_checkpoint` with change/branch/HEAD/verification; if `checkpointRecorded:false`, run `adv_task_run_status` and do not mark done until `checkpointRecorded:true` |
| 3d   | Complete — `adv_task_update status: "done"`                                                                                                                                                |

**Failure classification:**

| Classification                                    | Action                                                |
| ------------------------------------------------- | ----------------------------------------------------- |
| `SEMANTIC` (hook rejection, branch/HEAD mismatch) | Diagnose, re-run (retry budget)                       |
| `ENVIRONMENTAL` (not a git repo, detached HEAD)   | Escalate via `question`                               |
| `TRANSIENT` (index.lock contention)               | Tool retries internally; remaining failure → SEMANTIC |

**Commit message format:**

- Subject: `task(tk-xxxx): completed` or `task(tk-xxxx): cancel — <reason>`
- Body trailers: `Change: <change-id>`, `Task: <task-id>`, `Mode: complete|cancel`, `Verification: <summary>`

**Staging:** `git add -A` — `.gitignore` is the safety net.
**Anti-patterns:**

- × Do NOT run git from inside a Temporal workflow or activity
- × Do NOT create `--allow-empty` commits
- × Do NOT bypass checkpoint for "small" tasks — clean-tree returns `{status:'clean'}` without committing
- × Do NOT push, merge, archive, release, amend, or force-push from checkpoint commits
  **Publication boundary:** Checkpoint commits are local rollback/audit points only. Publication remains a separate human-gated workflow.

Cross-link: `/adv-apply` command (`.opencode/command/adv-apply.md`) step 3c.5.

### Doom Loop Detection

| Exit             | Condition                     |
| ---------------- | ----------------------------- |
| ✓ Done           | Acceptance criteria met       |
| 🔁 Doom Loop     | 3 failed attempts             |
| 🌍 Environmental | Missing dependency → escalate |

After 3 failures: STOP → `[ADV:BLOCKED]` → document all 3 attempts → ask via `question`. Record `strategy_label` in `error_recovery.attempts[]`.

| × Bad               | ✓ Good                 |
| ------------------- | ---------------------- |
| Retry same approach | Try different strategy |
| Silent retries      | Document each attempt  |
| 4+ same method      | Escalate after 3       |

### Investment Check-In

`/adv-apply` Phase 1.5 surfaces pending judgment calls before execution. Methodology in `skills/adv-cost-governance-methodology/SKILL.md`; thresholds in `.opencode/instructions/cost-governance.md`.

| Rule                                        | Behavior                                                                  |
| ------------------------------------------- | ------------------------------------------------------------------------- |
| `adv_investment_report` tier classification | auto / escalate / hardstop                                                |
| Hard-stop in v1                             | advisory only — does NOT trigger `adv_change_reenter`                     |
| Doom-loop supersede                         | Doom-loop recovery supersedes investment check-in on simultaneous trigger |
| Unresolved user-value tradeoff              | Triggers `rq-autonomy01` escape-clause citation                           |

### External Conformance

Black-box AC verification run by external CI. Specs under conformance are "locked" after first archive — the agent cannot read conformance test source.

**Tool:** `adv_conformance` (single multi-action tool: `status | init | lock | unlock | override | run`). `run` reads a CI verdict artifact from `artifact_path` and returns `{verdict: 'PASS'|'DRIFT', run_id, failed: [{rq_id, summary}]}`.

**Location modes:**
| Mode | Path | Isolation |
|---|---|---|
| `subfolder` (default) | `.adv/specs/_conformance/` | In-repo, honor-system |
| `sibling` (opt-in) | `{parent}/advance-conformance-{pid}/` | External repo, guard-enforced |

**Archive gate:** Phase 5.5 of `/adv-archive` runs conformance check before executing archive. DRIFT halts archive with 3 user options (fix locally / override / unlock). No auto-fix.

**Override audit:** Every unlock or override requires `{user, reason, re_verify_deadline}`. Recorded permanently in conformance state.

**State location:** `~/.local/share/opencode/plugins/advance/{pid}/conformance.json` (external, project-keyed).

**Enforcement layers:** (1) bash guard blocks git clone/curl/wget on locked sibling paths, (2) tool.execute.before blocks `adv_conformance` during execution gate, (3) path policy blocks read/glob/grep/lgrep on locked conformance directories.

### Cross-Repo Execution

| × Invalid Cancellation        | ✓ Correct                 |
| ----------------------------- | ------------------------- |
| "Out of scope for this repo"  | Switch `workdir`, execute |
| "Different repository"        | Switch `workdir`, execute |
| "Cannot modify external code" | Use `workdir` parameter   |

Rules:

1. Tasks with `target_repo`/`target_path` → execute in target directory
2. Switch `workdir` for all tool calls on that task
3. "Different repo" is × NEVER valid cancellation
4. Task hints at another repo but lacks metadata → confirm via `question`

Config: `related_repos` in `project.json` maps repo IDs to paths.

Review/Harden gates block if cross-repo tasks incomplete or cancelled without approval.

### Cross-Project Coordination

Use when a source ADV change references/contributes to another ADV-enabled project via `target_path`.
Reads: use ADV tools in `snapshot-ok` mode; include `_projectContext`.
Mutations: use ADV tools in `temporal-required` mode; target queue must be reachable.
Untrusted mutation: require `target_confirmed: true` + `confirmationEvidence` citing approval.
Never direct ADV state file reads/writes.
`cross_project_links` records provenance; `external_dependencies` are advisory-only dependencies and never block gates/archive by default.
Inspect `_externalDependencyStatus` for satisfied/warning/blocking counts and drilldown; target-project contribution flow is create/link → verify source link → monitor advisory dependencies → confirmed target mutation.

#### `target_path` matrix (which tools support cross-project)

Tools with `target_path` (read or mutation) accept the optional path argument and route through `resolveTargetProject` / `withTargetPathStore`. Tools NOT in the table operate on the current process project only.

| Tool                                                                                      | Mode                            | Notes                                                                              |
| ----------------------------------------------------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------- |
| `adv_change_show`, `adv_change_list`, `adv_change_validate`                               | snapshot-ok                     | Read-only; no `target_confirmed` needed                                            |
| `adv_status`                                                                              | snapshot-ok                     | Read-only; cross-project disk-snapshot view                                        |
| `adv_task_show`, `adv_task_list`, `adv_task_ready`                                        | snapshot-ok                     | Read-only                                                                          |
| `adv_change_update`, `adv_change_create`                                                  | temporal-required               | Mutation; `target_confirmed: true` + `confirmationEvidence` required for untrusted |
| `adv_change_archive`, `adv_change_close`, `adv_change_bulk_close`                         | temporal-required               | Mutation                                                                           |
| `adv_task_update`, `adv_task_evidence`, `adv_task_tdd`, `adv_task_cancel`, `adv_task_add` | temporal-required               | Mutation                                                                           |
| `adv_gate_status`, `adv_gate_complete`                                                    | temporal-required               | Read-status / mutation                                                             |
| `adv_workflow_repair`, `adv_orphan_sweep`, `adv_temporal_reconnect`                       | temporal-required               | Mutation                                                                           |
| `adv_archive_sweep_orphans`                                                               | temporal-required               | Mutation                                                                           |
| `adv_change_diagnose`, `adv_change_import`, `adv_migrate_cleanup`                         | snapshot-ok / temporal-required | Read-only diagnose; import & cleanup are mutations                                 |
| `adv_run_test`                                                                            | temporal-required               | Mutation (records evidence)                                                        |

Tools without `target_path` (current-project only): `adv_temporal_register_search_attributes`, `adv_temporal_worker_restart`, `adv_reflect`, `adv_conformance`, `adv_agenda_*`, `adv_wisdom_*`, `adv_project_metadata`, `adv_project_context`, `adv_run_test` workdir-resolution.

When a tool you need lacks `target_path` and the work is genuinely cross-project, switch sessions: `cd <other-project> && opencode`.

**Cross-session ADV mutation:** `opencode run --dir <other> --agent build --dangerously-skip-permissions "Run X tool"` works but pays ~60–300s per call. Use sparingly; for >5 sequential ops, open a session in the target project.

#### `status: "in-flight"` filter shorthand

`adv_change_list status: "in-flight"` returns the union `draft + pending + active`. Use this when an agent prompt or human asks "what's in flight" without caring about the specific stored status. The filter is **input-only**; it never appears as a stored `status` value on a change. The plain `"active"` filter (and other status values) keeps its strict storage-enum meaning.

### Cancellation Policy

All cancellations require explicit user approval via `adv_task_cancel`.

Workflow: identify tasks + reasons → present to user via `question` → user approves → call `adv_task_cancel` with evidence.

### Large-Scope Validity

Planned-and-structured size is valid. Once a change has completed the prep gate
with `userApproved`, the agent MUST NOT suggest splitting based on size, complexity,
or task count alone. Size-triggered concerns route through cost-governance Phase 1.5
judgment-call surfacing only.

| × Bad                                     | ✓ Good                                                   |
| ----------------------------------------- | -------------------------------------------------------- |
| "This seems large, want to split?"        | Trust the prep gate; execute                             |
| "Maybe break this into smaller changes?"  | Execute as planned                                       |
| "Lots of tasks here, should we cut some?" | Surface real concerns as judgment calls (Phase 1.5)      |
| Mid-execution split-suggestion            | Mid-execution scope discovery → scope-discovery protocol |

Cost-governance hardstop tier remains advisory — it informs investment check-ins,
not split decisions. See `.opencode/instructions/cost-governance.md`.

For the canonical scope-discovery protocol (when non-campsite scope is found
mid-execution), see `docs/scope-discovery-protocol.md`.

### Task Status Report

On loop stop or compaction: emit `[ADV:TASK_STATUS_REPORT]` with completed/cancelled/remaining. Canonical display rules live in [docs/specs/chat-output-display.md](docs/specs/chat-output-display.md).

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

### Ambiguity Taxonomy

11-category ambiguity taxonomy used by `/adv-proposal` (B/F/S scan), `/adv-discover` (B/F/S/M scan), and `/adv-clarify` (findings-driven mode). Composes alongside `plugin/src/validator/clarify-readiness.ts` (6 heuristic checks, `severity: "warning"`); reuses `clarify_enforcement` flag (`off`/`advisory`/`strict` in `plugin/src/types.ts:1194-1196`).

**Agent-side gap:** Categories D/X/Q/I/E/C/T are scan-optional in v1 — agent decides emission based on change domain.

#### Categories

| Prefix | Name                  | Scope                                          | v1 Enforcement               |
| ------ | --------------------- | ---------------------------------------------- | ---------------------------- |
| **B**  | Boundaries            | What is explicitly in/out of scope; edge cases | Required                     |
| **F**  | Functional Scope      | Required features, behaviors, data flows       | Required                     |
| **S**  | Completion Signals    | Measurability of success/done criteria         | Required                     |
| **M**  | Missing Information   | Critical unknowns, unspecified dependencies    | Required                     |
| **D**  | Data Assumptions      | Data shape, volume, freshness, ownership       | Optional (v2 promotion path) |
| **X**  | External Dependencies | Third-party API, service, or tool constraints  | Optional (v2 promotion path) |
| **Q**  | Quality Attributes    | NFRs: performance, security, accessibility     | Optional (v2 promotion path) |
| **I**  | Integration Points    | Handoffs between systems, modules, teams       | Optional (v2 promotion path) |
| **E**  | Error Handling        | Failure modes, recovery, rollback paths        | Optional (v2 promotion path) |
| **C**  | Conformance           | Standards, compliance, regulatory requirements | Optional (v2 promotion path) |
| **T**  | Temporal Constraints  | Ordering, timing, deadlines, milestones        | Optional (v2 promotion path) |

#### Finding Shape

```
{Letter}{N}  {SEVERITY}  {Category}  {Finding text}
  Evidence: {verbatim quote from source OR `(no {section} section)`}
  Reason: unclear because {X}
```

- `{Letter}{N}` — sequential finding ID within category (B1, B2, F1, S1, ...)
- `{SEVERITY}` — CRITICAL | HIGH | MEDIUM | LOW

#### Severity Rubric

| Severity | Meaning                                                                        | Example                                                                 |
| -------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| CRITICAL | Structurally missing required content; cannot proceed without resolution       | Missing `### Out of Scope` subsection, no `## Success Criteria` section |
| HIGH     | Vague or unmeasurable language that will cause ambiguity during implementation | Success criteria "fast response" without threshold                      |
| MEDIUM   | Soft ambiguity that may cause rework but is resolvable during implementation   | Implicit ordering dependency not stated                                 |
| LOW      | Minor clarity improvement; does not block execution                            | Inconsistent terminology across sections                                |

#### Anti-Hallucination Evidence Rule

Every finding MUST include verbatim source quote OR explicit absence marker. × MUST NOT fabricate, paraphrase, or infer.

| Evidence form  | Format                                           |
| -------------- | ------------------------------------------------ |
| Verbatim quote | `Evidence: proposal.md:{section} "{exact text}"` |
| Absence marker | `Evidence: (no {section} section)`               |

Findings without valid evidence are malformed and MUST NOT be surfaced.

#### Trigger Threshold

- **CRITICAL ≥ 1** → halt current phase, hand off to `/adv-clarify`
- **HIGH ≥ 2** → halt current phase, hand off to `/adv-clarify`
- **Single HIGH** → warning only, continue phase
- Skip trigger evaluation when `clarify_enforcement: 'off'`

Applies in `/adv-proposal` (B/F/S scan) and `/adv-discover` (B/F/S/M scan).

#### Coverage Report

Emit per scan: `Coverage: B:C F:P D:C X:C Q:P I:N/A E:P C:C T:C S:P M:M`.

| Code | Meaning                       |
| ---- | ----------------------------- |
| C    | Clear (no ambiguity)          |
| P    | Partial (some vagueness)      |
| M    | Missing (no content found)    |
| N/A  | Not applicable to this change |

Required categories (B/F/S/M) MUST have a coverage entry; optional MAY be omitted (treated as N/A).

## 7-Gate Quality Checklist

<!-- rq-gatemodel01 -->

| Gate            | Triggered By                        |
| --------------- | ----------------------------------- |
| 1. `proposal`   | `/adv-proposal`                     |
| 2. `discovery`  | `/adv-discover` / research workflow |
| 3. `design`     | `/adv-design`                       |
| 4. `planning`   | `/adv-prep`                         |
| 5. `execution`  | `/adv-apply`                        |
| 6. `acceptance` | `/adv-review` + user acceptance     |
| 7. `release`    | `/adv-harden` + `/adv-archive`      |

Gates are sequential. Archive blocks until release readiness is verified. See [docs/adv-gates.md](docs/adv-gates.md).

<!-- rq-extConfGate01 --> When spec conformance is enabled, the archive flow runs an external CI conformance check at Phase 5.5 (between user sign-off and execute archive). DRIFT verdicts halt archive and present user options; no auto-resolve.

Gate behaviors:

- `discovery`/`planning` evaluate full change including completed tasks — completed work is evidence to validate, not acceptance proof. Add follow-up tasks where gaps found.
- `acceptance` emits `REVIEW_FINDINGS` block (blocker, issue, suggestion, question) and records user acceptance.
- `release` runs hardening, archive spec promotion, git finalization, worktree cleanup, and reflection.

## Command Execution Model

All commands run inline by default. Agents without `task` tool work inline exclusively.

### Slash Command Boundary

Slash commands are top-level entry points for the user/session, not an internal dispatch mechanism for agents.

- Agents must NOT invoke `/adv-*` from inside another agent workflow or sub-agent prompt
- OpenCode may re-dispatch slash commands through command frontmatter `agent:` routing, which can override the current agent context and compound orchestration
- When an agent needs an ADV workflow, it must execute that workflow inline with tools (or read the command file as a contract) rather than calling the slash command itself

### Sub-Agent Orchestration (optional, requires `task` tool)

Available to agents with `task: true` in their frontmatter: `adv`, `build`, `plan`. Use when 3+ independent scan dimensions benefit from parallelism.

| Command   | Inline                   | Sub-Agent                                      |
| --------- | ------------------------ | ---------------------------------------------- |
| research  | Context7 + Kagi + lgrep  | librarian + adv-researcher (single-level only) |
| review    | Sequential per dimension | explore × 5 + librarian + general              |
| harden    | Sequential scans         | explore × 6                                    |
| audit     | Sequential pipeline      | explore × 4                                    |
| slop-scan | Sequential categories    | explore × 9 (single-level only)                |
| tron      | lgrep + read             | adv-tron agent                                 |
| task      | Context7 + Kagi          | librarian + adv-researcher                     |
| refactor  | Sequential drift         | explore × 3                                    |

Rules:

- Sub-agents × NEVER spawn sub-agents (`enforceTaskPolicy` blocks nesting)
- Cap parallel bursts at `MAX_PARALLEL_SUBAGENTS` (runtime constant, currently 3)
- Batch independent work into single spawn message
- × Don't spawn for single-tool-call work
- For `/adv-research`, `librarian`, `adv-researcher`, and `explore` fallback must do the research inline and must not delegate to additional research sub-agents
- For `/adv-slop-scan`, all `explore` scanner workers must do the scan inline and must not delegate to additional sub-agents or invoke `/adv-*` slash commands

Design gate requires mandatory independent validator (adv-researcher) before gate completion. See /adv-design command for verdict handling (VALIDATED, CAUTION, CONFLICT, INCONCLUSIVE).

Inline-only: `/adv-status`, `/adv-idea`, `/adv-problem`, `/adv-proposal`, `/adv-validate`, `/adv-archive`, `/adv-clarify`, `/adv-prep`, `/adv-cleanup`, `/adv-improve`

### Delegation Routing

| Priority | Check                                                                                  | Result             |
| -------- | -------------------------------------------------------------------------------------- | ------------------ |
| 1        | `metadata.delegation_hint` set?                                                        | Use hint value     |
| 2        | `tdd_intent == "not_applicable"`?                                                      | `delegate_allowed` |
| 3        | Title matches `isTrivialTask` patterns?                                                | `delegate_allowed` |
| 4        | Risk signals (multi-file, cross-repo, architectural keywords, failing-test diagnosis)? | `inline_required`  |
| 4.5      | Context-shed test passes? (4-question AND, floor ~5 files or ~50 lines)                | `delegate_allowed` |
| 5        | Default                                                                                | `inline_required`  |

Step 4.5 is the **Context-Shed Test** — a 4-question AND-conjunctive heuristic: (1) orchestrator already made design/architectural decisions for this task, (2) task's HOW does not feed into a downstream task's decisions, (3) acceptance criteria are fully defined before delegation, (4) task is mechanical implementation of a decided plan. Gated by floor: ~5 files touched OR ~50 lines changed. All four must pass AND floor must be met for `delegate_allowed`. Conservative bias: when uncertain, default to `inline_required`.

ADV code-writing delegation targets `adv-engineer` (not `general`). Verify-burst and non-ADV multi-step work remain on `general`.

### Context Packet Standards

Apply packet includes: WORKING DIRECTORY, CHANGE, TASK, AFFECTED FILES, DESIGN EXCERPT, ACCEPTANCE CRITERIA, EXPECTED OUTPUT.

**WORKING DIRECTORY contract:** The `WORKING DIRECTORY` line is a required element of the Apply Context Packet. The `adv-engineer` agent is contractually obligated to extract it and pass it as `workdir` to every `bash`, `read`, `write`, `edit`, `morph_edit`, and `adv_run_test` call. See `.opencode/agents/adv-engineer.md § Working Directory Lock`.

EXPECTED OUTPUT for delegated implementation: implement the task, run tests, emit a fenced `ENGINEER_REPORT` JSON block per `.opencode/agents/adv-engineer.md`.

#### ENGINEER_REPORT Payload

Required top-level keys: `schema_version`, `change_id`, `task_id`, `agent`, `scope`, `status`, `files_touched`, `verification`, `decisions`, `blockers`, `follow_ups`, `related_scan`, `workdir_used`, `context_update_for_adv` (with `what_ads_needs_to_know`, `suggested_next_action`).

The `agent` field MUST be the literal string `"adv-engineer"` — matching the subagent filename in `.opencode/agents/adv-engineer.md`.

Full schema and example: `.opencode/agents/adv-engineer.md` § ENGINEER_REPORT Payload.

### Structured Sub-Agent Prompt Protocol

Every sub-agent spawn must include: ROLE:, OUTPUT_SCHEMA:, BUDGET:, STOP_WHEN:. See individual command files for dimension-specific packets.

### Orchestration Token-Budget Policy

When to spawn: 3+ independent scan dimensions. Max parallel workers: 3 (runtime-enforced via `enforceTaskPolicy`). Batch pattern: spawn 3, wait for completions, spawn next batch. Cap total sub-agents per command at 6 across batches. Use inline work for sequential or context-dependent tasks.

### Phase Summary Pattern

After each phase, use `adv_change_update` to record compact summaries. Do not duplicate full context — reference change state via `adv_change_show` for detailed inspection.

## Sub-Agent Selection

### Agent Tiers

| Tier                                           | Agents                                                       | Loading                             |
| ---------------------------------------------- | ------------------------------------------------------------ | ----------------------------------- |
| **Primary** (user-selectable top-level)        | `adv`, `plan`, `build`                                       | Global `~/.config/opencode/agents/` |
| **Common subagents** (spawnable via Task tool) | `explore`, `general`, `librarian`, `mechanic`, `prioritizer` | Global `~/.config/opencode/agents/` |
| **ADV Specialist** (spawnable, bundled global) | `adv-researcher`, `adv-engineer`                             | Global `~/.config/opencode/agents/` |
| **Repo-Local** (spawnable, repo-scoped)        | `adv-tron`                                                   | Repo-local `.opencode/agents/`      |

> **Primary vs subagent:** Only `mode: subagent` agents are spawnable via the Task tool. `adv`, `plan`, and `build` are primary agents — users switch to them directly; they cannot be invoked through sub-agent spawning.

### Agent Roster

| Agent            | Use For                                                                                              | Tools                                                           |
| ---------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `librarian`      | Docs, API refs, code examples                                                                        | Context7, grep.app, Kagi                                        |
| `adv-researcher` | Architecture validation, simplicity                                                                  | Context7, Kagi, ADV read-only                                   |
| `explore`        | Codebase navigation, find usages                                                                     | Read, Glob, Grep, lgrep                                         |
| `adv-engineer`   | Delegated ADV code-writing executor (Working Directory Lock: must pass `workdir` to every tool call) | Full write (read/write/edit/bash) + narrow ADV reads + evidence |
| `general`        | Verify-only bursts + generic multi-step non-ADV work                                                 | Full tool access                                                |
| `mechanic`       | System/infra issues (MCP, config, ADV diagnostics)                                                   | Vision, bash, read/write, ADV read-only diagnostics             |
| `adv-tron`       | Reconnaissance, hotspot detection                                                                    | Read, Glob, Grep, lgrep                                         |

> **Note:** `adv-tron` is repo-local (requires `.opencode/agents/adv-tron.md`). `adv-researcher` / `adv-engineer` are bundled global specialists — synced to `~/.config/opencode/agents/` by `scripts/sync-global.sh`. All ADV-shipped sub-agents use `adv-<name>` naming.

Orchestrator pattern: spawn `librarian` + `adv-researcher` in parallel → synthesize.

## Skill Discovery Protocol

Enabled in `/adv-research` Phase 1.5. Filesystem-only, no API calls.

| Step    | Action                                                                                       |
| ------- | -------------------------------------------------------------------------------------------- |
| Search  | Trusted skill dirs only: `~/.config/opencode/skills/*/SKILL.md`, repo `skills/*/SKILL.md`    |
| Match   | Read YAML frontmatter, match `keywords` against tech stack + change domain                   |
| Load    | `skill("{name}")` → apply guidance                                                           |
| Trust   | × Never auto-load arbitrary `*/SKILL.md` outside trusted dirs without explicit user approval |
| Degrade | Skip skills without frontmatter/`keywords`; no matches → proceed normally                    |

Skill metadata:

```yaml
---
name: my-skill
description: "What this skill provides"
keywords: ["term1", "term2", "term3"]
---
```

## Skill Creation Protocol

Enabled in `/adv-discover` Phase 1.5 and `/adv-research` Phase 1.5. Conservative — only triggers for the change's core problem domain.

### Trigger Conditions (ALL must be true)

| #   | Condition                                                                    |
| --- | ---------------------------------------------------------------------------- |
| 1   | Phase 1.5 finds no matching skill for a domain                               |
| 2   | Domain is clearly relevant to the change's **core problem** (not tangential) |
| 3   | No partial-skill match covers the domain                                     |

### Naming Convention

`agent-{domain-slug}` (lowercased, hyphenated). **× MUST NOT use `adv-` prefix** — `scripts/sync-global.sh` removes stale `adv-*` skills from global dir.

### Assembly Template

```yaml
---
name: agent-{domain}
description: "Auto-assembled guidance for {domain}"
keywords: ["{domain}", "auto-generated"]
metadata:
  source: "agent-created"
  review_status: "pending"
  created_at: "{ISO-8601 timestamp}"
  trigger_change: "{change-id that triggered creation}"
---

# {Domain} Guidance

## Purpose
{Why this domain matters for the current change}

## Key Patterns
{2-5 domain-specific patterns or best practices from research}

## Common Pitfalls
{2-3 gotchas to avoid}

## Sources
{Citations from Context7, Kagi, grep.app research}
```

### Creation Flow

1. **Research domain** — Context7, Kagi, grep.app → gather domain-specific guidance
2. **Assemble** — populate template with research findings, include source citations
3. **Persist** — write atomically to `~/.config/opencode/skills/agent-{domain}/SKILL.md`
4. **Skip if exists** — if file already exists, report "skill already exists" and skip
5. **Load** — call `skill("agent-{domain}")` and apply guidance in current workflow
6. **Notify** — emit `[ADV:SKILL_CREATED]` with skill name, domain, and brief description

### Pending Review

Auto-created skills set `metadata.review_status: "pending"`. Next `/adv-discover` Phase 1.5:

| Step    | Action                                                         |
| ------- | -------------------------------------------------------------- |
| Scan    | Skills with `review_status: "pending"` BEFORE keyword matching |
| Surface | Present pending skills to user for confirmation                |
| Confirm | Update `review_status` to `"reviewed"`                         |
| Reject  | Delete the skill file                                          |

### Protocol Extension Note

Extends Skill Discovery Protocol's "No matches → proceed normally" — when all trigger conditions are met, "no matches" becomes a conditional creation trigger instead of a terminal state. Non-implementing agents still conform by reporting the gap and proceeding.

## Command vs Skill Boundaries

Commands and skills serve different roles. Use this table to decide where new functionality belongs:

| Use a **command** when                    | Use a **skill** when                           |
| ----------------------------------------- | ---------------------------------------------- |
| User-facing workflow entry point          | Reusable methodology or analysis protocol      |
| Mutates ADV state (changes, tasks, gates) | Read-only guidance or checklist framework      |
| Owns a gate completion                    | Loaded by multiple commands or sub-agents      |
| Requires explicit user invocation         | Domain knowledge independent of workflow state |

### Reference Pattern

`adv-tron` is the canonical example of a command backed by a skill:

- **Command** (`.opencode/command/adv-tron.md`) — owns orchestration, sub-agent spawning, ADV state reads, user interaction
- **Skill** (`skills/adv-tron/SKILL.md`) — holds investigation protocol, search priorities, evidence requirements, report schema
- **Fallback** — command includes embedded protocol if skill is unavailable

Commands that fan out to sub-agents with reusable methodology should follow this pattern: load the skill before spawning workers, pass condensed guidance, fall back to embedded protocol if the skill is missing.

### Classification

**Command-only** (no fixed skill load; may reference skill-discovery protocol):
`adv-idea`, `adv-problem`, `adv-proposal`, `adv-research`, `adv-task`, `adv-validate`, `adv-archive`, `adv-status`, `adv-cleanup`, `adv-clarify`, `adv-refactor`, `adv-improve`, `adv-design`, `adv-audit`

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

> **Stale-reference note:** `adv-review-methodology` and `adv-harden-methodology` skills were inlined and deleted. Calls to `skill("adv-review-methodology")` or `skill("adv-apply-methodology")` are stale/hallucinated references — read the command file's Phase 0 section instead.

### Constraints

- Skills × MUST NOT mutate ADV state (no `adv_change_create`, `adv_task_add`, `adv_gate_complete`).
- Skills × MUST NOT own gate completion or workflow sequencing.
- Commands MUST remain functional if a backing skill is unavailable — inline fallback is required.
- Checklist docs (`docs/checklists/`) remain the canonical source; skills reference them, not duplicate them.

## Worktree Integration

ADV uses external mutable state — all worktrees share changes, archive, wisdom, agenda, reflections, and Temporal workflow state. Specs remain in-repo (`.adv/specs/`). `db_dir` / physical `db/` directories are legacy compatibility only.

### External State

Location: `$XDG_DATA_HOME/opencode/plugins/advance/{project-id}/` (project-id = root commit SHA).

```
{project-id}/
├── changes/     # Active proposals
├── archive/     # Completed
├── wisdom.jsonl      # Learnings
├── reflections.jsonl # Post-completion reflection reports
└── agenda.jsonl      # Work queue
```

ADV worktrees live at `$XDG_DATA_HOME/opencode/worktree/{project-id}/{branch}`. Cleanup tools report leaked external artifacts in dry-run mode first; deletion requires explicit approval. Worker-lock lifecycle artifacts are excluded from generic cleanup.

### Worktree Policy

ADV always isolates mutating work in per-change worktrees. There are no exemptions or conditional skip paths.

- Every change must run in a worktree — create or reuse before Phase 1
- When worktree tools are unavailable → hard block with error. Do not proceed in-place
- Existing worktree for same change → auto-reuse (see Worktree Reuse below)

### Worktree Reuse

Before creating: `git worktree list --porcelain` → find `change/{change-id}` branch.

- Path exists → auto-reuse (switch `workdir`)
- Path missing → `git worktree prune` → proceed fresh

### Spec Divergence

| Data                             | Location             | Shared?                   |
| -------------------------------- | -------------------- | ------------------------- |
| Specs (`.adv/specs/`)            | In-repo, git-tracked | No (branch-local)         |
| Changes, archive, wisdom, agenda | External             | Yes (keyed by project-id) |

Implication: spec changes in worktree A invisible to B until merged. `/adv-validate` and `/adv-audit` in B may see stale specs. Mitigation: merge promptly after archive (Phase 9 handles this).

### Inline Worktree Protocol

1. `adv_worktree_create` → capture returned worktree path
2. **Immediately** set `workdir` to the worktree path for ALL subsequent tool calls
3. Continue inline — no handoff, no new terminal, no navigation hints needed
4. When deleting, pass `branch` arg to `adv_worktree_delete` (required in inline mode)

### Worktree Cleanup

`/adv-archive` Phase 9 handles: stage → commit → detect default branch → refresh basis → choose `--ff-only` / reconcile / PR path → verify → `adv_worktree_delete` → remove `.bak`/`.tmp`/`.orig`. × Never delete worktree with unmerged commits. If worktree tools are unavailable: `[ADV:BLOCKED] Worktree tools unavailable — hard block with error. Do not proceed in-place.`

## When to Use ADV

**Use for:** New features, breaking changes, architecture, compliance, unclear bug fixes via `/adv-problem`
**Use lighter workflows for:** Typos, deps, exploration
