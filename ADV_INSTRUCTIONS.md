# ADV - Spec-Driven Development Instructions

Specs are laws. Requirements are formally defined, validated, and enforced.

## Notation

`→` sequence · `←` blocked by · `✓` complete · `○` pending · `×` forbidden · `⚠` attention

### Instruction Compression Guard

Use `docs/command-voice-standard.md` prose-load templates + caveman-full wording. Exact contract tokens stay unchanged: tool names, gate IDs, statuses, slash commands, enum values, quoted errors, `MUST`, `NEVER`, approval checkpoints, cancellation approval, archive sign-off, JSON/code examples.

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

| Phase           | Mode                         | Detail                                                                                                                                                                                |
| --------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/adv-idea`     | Collaborative                | Fully collaborative; ideation loop before a proposal exists                                                                                                                           |
| `/adv-problem`  | Collaborative                | Fully collaborative; issue triage before deciding fix path                                                                                                                            |
| `/adv-proposal` | Collaborative                | Fully collaborative; approve at end                                                                                                                                                   |
| `/adv-research` | Collaborative                | Fully collaborative; approve at end                                                                                                                                                   |
| `/adv-prep`     | HITL hard gate               | Vision document → explicit user approval → `userApproved: true` on prep gate                                                                                                          |
| `/adv-apply`    | Autonomous                   | No "Begin work" prompt; proceeds after prep approval. Escalate only on failure                                                                                                        |
| `/adv-review`   | Autonomous + drift detection | Auto-fix within scope; stop on drift                                                                                                                                                  |
| `/adv-harden`   | Autonomous + drift detection | Auto-fix scoped issues; stop on drift                                                                                                                                                 |
| `/adv-archive`  | Autonomous                   | Apply spec deltas, capture wisdom, finalize git                                                                                                                                       |
| `/adv-atc`      | Autonomous with HITL-defer   | Defers all HITL moments to linked GitHub issues via structured comments. Never prompts inline. Auto-transitions gates when no HITL needed. Stops on system interrupts (defers to GH). |

### Drift Detection Rule

In autonomous phases (`/adv-review`, `/adv-harden`), before auto-remediating ask: "Will `agreement.md`'s **Success Criteria**, **Acceptance Criteria**, **Constraints**, **Avoidances**, or **Out of Scope** sections need to change?"

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

| Interrupt                     | Trigger                                     |
| ----------------------------- | ------------------------------------------- |
| Doom-loop                     | 3 failed task attempts                      |
| Drift detection               | auto-fix boundary exceeded in review/harden |
| Contract-compromise risk      | identified during design                    |
| Design validator `CONFLICT`   | verdict requires user resolution            |
| Prep gate machine enforcement | `userApproved` required                     |

No other pauses or "shall I continue?" prompts permitted.

## Phase Goals

Each workflow command has a defined phase goal. Canonical in `manifest.ts` (`phaseGoal` field on `CommandDef`). Self-check: "Am I still working toward this phase's goal?"

| Phase           | Goal                                                                                                                          |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `/adv-proposal` | Clarify the problem, user needs, and high-level user outcomes. Establish _what_ and _why_ — no _how_.                         |
| `/adv-research` | Produce a defined, fully-researched proposed plan ready for user approval. Validate the _how_.                                |
| `/adv-discover` | Gather current-state evidence, resolve agreement, and capture objectives and acceptance criteria before design.               |
| `/adv-design`   | Convert the approved agreement into a validated implementation strategy ready for planning.                                   |
| `/adv-prep`     | Complete the flight-check: every gap closed, every dependency mapped, every task ready — ready for autonomous implementation. |
| `/adv-apply`    | Execute the approved plan autonomously. Add discovered tasks within scope. Escalate only on failure.                          |
| `/adv-review`   | Verify implementation matches the approved plan. Auto-fix within scope. Stop on drift.                                        |
| `/adv-harden`   | Verify production-readiness. Auto-fix scoped issues. Stop on drift.                                                           |
| `/adv-archive`  | Promote the change from contract to law: apply spec deltas, capture wisdom, clean up.                                         |
| `/adv-atc`      | Execute a full change pipeline autonomously, deferring HITL moments to GitHub issues while preserving all safety boundaries.  |
| `/adv-reflect`  | Synthesize post-completion learnings into a durable reflection artifact for process improvement.                              |

## Commands

### Core Workflow

| Command                     | Purpose                                                                          |
| --------------------------- | -------------------------------------------------------------------------------- |
| `/adv-idea`                 | Explore rough ideas before drafting a proposal                                   |
| `/adv-problem`              | Triage issues before fixing or drafting a proposal                               |
| `/adv-status`               | Show fast ADV status table                                                       |
| `/adv-roadmap`              | Show fast ADV roadmap table                                                      |
| `/adv-proposal <summary>`   | Extract problem statement, user outcomes, and constraints without creating tasks |
| `/adv-validate <change-id>` | Validate change compliance against specs; block archive on failure               |
| `/adv-apply <change-id>`    | Implement change with TDD, retry on failure, and final verification              |
| `/adv-archive <change-id>`  | Archive completed change: apply spec deltas and finalize git                     |
| `/adv-reflect <change-id>`  | Produce a structured two-plane reflection report for an archived change          |

### Pre-Implementation

| Command                     | Purpose                                                                                              |
| --------------------------- | ---------------------------------------------------------------------------------------------------- |
| `/adv-clarify`              | Ask clarifying questions to resolve ambiguous requirements                                           |
| `/adv-research <target>`    | Produce a defined, fully-researched proposed plan ready for user approval                            |
| `/adv-discover <change-id>` | Gather context, analyze current state, identify objectives, and obtain user agreement                |
| `/adv-design <change-id>`   | Validate architecture decisions, produce implementation strategy, and present design for user review |
| `/adv-prep <change-id>`     | Analyze gaps and synthesize tasks from approved agreement plus validated design                      |

### Post-Implementation

| Command                   | Purpose                                                                                 |
| ------------------------- | --------------------------------------------------------------------------------------- |
| `/adv-review <change-id>` | Review code for correctness, security, and architecture; emit REVIEW_FINDINGS           |
| `/adv-harden <change-id>` | Detect low-quality code, verify test coverage, clean up; block archive on open findings |
| `/adv-audit [capability]` | Detect drift between specs and current implementation                                   |
| `/adv-slop-scan [path]`   | Scan slop, deletion safety, and detector coverage                                       |
| `/adv-arch-scan [path]`   | Scan architecture stack packs, coverage, and heuristic fallbacks                        |
| `/adv-comp-scan <target>` | Scan competitor capabilities against this project for competitive intelligence          |

### Fast-Track / Advanced

| Command                     | Purpose                                                                                              |
| --------------------------- | ---------------------------------------------------------------------------------------------------- |
| `/adv-task`                 | Fast-track small changes: assess spec-law impact, prep, and hand off                                 |
| `/adv-atc [target]`         | Execute autonomous ROADMAP pipeline, deferring HITL to GitHub issues, stop only on safety boundaries |
| `/adv-refactor [change-id]` | Refresh a stale proposal or batch-refresh the oldest 30% of active changes                           |
| `/adv-cleanup`              | Triage stale, abandoned, duplicate, and ready-to-archive active changes                              |
| `/adv-triage`               | Triage all backlog sources, score features with WSJF, regenerate ROADMAP.md                          |
| `/adv-improve`              | Suggest targeted improvements to existing specs or implementation                                    |
| `/adv-tron [target]`        | Investigate codebase structure, hotspots, risks, and suggest follow-up agenda candidates             |

## Command Boundaries

| Command  | Produces                                                                                                                             | × MUST NOT                                                               | Gate                                     |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ | ---------------------------------------- |
| proposal | Problem statement, User Outcomes, constraints                                                                                        | Create tasks, complete gates, impl decisions                             | proposal                                 |
| discover | Current-state evidence, objectives, agreement, acceptance criteria                                                                   | Create tasks, complete non-discovery gates                               | discovery                                |
| design   | Validated implementation strategy                                                                                                    | Create tasks, bypass validator                                           | design                                   |
| prep     | Task graph, gap analysis, sequencing                                                                                                 | Complete non-planning gates, architecture decisions                      | planning                                 |
| task     | Change + tasks + gates (tracked fast path; includes spec-law impact assessment and crash recovery through durable change/task state) | Skip spec-law Add/Modify/Remove/No update/Uncertain assessment           | proposal + discovery + design + planning |
| apply    | Implementation via TDD                                                                                                               | Auto-complete discovery/planning gates                                   | execution                                |
| review   | Review findings and acceptance evidence                                                                                              | Archive, release, or expand scope silently                               | acceptance                               |
| archive  | Spec promotion, release readiness, cleanup                                                                                           | Skip validation, conformance, or sign-off                                | release                                  |
| reflect  | Reflection report (JSON + Markdown), friction analysis, improvement suggestions                                                      | Mutate change state, tasks, or gates; block archive when invoked from it | None                                     |

- Only `/adv-prep` (and exempt `/adv-task`) may call `adv_task_add`
- `/adv-apply` stops if discovery or planning gates pending
- Deployment is outside ADV's gate lifecycle — ADV stops at push. Post-release deploy is a separate, user-initiated step
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

Tab title: initial identity only, `advChange` when a change is active or `project` when idle. No dynamic status/progress retitles. System-emitted: `[ADV:ACCUMULATED_WISDOM]`, `[ADV:TODO_CONTINUATION]`, `[ADV:RECORD_WISDOM]`

### Context Snapshot

`_contextSnapshot` — compact summary closing the context agreement gap:

- Change ID/title, gate progress (`[✓ proposal] [○ execution] ...`), task counts, current task, workdir

Emitted by mutation/ticker tools such as `adv_change_create`, `adv_change_reenter`, `adv_gate_complete`, `adv_status` primary change, and task-state ticker tools (`adv_task_update`, `adv_task_ready`, `adv_task_add`, `adv_task_cancel`). Read tools omit it by default, except `adv_change_show include: { snapshot: true }`, which returns `_contextSnapshot` on request.

**Cross-Repo Switch** — emit via `formatCrossRepoSwitch()`.

## Critical Protocols

### MCP Tool Name Contract

MCP callable names are exact schema identifiers; never normalize, split, or recase them. Current examples: `context7_resolve-library-id`, `context7_query-docs`, `exa_web_search_exa`, `exa_web_search_advanced_exa`, `exa_web_fetch_exa`, `searchcode_code_search`, `searchcode_code_get_file`, `firecrawl_firecrawl_scrape`, `vision_vision_list`, `lgrep_search_semantic`.
Invalid examples: `code_search`, `context7_resolve_library_id`, `context7_query_docs`, `web_search_exa`, `firecrawl_scrape`, `vision_list`.
If a tool-name call fails, copy the exact name from the available-tools list and retry at most once; do not repeat the same unavailable name.

### Structural Correctness (P33)

Make correctness structural before heuristic: prefer types, schemas, parsers, state machines, invariants, contracts, database constraints, generated validators, and tests. Fully recognize/normalize untrusted input before processing.

| Area                      | Structural owner                                                                                                       | Heuristic allowed only for                                        |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Gates/tasks/backlog/specs | `adv_gate_*`, tasks, `metadata.tdd_intent`, validators, specs, conformance, exact refs, typed fields, user assignments | discovery, ranking, triage hints, legacy fallback, advisory risks |

Heuristics MUST NOT be sole authority for correctness, security, persistence, workflow state, gate completion, or spec compliance. If unavoidable: isolate, document assumptions, add deterministic guardrails, test edge cases/properties.

### Truth Ordering Cascade

When artifacts conflict, later gates override earlier gates. Spec requirements override all artifacts.

| Priority | Source | Authority |
|----------|--------|-----------|
| 1 (highest) | `.adv/specs/*.md` | Spec laws — immutable until spec delta archived |
| 2 | `agreement.md` | Confirmed objectives, AC, constraints, avoidances |
| 3 | `design.md` | Validated architecture decisions |
| 4 | `proposal.md` | Problem statement, scope, user outcomes |
| 5 (lowest) | Conversation | Current session context |

**Conflict resolution:** If `proposal.md` says X but `agreement.md` says Y, follow Y. If `agreement.md` conflicts with a spec requirement, follow the spec. Gate sequence enforces this ordering structurally — later gates cannot complete without prior gates done.

**Non-blocking warnings:** Gate readiness may emit advisory warnings when artifact conflicts are detected. These do not block gate completion but surface potential drift for agent awareness.

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

- Each mutating execution session owns its own worktree; read-only/status sessions may run from the main checkout.
- ADV state mutations are serialized by Temporal — no client-side locks needed
- Git filesystem ops (`git worktree add/remove`) coordinate via narrow per-repo flock (~50ms hold)

**Plugin behavior:** At init, the plugin scans peer `opencode` processes sharing project (`git rev-parse --git-common-dir` OR ADV project-id). Peer found → emits `[ADV:PEER_SESSIONS] N peer session(s) active in this project.` Informational only; peers supported.

Peer-session visibility (`adv_status`, `adv_session_list`) assumes same project = same trust domain. Multi-developer / shared-CI scenarios are out of scope; revisit via separate change if needed. The defensive opaque `session_id` schema (no PID, no full path in public output) mitigates leak risk.

**Useful tools:**

- `adv_status` — Peer Sessions section (session_id + started_at + worktree-basename)
- `adv_session_list` — list peer sessions in same project
- `adv_session_show <session_id>` — own-session details only (privacy-defensive)
- `adv_temporal_diagnose` — peer count, worker-lock holder PID, change workflow presence
- Stability: `adv_status view:"health"` shows worker_singleton_enforce default false; worktree_guard_enforce default true (post-rollout, rq-autoManageAdvWorktrees AC2); `worker_role` = `host`/`client`/`degraded`; opt-in: explicit true or `ADV_FORCE_IN_PROCESS_WORKER=1`.
- Worktree guard: trunk write firewall enforcement is default-on. `worktree_guard_enforce` omitted or true enables strict blocking. Explicit `worktree_guard_enforce: false` is the legacy escape hatch — pre-flip behavior was "omitted or false allows default-checkout file writes and classified destructive bash writes". `worktree_guard_enforce=true` blocks main-checkout writes with `WorktreeIsolationViolation` + remediation. Advance repo opts into strict mode by default (no explicit project.json override needed). Auto-managed changes (per-change `worktree_auto_managed: true` marker) override the global flag and always engage the guard. Existing-worktree exception: when a setup-ready ADV worktree already exists for the change, guarded gate/task state-transition mutations from the main checkout are ALLOWED regardless of the `worktree_auto_managed` marker (existing-worktree detection over the durable change-workflow `worktrees` map is the structural authority; the marker is a fast-path hint). File-write isolation (checkpoints/edits) is unchanged; the ALLOW is scoped to durable state-transition signals only.
- Health probes: `_freshness.{probe}` = `cached_at`, `stale`, optional `error`. Stale values are diagnostic-only; never use stale probe data for worker-lock reclaim, restart success, conformance override, or archive.

**Known OpenCode-core race (out of ADV's layer):** OpenCode's snapshot service is keyed on `projectID`, not on worktree path. Two sessions on the same project — even in different worktrees — race on `~/.local/share/opencode/snapshot/{projectID}/{sha}/index.lock` and lose between-turn snapshots with `exitCode=128 ... 'index.lock': File exists`. ADV's task-checkpoint commits (separate git ops in the worktree) are unaffected, but OpenCode's snapshot history develops gaps. Tracked in Advance issue #118 — fix is OpenCode-core, not ADV. The "Multi-session is the supported design center" claim above applies to **ADV state and per-worktree git**, not to OpenCode's snapshot subsystem.

### ADV MCP Tool Invocation

× NEVER invoke ADV tools with empty parameter sets. Always provide all required args explicitly.

- `adv_change_update` — always pass `changeId` + at least one of `proposal`, `problemStatement`, `agreement`, `design`, `executiveSummary`. Zero-args calls hit a 10s safety-net timeout and return `errorClass: ToolExecutionTimeout`. Confirm the target with `adv_change_show` or `adv_change_list` first.
- `adv_task_add` — before passing `blockedBy`, call `adv_task_list changeId: <id>` to fetch current task IDs. Unknown IDs are rejected with the list of valid IDs so you can self-correct, but this costs a round trip.
- `adv_task_add` — `metadata.tdd_intent` defaults to `"inline"` when omitted. Pass it explicitly for `"separate_verification"` (cross-cutting verify tasks) or `"not_applicable"` (docs/config/verification-only tasks). The validator's logic-heavy heuristic flags missing TDD evidence on tasks defaulted to `inline` regardless of content prose; set explicit metadata at creation time. <!-- rq-TDD002sep rq-TDD003na -->
- `adv_task_cancel` — all `taskIds` must exist in the same change. Cancellations are atomic: if any ID is unknown, NO task is cancelled. Verify with `adv_task_list` before calling.
- `adv_change_archive` — when archiving from a worktree, pass `worktreePath: <worktree-root>` so the in-repo bundle lands inside the worktree's `.adv/archive/` (where `/adv-archive` Phase 9 Step 1 stages it on the change branch). Omitting the arg defaults to `store.paths.root` (main checkout) and the bundle ends up untracked in main, requiring a separate trunk commit.
- `adv_run_test` — pass `timeoutMs` (range `[1000, 300_000]` ms, default `30_000`) for slow commands like `pnpm run check` or full suites. Without it, commands taking >30s SIGTERM and the tool returns `errorClass: TestExecutionTimeout`.
- `adv_gate_complete` — planning gate requires `userApproved: true`. Other gates accept the flag but only planning enforces it.
- Tool `describe()` text documents relational constraints (which other tool to call first, at-least-one-of patterns, valid enum values). Read field descriptions before constructing calls.

**Strict-mode tolerance.** OpenAI Responses API (GPT-5 / reasoning models) auto-applies `strict: true`, causing placeholder fills (`""`, `0`, `[]`) in every optional field. Preflight normalizes these automatically: optional content, path, and lineage blanks are omitted, and `origin_issue_number: 0` is treated as omitted. Required-when-present audit, evidence, reason, command, branch, and identity fields still reject blanks. This is a safety-net workaround for Vercel AI SDK issue #12200. Agents should still aim to omit fields they do not intend to set.

### Question Tool UX

Write-in option enforced by P26 (`rules.yaml`). ADV notes:

- Contextual write-in labels (`Other`, `Different approach`) — not generic
- 2-5 options including write-in, concise labels
- Leave custom input enabled

**Note convention:** Optionally append a synthetic trailing question with header `"Note for agent"` to give users a free-form context slot. Positional parsing extracts the note from the last answers-array element. Normalizes empty/`"No note"`/missing → absent. Max 4 real questions + 1 note = 5 total. See `docs/adv-question-tool.md` § Note for Agent Convention for full rules. **Non-checkpoint only** — never add to human checkpoint surfaces (`rq-inlineApproval01`).

**Scope of question tool use:** Reserved for non-checkpoint structured choices: change-id selection / disambiguation, doom-loop recovery, drift detection in `/adv-review` and `/adv-harden`, AC clarification rounds (Phase 4.5 of `/adv-discover`), and triage commands (`/adv-idea`, `/adv-problem`, `/adv-clarify`). Human checkpoints listed above use inline handoff text per `docs/command-voice-standard.md` § Inline Approval Voice and `rq-inlineApproval01`.

### Tradeoff Prioritizer Protocol

When 2+ viable approaches depend on user values → run the prioritizer protocol before asking.

**Default (inline):** Scan code → research tradeoffs → draft criteria questions → pass to `question` tool → restate priorities → recommend.

**Optional (skill):** Load `skill("prioritizer")` for structured criteria question templates and decision map guidance. The prioritizer is a skill/inline protocol, not a spawnable sub-agent.

Skip for: bug fixes, mechanical work, choices constrained by security/API/architecture.

### Context Freshness

Phase start (once): prefer the augmented form
`adv_change_show changeId: <id> include: { snapshot: true, readyTasks: true }` —
this single call collapses the legacy trio
(`adv_change_show + adv_gate_status + adv_task_ready`) into one round trip:

| Flag                                | Attached field                                                               | Replaces                                                            |
| ----------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `include.snapshot: true`            | `_contextSnapshot` (top-level rendered string)                               | `adv_change_show` proposal/gate-row reading + manual reconstruction |
| `include.readyTasks: true`          | `_readyTasks` (top-N) + `_readyTasksMeta` (`{ total, limit, blockedCount }`) | `adv_task_ready changeId: <id>`                                     |
| `include.readyTasksLimit: N` (1-50) | overrides default top-10 slice                                               | —                                                                   |

Default behavior is preserved when `include` is omitted (legacy callers and read-only inspections continue to work unchanged).

Per task: `adv_task_show` → refresh only the current task. Do NOT call adv_change_show before every task — use the lighter per-task refresh.

TodoWrite during ADV execution is a projection over ADV tasks: copy `_todoProjection` rows (`tk-abc123 — title`). Entries without `tk-*` IDs are scratchpad-only/warning-first; non-ADV, early-gate, degraded-state, and subagent scratchpad use remains allowed.

### TDD Protocol (RSTC)

Inline TDD is default — red/green phases WITHIN each task. × Do NOT create separate test tasks for same scope.

- **RED:** Write failing test using editing tool (`edit` / `write` / `morph_edit`) → run with `adv_run_test phase:'red'` → show failure evidence
- **GREEN:** Implement using editing tool → run with `adv_run_test phase:'green'` → if fails: retry protocol → show pass evidence
- **VERIFY:** Optional final check → run with `adv_run_test phase:'verify'` → show pass/fail evidence
- **Trivial:** Note `(trivial: docs change)`, skip TDD
- **Cross-cutting:** Separate verification tasks OK → mark `metadata.tdd_intent: "separate_verification"`

`adv_run_test phase` is descriptive metadata, not gate enforcement. Use `passed`, `classification`, and `exitCode` as command-result evidence.

`adv_run_test` is prescribed for ordinary inline red/green work because it provides executable proof for the current agent run. Durable final proof is recorded on `taskCompletedSignal.verification` when the task transitions to `done` via `adv_task_checkpoint`. <!-- rq-ADVEXEC04 rq-ADVEXEC05 -->

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

**Apply-loop ordering:**

| Step | Action                                                                                                                                       |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 3a   | Start — `adv_task_update status: "in_progress"`                                                                                              |
| 3a.6 | Clean Baseline Capture — verify clean tree, record HEAD/branch                                                                               |
| 3b   | Red Phase — write failing test                                                                                                               |
| 3c   | Green Phase — implement, tests pass                                                                                                          |
| 3c.4 | **Incremental Verification** — build/tests/lint pass                                                                                         |
| 3c.5 | **Checkpoint** — `adv_task_checkpoint` with change/branch/HEAD/verification fires and verifies `taskCompletedSignal` to mark the task `done` |
| 3d   | Complete — verify checkpoint output (`checkpointRecorded:true`); do not call `adv_task_update status: "done"` in normal apply flow           |

**Failure classification:**

| Classification                                    | Action                                                |
| ------------------------------------------------- | ----------------------------------------------------- |
| `SEMANTIC` (hook rejection, branch/HEAD mismatch) | Diagnose, re-run (retry budget)                       |
| `ENVIRONMENTAL` (not a git repo, detached HEAD)   | Escalate via `question`                               |
| `TRANSIENT` (index.lock contention)               | Tool retries internally; remaining failure → SEMANTIC |

**Commit message format:**

- Subject: `chore(adv): checkpoint <task-id>` or `chore(adv): cancel checkpoint <task-id>`
- Body trailers: `Change: <change-id>`, `Task: <task-id>`, `Mode: complete|cancel`, `Reason: <reason>` for cancel, `Verification: <summary>`

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

See also: `skill("adv-diagnose")` Phase 1 for feedback-loop construction before choosing the next recovery strategy.

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

**State location:** `$XDG_DATA_HOME/opencode/plugins/advance/{pid}/conformance.json` (external, project-keyed).

<!-- rq-twf01 -->

**Enforcement layers:** (1) conformance bash guard blocks git clone/curl/wget on locked sibling paths, (2) `tool.execute.before` blocks `adv_conformance` during execution gate, (3) path policy blocks read/glob/grep/lgrep on locked conformance directories, (4) in strict mode (`worktree_guard_enforce=true`), trunk write firewall (`plugin/src/tools/trunk-write-firewall.ts`) blocks direct file writes and known destructive bash writes to the trunk checkout on the default branch.

### Trunk Write Firewall

When `worktree_guard_enforce=true`, `tool.execute.before` checks `write`/`edit`/`morph_edit` targets plus known destructive bash write patterns (`>`/`>>`, `tee`, `sed -i`, `cp`, `mv`, `rm`). Writes to ADV worktrees, outside repos, or active git recovery states (`MERGE_HEAD`, `REBASE_HEAD`/rebase dirs, `CHERRY_PICK_HEAD`, `REVERT_HEAD`) are allowed. Git commands are not classified or blocked by this firewall; P32 is enforced by where files are edited, not by restricting git operations. Residual risk: shell-variable indirection, shell aliases/functions, and script-internal writes may evade string parsing; ADV still forbids intentional trunk-checkout file writes outside worktrees.

### Cross-Repo Execution

"Out of scope for this repo" / "different repository" / "cannot modify external code" are invalid cancellation reasons. Correct action: switch `workdir` to the task's `target_repo`/`target_path` and execute. If a task hints at another repo but lacks metadata, confirm via `question`.

Config: `related_repos` in `project.json` maps repo IDs to paths.

Review/Harden gates block if cross-repo tasks incomplete or cancelled without approval.

### Change Origin Linkage Strategy

ADV change ≠ GH issue. ADV change = workflow state machine (gates, tasks, validation, archive) on Temporal. GH issue = registered intent on GitHub. Reference each other; neither reduces to other.

Three flow directions. All valid:

| Kind        | When                                                                       | Issue creation                                            | Auto-close on archive              |
| ----------- | -------------------------------------------------------------------------- | --------------------------------------------------------- | ---------------------------------- |
| `roadmap`   | Promoted from GH Project / ROADMAP.md via `/adv-roadmap` → `/adv-proposal` | Issue upstream — `change.origin.issue_number` required    | Yes (opt-in once automation ships) |
| `discovery` | Mid-session find (bug, drive-by, `/adv-improve` hit)                       | Optional post-hoc                                         | No                                 |
| `triage`    | `/adv-triage` promotes non-GH artifact (agenda, wisdom, note, TODO)        | Created by `/adv-triage`; `issue_number` set on promotion | Yes                                |
| `adhoc`     | Explicit, no upstream (spikes, legacy)                                     | Never                                                     | Never                              |

Typed primitive: `change.origin = { kind, issue_number?, source_artifact? }` (`plugin/src/types/changes.ts`). Optional for back-compat; legacy → `adhoc` on read.

**Source-of-truth split:**

| Surface                                                     | Source of truth                     | Why                                                                                                       |
| ----------------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Ranked backlog                                              | GH Project v2 + `ROADMAP.md` mirror | Multi-stakeholder, public, score fields (V/TC/RROE/E/WSJF). Moving to Temporal kills stakeholder surface. |
| In-flight ADV state (changes, tasks, gates, agenda, wisdom) | Temporal + on-disk projection       | Session-coordinated, gate-validated, replay-safe. GH can't model.                                         |
| Linkage                                                     | `change.origin` (in `change.json`)  | Linkage IS ADV state. Lives with rest of ADV state.                                                       |

**Current scope:** Schema shipped (`change.origin` field, `adv_change_create` accepts origin args, `adv_roadmap` cross-references active changes by `origin.issue_number`). Linked roadmap/triage archives close upstream issues by default per `rq-issueChangeLinkage02`. Remaining behavior automation (`/adv-proposal #N` body prefill, reverse-indexed recommendations) = follow-up change. × Don't short-circuit inline.

**Anti-patterns:**

| × Bad                                           | ✓ Good                                                                         |
| ----------------------------------------------- | ------------------------------------------------------------------------------ |
| Auto-create GH issue from every `/adv-proposal` | Only when `origin.kind === 'roadmap'`; post-hoc promotion is `/adv-triage` job |
| `linked_issues[]` as canonical link             | `change.origin.issue_number` — single, typed, queryable. Arrays advisory only. |
| Move ranked backlog into Temporal               | Keep in GH Project. `.adv/roadmap-snapshot.json` = agent-readable mirror.      |
| Ship behavior + schema together                 | Schema first, validate via `adv_roadmap` cross-refs, then automation.          |
| Default new change to `origin.kind = 'roadmap'` | Default omitted or explicit. `roadmap` requires `issue_number`.                |

**Agent picks `origin_kind` at create:**

- From `/adv-roadmap` rec → `roadmap` + `origin_issue_number: N` (or use `/adv-proposal #N` which sets these automatically — `rq-issueChangeLinkage01`)
- From mid-session bug → `discovery`
- From `/adv-triage` promotion → `triage` + `origin_source_artifact: <ag-id|wisdom-id|...>` + `origin_issue_number: <created-issue>` (`rq-issueChangeLinkage01`)
- Ad-hoc, no upstream → `adhoc` (or omit)

**Active linkage requirements:**

<!-- rq-issueChangeLinkage01 -->

- `rq-issueChangeLinkage01`: `/adv-proposal #N` MUST resolve issue body via `gh issue view`, sanitize via `rq-roadmapOriginSanitize01`, set `origin.kind='roadmap'` + `origin.issue_number=N` on the created change. Same contract used by `/adv-triage` triage-origin tagging (with `kind='triage'`).

<!-- rq-issueChangeLinkage02 -->

- `rq-issueChangeLinkage02`: `/adv-archive` MUST default to closing linked GitHub issues after push verification when `origin.kind ∈ {'roadmap', 'triage'}` and `origin.issue_number` is positive, unless `--no-close-issue` is passed. `--close-issue` MUST remain accepted as backward-compatible explicit affirmative / no-op. Exit-code-only error handling (gh natively idempotent). Failure non-fatal (`[ADV:ATTN]`); archive state canonical, no rollback.

<!-- rq-issueChangeLinkage03 -->

- `rq-issueChangeLinkage03`: `github_project` linkage config MUST live in `.adv/github-project.json` with dedicated Zod schema (`plugin/src/storage/github-project-config.ts`). Legacy `project_metadata['github_project']` is read-only fallback that migrates forward on first read; legacy entry NOT deleted post-migration.

Uncertain? Omit. Legacy semantics safe.

### Cross-Project Coordination

Use when a source ADV change references/contributes to another ADV-enabled project via `target_path`.
Reads use `snapshot-ok` + `_projectContext`; mutations use `temporal-required` + reachable target queue. Untrusted mutation requires `target_confirmed: true` + `confirmationEvidence`. Never direct ADV state file reads/writes. `cross_project_links` records provenance; `external_dependencies` warn only and never block gates/archive by default. Inspect `_externalDependencyStatus`; flow: create/link → verify source link → monitor advisory dependencies → confirmed target mutation.

#### `target_path` matrix (which tools support cross-project)

- `snapshot-ok`: `adv_change_show`, `adv_change_list`, `adv_change_validate`, `adv_status`, `adv_task_show`, `adv_task_list`, `adv_task_ready`.
- `temporal-required`: `adv_change_update`, `adv_change_create`, `adv_change_archive`, `adv_change_close`, `adv_change_bulk_close`, `adv_task_update`, `adv_task_cancel`, `adv_task_add`, `adv_task_reclassify_tdd`, `adv_gate_status`, `adv_gate_complete`, `adv_temporal_reconnect`, `adv_run_test`.
- Current-project only: `adv_temporal_register_search_attributes`, `adv_temporal_worker_restart`, `adv_reflect`, `adv_conformance`, `adv_agenda_*`, `adv_wisdom_*`, `adv_project_metadata`, `adv_project_context`.

Missing `target_path` and genuinely cross-project? Switch sessions: `cd <other-project> && opencode`.

<!-- rq-dryRunMutation01 rq-crossProjectTaskMutation01 -->

**Cross-session ADV mutation:** `opencode run --dir <other> --agent build --dangerously-skip-permissions "Run X tool"` works but pays ~60–300s per call. Use sparingly; for >5 sequential ops, open a session in the target project.

**Dry-run mutations:** same success shape + `dryRun: true`; no Temporal signals, ADV state writes, conformance audit writes, worktree deletion/hooks, or filesystem writes. `target_path` dry-runs may read target state without untrusted mutation confirmation because they do not mutate.

<!-- rq-nonLlmToolExec01 -->

No direct non-LLM ADV tool-exec helper ships until OpenCode exposes stable tool execution (or equivalent structural runtime path). Do not build ad-hoc CLI paths that duplicate STSL, Temporal workflow access, store lifecycle, target trust gates, or audit semantics. Track #71 / upstream `anomalyco/opencode#25478`.

#### `status: "in-flight"` filter shorthand

`adv_change_list status: "in-flight"` returns the union `draft + pending + active`. Use this when an agent prompt or human asks "what's in flight" without caring about the specific stored status. The filter is **input-only**; it never appears as a stored `status` value on a change. The plain `"active"` filter (and other status values) keeps its strict storage-enum meaning.

### Cancellation Policy

All cancellations require explicit user approval via `adv_task_cancel`.

Workflow: identify tasks + reasons → present to user via `question` → user approves → call `adv_task_cancel` with evidence.

### Large-Scope Validity

Planned-and-structured size is valid. Once a change has completed the prep gate
with `userApproved`, the agent MUST NOT suggest splitting based on size, complexity,
or task count alone.

| × Bad                                    | ✓ Good                                                   |
| ---------------------------------------- | -------------------------------------------------------- |
| "This seems large, want to split?"       | Trust the prep gate; execute                             |
| "Maybe break this into smaller changes?" | Execute as planned                                       |
| Mid-execution split-suggestion           | Mid-execution scope discovery → scope-discovery protocol |

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

11-category ambiguity taxonomy used by `/adv-proposal` (B/F/S scan), `/adv-discover` (B/F/S/M scan), `/adv-clarify` (findings-driven mode), and `/adv-audit` (B/F/S/Q/E spec-law scan). Composes alongside `plugin/src/validator/clarify-readiness.ts` (6 heuristic checks, `severity: "warning"`); reuses `clarify_enforcement` flag (`off`/`advisory`/`strict` in `plugin/src/types.ts:1194-1196`).

**Two-surface taxonomy:**

| Surface          | Context                                       | Categories        | Source                                                  |
| ---------------- | --------------------------------------------- | ----------------- | ------------------------------------------------------- |
| Change artifacts | In-flight proposal/discovery/agreement/design | B, F, S, **M**    | `/adv-proposal` Phase 2.6, `/adv-discover` B/F/S/M scan |
| Spec laws        | Committed `.adv/specs/*.md` files             | B, F, S, **Q, E** | `/adv-audit` Phase 3 inline scan                        |

**Required-set difference:**

- **M** (Missing Information) is change-artifact-only — it captures critical unknowns about the change itself.
- **Q** (Quality Attributes) and **E** (Error Handling) are spec-law-specific — they capture NFR and failure-mode gaps in committed specifications.
- B, F, S are shared across both surfaces.

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
| CRITICAL | Structurally missing required content; cannot proceed without resolution       | Missing `### Out of Scope` subsection, no `## User Outcomes` section    |
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

**Post-release deploy:** Deployment is outside ADV's gate lifecycle — ADV stops at push. Post-release deploy is a separate, user-initiated step.

<!-- rq-extConfGate01 --> When spec conformance is enabled, the archive flow runs an external CI conformance check at Phase 5.5 (between user sign-off and execute archive). DRIFT verdicts halt archive and present user options; no auto-resolve.

Gate behaviors:

- `discovery`/`planning` evaluate full change including completed tasks — completed work is evidence to validate, not acceptance proof. Add follow-up tasks where gaps found.
- `acceptance` emits `REVIEW_FINDINGS` block (blocker, issue, suggestion, question) and records user acceptance.
- `release` runs hardening, archive spec promotion, git finalization, worktree cleanup, and reflection.

### Scope Boundaries & Negative Constraints

Negative constraints flow through artifacts in a structured refinement path:

| Artifact | Section | Purpose | Contract Kind |
|----------|---------|---------|---------------|
| `proposal.md` | `### Must Not` | Early negative constraints (seeds avoidances) | — (advisory, not parsed) |
| `agreement.md` | `## Avoidances` | Refined, confirmed avoidances | `avoidance` (prefix `DONT`) |
| `agreement.md` | `## Out of Scope` | Boundary exclusions | `out_of_scope` |

**Refinement flow:** `Must Not` (proposal) seeds `Avoidances` (agreement) → parsed into `ChangeContract` items → checked by design validator + drift detection + review matrix.

**Key infrastructure:**
- `contract-mint.ts` parses `## Avoidances` heading via regex `/^(avoidances|avoidance|do not|do nots)$/i`
- Avoidance items get `DONT` prefix in contract IDs
- Design validator checks tasks don't violate avoidance constraints
- Drift detection in `/adv-review` and `/adv-harden` flags avoidance violations as blockers

### Gate Artifact Validators

Each gate requires a minimum artifact before completion. Enforcement lives in `gate-readiness.ts`.

| Gate | Required Artifact | Validator |
|------|-------------------|-----------|
| `proposal` | `proposal.md` | `ARTIFACT_BACKED_GATES` map |
| `discovery` | `agreement.md` | `ARTIFACT_BACKED_GATES` map |
| `design` | `design.md` | `ARTIFACT_BACKED_GATES` map |
| `acceptance` | `acceptance.md` | `ARTIFACT_BACKED_GATES` map |

**Validation checks** (`stateBackedArtifactEvidence()`):
1. Artifact file exists in change state
2. Content ≥ 20 non-whitespace characters (rejects stubs)
3. Metadata present (creation timestamp)

**Blocking conditions:** `ARTIFACT_MISSING` (file absent) or `ARTIFACT_UNDERSIZED` (< 20 chars) prevent gate completion. Compile-time `_gateArtifactKindCheck` in `types/gates.ts` ensures type safety of the gate→artifact mapping.

## Command Execution Model

All commands run inline by default. Agents without `task` tool work inline exclusively.

### Slash Command Boundary

Slash commands are top-level entry points for the user/session, not an internal dispatch mechanism for agents.

- Agents must NOT invoke `/adv-*` from inside another agent workflow or sub-agent prompt
- OpenCode may re-dispatch slash commands through command frontmatter `agent:` routing, which can override the current agent context and compound orchestration
- When an agent needs an ADV workflow, it must execute that workflow inline with tools (or read the command file as a contract) rather than calling the slash command itself

### Delegation Defaults

<!-- rq-delDefaults01 rq-delDefaults02 rq-delDefaults03 rq-delDefaults04 -->

The workflow-step delegation matrix is Advance source-plane law in `delegation-defaults` (`.adv/specs/delegation-defaults/spec.json`). It is the source/evaluation artifact for step mode, allowed sub-agents, delegated sub-steps, and safety boundaries. Do not duplicate the matrix here; source maintainers update the spec and asset tests. Runtime field agents consume deployed command/agent guidance and must not be required to inspect this repo-local spec during normal downstream workflows.

Design gate requires mandatory independent `adv-researcher` validator before completion (`VALIDATED`, `CAUTION`, `CONFLICT`, `INCONCLUSIVE`). Command files carry the exact operational packets for delegated sub-steps.

Utility commands keep their own delegation rules in command files, not the workflow-step matrix. Examples of utility fan-out:

| Command   | Pattern                         | Worker                                          |
| --------- | ------------------------------- | ----------------------------------------------- |
| slop-scan | Sequential categories           | explore × 9 (single-level only)                 |
| arch-scan | Stack packs + research fallback | none; run stack tools, Context7, and Exa inline |

For `/adv-slop-scan`, all `explore` scanner workers must do the scan inline and must not delegate to additional sub-agents or invoke `/adv-*` slash commands.

For `/adv-arch-scan`, run stack-pack tools, Context7, and Exa inline; do not spawn sub-agents unless the command contract changes.

### Delegation Routing

| Priority | Check                                                                                  | Result             |
| -------- | -------------------------------------------------------------------------------------- | ------------------ |
| 1        | `metadata.delegation_hint` set?                                                        | Use hint value     |
| 2        | `tdd_intent == "not_applicable"`?                                                      | `delegate_allowed` |
| 3        | Title matches `isTrivialTask` patterns?                                                | `delegate_allowed` |
| 4        | Risk signals (multi-file, cross-repo, architectural keywords, failing-test diagnosis)? | `inline_required`  |
| 4.5      | Context-shed test passes? (4-question AND, floor ~5 files or ~50 lines)                | `delegate_allowed` |
| 5        | Default                                                                                | `inline_required`  |

<!-- rq-contextShed01 -->
<!-- rq-contextShed02 -->

Context-Shed Test = all four true + floor met (~5 files OR ~50 lines): decided HOW, HOW does not feed downstream decisions, AC defined, mechanical implementation. Unsure → `inline_required`. After delegation, P23 campsite scan touched scope.

ADV code-writing → `adv-engineer` (not `general`). Verify-burst/non-ADV → `general`.

### Orchestrator-Session Operational Routing

This table is session-level operational routing, distinct from task-level Step 4.5. Use it when primary `adv` is about to do broad authority-free operational work outside a task handoff. Do not run a second primary recon/shell/test/CI-check cycle before delegating when the next step fits one of these rows.

| Trigger | Worker |
| --- | --- |
| >5 file reads/searches expected | `explore` |
| repo structure / dependency map / same-pattern scan | `explore` or `adv-tron` |
| DB/log/status/usage audit | `general` |
| GitHub CI / check-run / status investigation | `general` |
| repeated verify/test bursts | `general` |
| code edits after task scope known | `adv-engineer` |
| frontend/component edits | `adv-designer` |
| docs/source research first-pass | `general`; use `adv-researcher` when sourced architecture authority is needed |

Primary `adv` still owns gate completion, task-graph mutation, checkpoint/archive/sign-off, scope drift, contract compromise, safety, release, and user-facing synthesis. Worker output is evidence, not authority.

### Context Packet Standards

Apply packet includes: WORKING DIRECTORY, CHANGE, TASK, ATTEMPT, AFFECTED FILES, DESIGN EXCERPT, ACCEPTANCE CRITERIA, EXPECTED OUTPUT.

`WORKING DIRECTORY` required. `adv-engineer` passes it as `workdir` to every `bash`, `read`, `write`, `edit`, `morph_edit`, `adv_run_test`. See `.opencode/agents/adv-engineer.md § Working Directory Lock`.

EXPECTED OUTPUT: implement, test, call `adv_subagent_report_submit` with typed `ENGINEER_REPORT` per `.opencode/agents/adv-engineer.md`.

#### ENGINEER_REPORT Payload

Required keys: `schema_version`, `change_id`, `task_id`, `attempt`, `agent`, `scope`, `status`, `files_touched`, `verification`, `decisions`, `blockers`, `follow_ups`, `related_scan`, `workdir_used`, `context_update_for_adv` (`what_ads_needs_to_know`, `suggested_next_action`). `agent` MUST equal `"adv-engineer"`. Schema: `.opencode/agents/adv-engineer.md` § ENGINEER_REPORT Payload.

### Structured Sub-Agent Prompt Protocol

Every sub-agent spawn must include: ROLE:, OUTPUT_SCHEMA:, BUDGET:, STOP_WHEN:. See individual command files for dimension-specific packets.

### Orchestration Token-Budget Policy

When to spawn: 3+ independent scan dimensions. Max parallel workers: 3 (agent-self-enforced; no runtime guard). Batch: spawn 3 → wait → next batch. Cap total sub-agents per command at 6 across batches. Inline for sequential/context-dependent work.

### Phase Summary Pattern

After each phase, `adv_change_update` records compact summaries. Do not duplicate full context; detailed inspection uses `adv_change_show`.

## Sub-Agent Selection

### Agent Tiers

Primary agents: `adv`, `plan`, `build`, `adv-atc` (not spawnable). Spawnable: global `explore`, `general`; bundled global `adv-researcher`, `adv-engineer`, `adv-reviewer`, `adv-designer`; repo-local `adv-tron`. Skill/inline only: `prioritizer` via `skill("prioritizer")`; MCP/infra diagnostics inline. Only `mode: subagent` agents spawn via Task.

### Agent Roster

| Agent            | Use                                                                                                                                                                                                                     |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `explore`        | Code navigation, scoped read-only scans                                                                                                                                                                                 |
| `adv-researcher` | Docs/API/examples research + architecture validation; independent validator                                                                                                                                             |
| `adv-engineer`   | Delegated ADV code-writing (backend/state/API/business logic); must use packet `workdir`; submits typed `ENGINEER_REPORT`                                                                                               |
| `adv-designer`   | Apply-phase frontend/component specialist (HTML/CSS/JS/TSX, a11y, responsive, polish, site-design match); write-only, never review/harden owner; submits typed `DESIGNER_REPORT` per `.opencode/agents/adv-designer.md` |
| `adv-reviewer`   | `/adv-review` and `/adv-harden` analysis/remediation; submits typed report. Reviewer packet carries `FRONTEND DESIGN REVIEW SKILL` anchor for design-inclusive changes                                                  |
| `general`        | Verify bursts + generic multi-step work                                                                                                                                                                                 |
| `adv-tron`       | Recon + hotspots (repo-local)                                                                                                                                                                                           |

`adv-tron` repo-local. `adv-researcher` / `adv-engineer` / `adv-reviewer` / `adv-designer` bundled global via `scripts/deploy-local.sh`. Research pattern: `adv-researcher` covers docs/API/examples + architecture in a single spawn. Apply routing: `metadata.frontend == "true"` → `adv-designer` (Priority 1.5 in `/adv-apply` delegation routing table; `metadata.delegation_hint` at Priority 1 remains explicit user override).

## Skill Discovery Protocol

Enabled in `/adv-research`. Filesystem-only, no API calls.

| Step    | Action                                                                                       |
| ------- | -------------------------------------------------------------------------------------------- |
| Search  | Trusted skill dirs only: `~/.config/opencode/skills/*/SKILL.md`, repo `skills/*/SKILL.md`    |
| Match   | Read YAML frontmatter, match `keywords` against tech stack + change domain                   |
| Load    | `skill("{name}")` → apply guidance                                                           |
| Trust   | × Never auto-load arbitrary `*/SKILL.md` outside trusted dirs without explicit user approval |
| Degrade | Skip skills without frontmatter/`keywords`; no matches → proceed normally                    |

Skill metadata: YAML frontmatter with `name`, `description`, `keywords`.

<!-- rq-domainContext01 -->

**Domain context artifacts:** Projects MAY maintain root `CONTEXT.md` or `CONTEXT-MAP.md` + per-context `CONTEXT.md` as domain glossary. `/adv-discover`, `/adv-design`, `/adv-clarify` MAY read for domain-language alignment. Lazy creation; advisory only. See `.adv/specs/domain-context/`.

### Excluded Skills

Pocock overlap skills remain excluded from ADV skill selection:

| Skill             | Rationale                                                                        |
| ----------------- | -------------------------------------------------------------------------------- |
| `grill-me`        | Superseded by `/adv-clarify`; ADV owns clarification gates.                      |
| `grill-with-docs` | Reference docs vendored into `domain-context`; workflow overlap excluded.        |
| `to-prd`          | Superseded by `/adv-proposal`; proposal gate owns problem/criteria contract.     |
| `to-issues`       | Superseded by `/adv-triage`; GH issue promotion stays HITL-governed.             |
| `triage`          | Superseded by `/adv-triage`; WSJF + ROADMAP mirror already gate-aware.           |
| `tdd`             | Superseded by RSTC TDD Protocol; task metadata and verification own correctness. |

## Skill Creation Protocol

Enabled in `/adv-discover` and `/adv-research`. Conservative — only triggers for the change's core problem domain.

### Trigger Conditions (ALL must be true)

| #   | Condition                                                                    |
| --- | ---------------------------------------------------------------------------- |
| 1   | No matching skill found for a domain                                         |
| 2   | Domain is clearly relevant to the change's **core problem** (not tangential) |
| 3   | No partial-skill match covers the domain                                     |

### Naming Convention

`agent-{domain-slug}` (lowercased, hyphenated). **× MUST NOT use `adv-` prefix** — `scripts/deploy-local.sh` removes stale `adv-*` skills from global dir.

### Assembly Template

Create `agent-{domain}/SKILL.md` with YAML `name`, `description`, `keywords`, `metadata.source: "agent-created"`, `review_status: "pending"`, `created_at`, `trigger_change`, then Purpose / Key Patterns / Common Pitfalls / Sources.

### Creation Flow

1. **Research domain** — Context7, Exa, searchcode (`searchcode_code_search`) → gather domain-specific guidance. Use Exa to discover candidate repositories, then searchcode to inspect code inside each public repo.
2. **Assemble** — populate template with research findings, include source citations
3. **Persist** — write atomically to `~/.config/opencode/skills/agent-{domain}/SKILL.md`
4. **Skip if exists** — if file already exists, report "skill already exists" and skip
5. **Load** — call `skill("agent-{domain}")` and apply guidance in current workflow
6. **Notify** — emit `[ADV:SKILL_CREATED]` with skill name, domain, and brief description

### Pending Review

Auto-created skills set `metadata.review_status: "pending"`. Next `/adv-discover`:

| Step    | Action                                                         |
| ------- | -------------------------------------------------------------- |
| Scan    | Skills with `review_status: "pending"` BEFORE keyword matching |
| Surface | Present pending skills to user for confirmation                |
| Confirm | Update `review_status` to `"reviewed"`                         |
| Reject  | Delete the skill file                                          |

### Protocol Extension Note

When all trigger conditions are true, "no matches" → conditional creation trigger. Non-implementing agents report gap and proceed.

## Command vs Skill Boundaries

<!-- rq-skillProseCompression01 rq-skillClassification01 -->

Commands own workflow/state, user-facing invocation, mutation, gate completion. Skills hold reusable read-only methodology, domain knowledge, and command/sub-agent-loaded protocol.

### Load-site taxonomy

| Load site                   | Meaning / fallback                                                                                                         |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `orchestrator-only`         | Main command loads skill for checkpoints/routing/gates; command embeds fallback.                                           |
| `worker-only`               | Worker loads methodology for self-contained work; orchestrator defines degraded/inconclusive handling before spawn.        |
| `split`                     | Orchestrator owns schema/routing/fallback/adoption/mutation; worker gets methodology detail; no auto-adopt beyond routing. |
| `inlined-agent-methodology` | Agent prompt carries methodology; skill mirrors/documents sync; command fallback remains and no extra worker delegation.   |

Worker skill-load availability is permissive: guard explicit `skill: false`, not missing `skill: true`; missing exposure degrades via command fallback.

### Reference Pattern

`adv-tron` pattern: command owns orchestration/state/user interaction; skill owns protocol/search/report schema; command embeds fallback. Fan-out commands load skill before spawning and keep inline fallback is required.

### Classification

| Class                                 | Commands                                                                                                                                                                                        | Load site                   |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| Command-only                          | `adv-idea`, `adv-problem`, `adv-proposal`, `adv-research`, `adv-task`, `adv-validate`, `adv-archive`, `adv-status`                                                                              | —                           |
| Dedicated skill                       | `adv-triage` → `adv-triage`; `adv-reflect` → `adv-reflect`; `adv-cleanup` → `adv-cleanup`; `adv-improve` → `adv-improve`; `adv-clarify` → `adv-clarify`; `adv-arch-scan` → `adv-arch-detection` | `orchestrator-only`         |
| Dedicated skill with worker execution | `adv-audit` → `adv-audit`; `adv-refactor` → `adv-refactor`                                                                                                                                      | `split`                     |
| Scout skill                           | `adv-discover`, `adv-design` → `adv-opportunity-scout`                                                                                                                                          | `split`                     |
| User comparison skill                 | `adv-design` → `adv-user-intuit`                                                                                                                                                                | `orchestrator-only`         |
| Shared skill                          | `adv-harden`, `adv-slop-scan` → `adv-slop-detection`                                                                                                                                            | `split`                     |
| Dedicated agent + skill               | `adv-tron` → `adv-tron`                                                                                                                                                                         | `inlined-agent-methodology` |
| Embedded methodology                  | `adv-discover`, `adv-prep`, `adv-apply`, `adv-review`; `adv-harden` keeps embedded harden guidance alongside shared `adv-slop-detection` scanner methodology                                    | —                           |
| Dynamic discovery                     | `adv-discover`, `adv-research` (`skill("agent-{domain}")` placeholder only)                                                                                                                     | `orchestrator-only`         |

> **Stale-reference note:** `adv-review-methodology`, `adv-harden-methodology`, and `global-verify` are not shipped command skills. Calls to `skill("adv-review-methodology")`, `skill("adv-apply-methodology")`, or `skill("global-verify")` are stale/hallucinated command references — use the command's embedded protocol instead. `prioritizer` remains an optional inline skill/protocol outside command skill loading; command files use the embedded Tradeoff Prioritizer Protocol instead of a command-level `skill("prioritizer")` reference.

### Constraints

- Skills × MUST NOT mutate ADV state (no `adv_change_create`, `adv_task_add`, `adv_gate_complete`).
- Skills × MUST NOT own gate completion or workflow sequencing.
- Commands MUST remain functional if a backing skill is unavailable — inline fallback is required.
- Checklist docs (`docs/checklists/`) are maintainer/reference docs only. Runtime command guidance MUST use embedded methodology or loaded skills, not source/install-tree checklist reads. <!-- rq-noSourceChecklistReads01 -->

## Worktree Integration

ADV uses external mutable state shared by worktrees. Specs stay in repo (`.adv/specs/`). `db_dir` / physical `db/` dirs are legacy only.

### External State

State: `$XDG_DATA_HOME/opencode/plugins/advance/{project-id}/` (`changes/`, `archive/`, `wisdom.jsonl`, `reflections.jsonl`, `agenda.jsonl`). Worktrees: `$XDG_DATA_HOME/opencode/worktree/{project-id}/{branch}`. Cleanup deletion requires approval.

### Worktree Policy

ADV always isolates mutating work in per-change worktrees.

- Every change runs in a worktree — create/reuse before Phase 1
- Worktree tools unavailable → hard block with error. Do not proceed in-place
- Existing worktree for same change → auto-reuse
- trunk write firewall enforcement is default-on (`worktree_guard_enforce=true` or omitted). Blocks main-checkout file writes, destructive bash, and task/gate execution mutations with `WorktreeIsolationViolation`, `mainCheckoutPath`, remediation. Use `adv_worktree_resume` path. Legacy explicit opt-out: only `worktree_guard_enforce: false` allows default-checkout file writes; omitted never opts out. Proposal gate remains exempt. Read-only tools + git commands allowed. Auto-managed changes engage guard regardless of global flag. Existing-worktree exception: a setup-ready ADV worktree for the change ALLOWs gate/task state-transition mutations from main regardless of the `worktree_auto_managed` marker (durable `worktrees` map is the structural authority); file-write isolation unchanged. Advance repo opts into strict mode.

### Worktree Reuse

Before creating: `git worktree list --porcelain` → find `change/{change-id}`. Path exists → reuse; missing → `git worktree prune` → fresh.

### Worktree Setup Hooks

Setup lives in `.opencode/worktree.jsonc`. `sync.copyFiles` copies explicit opt-in files. `hooks.postCreate` runs after creation; failure marks worktree `setup_failed` and blocks ADV routing until fixed. `hooks.preDelete` runs before deletion. See `docs/worktree-guide.md` for examples + secret handling.

### Spec Divergence

| Data                             | Location             | Shared?                   |
| -------------------------------- | -------------------- | ------------------------- |
| Specs (`.adv/specs/`)            | In-repo, git-tracked | No (branch-local)         |
| Changes, archive, wisdom, agenda | External             | Yes (keyed by project-id) |

Spec changes in worktree A invisible to B until merged; merge promptly after archive.

### Worktree Protocol

`adv_worktree_create` default `mode: "warp"`: create/reuse git worktree → register OpenCode `adv-worktree` workspace → warp current session so later tools run at worktree root. Requires `OPENCODE_EXPERIMENTAL_WORKSPACES=true` (or `OPENCODE_EXPERIMENTAL=true`) before launch. ADV does not mutate `process.env`. If flag or `/experimental/workspace` unavailable → downgrade to `mode: "terminal"` with actionable warning. Already warped session → `SESSION_ALREADY_WARPED`; open fresh OpenCode session from trunk to create another worktree.

Side effect: `OPENCODE_EXPERIMENTAL_WORKSPACES=true` also changes OpenCode `client.session.list` filtering: same-project cross-workspace sessions included by default. ADV does not rely on this. No graduation timeline published; env-var opt-in is current mechanism.

Fallback modes: `mode: "terminal"` returns path; MUST use as `workdir` for all later tools. `mode: "spawn"` returns path for follow-up launch. Delete via `adv_worktree_delete branch:<branch>` only after merge. Worktree cleanup uses canonical tool `adv_worktree_delete`. Warp-mode delete attempts matching OpenCode workspace-row removal before git worktree removal; warns and continues if workspace cleanup fails.

### Worktree Cleanup

`/adv-archive` Phase 9 owns structural git finalization: validate change worktree → commit `.adv/` archive/spec artifacts → detect default branch → prove no-remote local merge, post-fetch `origin/{default-branch}` reachability, or merged PR state. Remote-backed protected/policy routes use PR + GitHub auto-merge: `Pending auto-merge.` leaves release/archive incomplete until PR state is `MERGED`; `Blocked.` leaves the change active when PR/auto-merge or origin proof is unavailable. `adv_gate_complete gateId: "release"`, `phase9:"skip"`, and release recovery all revalidate the same proof (`rq-releaseFinalization01`). `adv_archive_repair` scans/re-drives archived-but-unmerged remote `change/*` branches through idempotent PR auto-merge without force-push. × Never delete worktree with unmerged commits. Tools unavailable → `[ADV:BLOCKED] Worktree tools unavailable — hard block with error. Do not proceed in-place.`

## When to Use ADV

**Use for:** New features, breaking changes, architecture, compliance, unclear bug fixes via `/adv-problem`
**Use lighter workflows for:** Typos, deps, exploration

### Provider ADV runtime hints

<!-- rq-scopedAdvInstructions01 --> `scripts/deploy-local.sh` writes one global `adv` runtime agent from lean canonical `.opencode/agents/adv.md`. `ADV_INSTRUCTIONS.md` remains full repo/dev reference; not appended wholesale into runtime `adv.md`. Runtime coverage: `docs/adv-runtime-protocol-coverage.md`, specs, tests, command contracts. Provider-specific guidance injects at runtime through single system block when provider/model identity known. Retired `adv-{provider}` generated agents not recreated; stale config needs manual cleanup.
