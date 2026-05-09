# ADV - Spec-Driven Development Instructions

Specs = laws. Requirements formal, validated, enforced.

## Notation

`→` sequence · `←` blocked by · `✓` complete · `○` pending · `×` forbidden · `⚠` attention

### Instruction Compression Guard

Use `docs/command-voice-standard.md` prose-load templates + terse/caveman-lite. Preserve exact contract tokens: tool names, gate IDs, statuses, slash commands, enum values, quoted errors, `MUST`, `NEVER`, approval checkpoints, cancellation approval, archive sign-off, JSON/code examples.

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

Planning gate is machine-enforced by `adv_gate_complete userApproved:true`; other HITL boundaries are agent-enforced by command docs.

| Phase | Mode | Detail |
|---|---|---|
| `/adv-idea` | Collaborative | idea loop before proposal |
| `/adv-problem` | Collaborative | issue triage before fix path |
| `/adv-proposal` | Collaborative | approve at end |
| `/adv-research` | Collaborative | approve at end |
| `/adv-prep` | HITL hard gate | vision/task graph → explicit approval → `userApproved:true` |
| `/adv-apply` | Autonomous | starts after prep; escalate only failure |
| `/adv-review` | Autonomous + drift | auto-fix in scope; stop on drift |
| `/adv-harden` | Autonomous + drift | auto-fix scoped issues; stop on drift |
| `/adv-archive` | Autonomous | spec deltas, wisdom, git finalize |
| `/adv-atc` | Autonomous + HITL-defer | defer HITL to GH comments; auto-transition when safe; stop on interrupts |

### Drift Detection Rule

Before review/harden auto-fix ask: would proposal **Success Criteria**, **Acceptance Criteria**, or **Out-of-Scope** need change?

| Answer | Action |
|---|---|
| YES | STOP → `question` (`[ADV:ATTN]`) |
| NO | Auto-remediate in scope |

### Prep Gate Machine Enforcement

`adv_gate_complete gateId:'planning'` requires `userApproved:true`; no other HITL gate machine-enforced.

### Human Checkpoints (Pause Required)

Pause ONLY for: proposal confirmation; agreement sign-off; design approval when user-value tradeoff, validator `CONFLICT`, or rq-designval04 risk; prep approval; acceptance; archive sign-off; cancellation approval; doom-loop recovery.

Approval surface: checkpoints use inline handoff text per `docs/command-voice-standard.md` § Inline Approval Voice, NOT `question` (`rq-inlineApproval01`). Doom-loop uses `question`.

| Tier | Checkpoints | Parser |
|---|---|---|
| A reversible | proposal, agreement, design, prep, acceptance | whitelist + LLM fallback |
| B irreversible | archive sign-off, cancellation | whitelist-only; NO LLM fallback |

Archive sign-off executes inline on whitelist match; no confirmation echo.

### Post-Approval Auto-Continue

Tier A whitelist (`continue`, `go`, `approve`, `yes`, `ok`, `proceed`, `accept`, `lgtm`, etc.) → next phase inline immediately. No second prompt. Exact shown `/adv-X {id}` reply is approval; OpenCode may dispatch fresh session.

### Between-Checkpoint Flow

Pause only for: doom-loop, drift, contract-compromise risk, design validator `CONFLICT`, prep `userApproved` enforcement. No other “continue?” prompts.

## Phase Goals

Self-check phase goal (`manifest.ts phaseGoal`): am I still serving current phase?

| Phase | Goal |
|---|---|
| `/adv-proposal` | clarify what/why, criteria, constraints; no how |
| `/adv-research` | researched plan ready for approval; validate how |
| `/adv-discover` | evidence, agreement, objectives, AC before design |
| `/adv-design` | validated implementation strategy ready for prep |
| `/adv-prep` | close gaps, map deps, tasks ready for autonomous work |
| `/adv-apply` | execute approved plan; add in-scope discovered tasks; escalate only failure |
| `/adv-review` | verify plan match; auto-fix in scope; stop drift |
| `/adv-harden` | production-readiness; auto-fix scoped issues; stop drift |
| `/adv-archive` | promote contract to law; specs/wisdom/cleanup |
| `/adv-atc` | autonomous roadmap pipeline; defer HITL to GH; preserve safety |
| `/adv-reflect` | durable two-plane learning report |


## Commands

### Core Workflow

| Command                     | Purpose                                                                             |
| --------------------------- | ----------------------------------------------------------------------------------- |
| `/adv-idea`                 | Explore rough ideas before drafting a proposal                                      |
| `/adv-problem`              | Triage issues before fixing or drafting a proposal                                  |
| `/adv-status`               | Show operational health: in-flight changes, Temporal, worktrees, session debt       |
| `/adv-roadmap`              | Show prioritized backlog with active-change cross-reference                         |
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
| `/adv-atc [target]`   | Execute autonomous ROADMAP pipeline, deferring HITL to GitHub issues, stop only on safety boundaries |
| `/adv-refactor [change-id]` | Refresh a stale proposal or batch-refresh the oldest 30% of active changes                      |
| `/adv-cleanup`              | Triage stale, abandoned, duplicate, and ready-to-archive active changes                         |
| `/adv-triage`               | Triage all backlog sources, score features with WSJF, regenerate ROADMAP.md                     |
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
- Deployment is outside ADV's gate lifecycle — ADV stops at push. Post-release deploy is a separate, user-initiated step
- Commands that own boundary-sensitive workflow steps should include `## Command Boundary` details

## Status Markers

Emit at START of each response:

| Marker | When | Emoji |
|---|---|---|
| `[ADV:WORK]` | active work | 🟩 |
| `[ADV:TOOLING]` | tool/sub-agent running | 🟨 |
| `[ADV:ATTN]` | user needed | 🟥 |
| `[ADV:IDLE]` | idle/finished | ⬜ |
| `[ADV:BLOCKED]` | doom-loop/stuck/crash | 🟥💀 |
| `[ADV:TASK_STATUS_REPORT]` | task report | — |
| `[ADV:SKILL_CREATED]` | skill persisted | 🟦 |
| `[ADV:REFLECTION]` | reflection | 🟪 |
| `[ADV:PEER_SESSIONS]` | peer sessions info | ⬜ |

Tab title: `<emoji> <shortname> · <normalized change>` when active, else `<emoji> <shortname>`. System markers: `[ADV:ACCUMULATED_WISDOM]`, `[ADV:TODO_CONTINUATION]`, `[ADV:RECORD_WISDOM]`.

### Context Snapshot

`_contextSnapshot`: compact change/title, gates, task counts, current task, workdir. Mutation/ticker tools emit it; `adv_change_show include:{ snapshot:true }` returns it. Cross-repo switch via `formatCrossRepoSwitch()`.

## Critical Protocols

### MCP Tool Name Contract

MCP names exact. Valid examples: `context7_resolve-library-id`, `context7_query-docs`, `kagi_kagi_search_fetch`, `kagi_kagi_summarizer`, `gh_grep_searchGitHub`, `firecrawl_firecrawl_scrape`, `vision_vision_list`, `lgrep_search_semantic`. Invalid: `*_query_docs`, `kagi_search_fetch`, `vision_list`. If name fails, copy exact schema name; retry once max.

### Structural Correctness (P33)

Make correctness structural before heuristic. Prefer machine-checkable types/schemas/parsers/state machines/invariants/contracts/DB constraints/generated validators/tests. Normalize untrusted input before processing.

| Area | Structural source of truth | Heuristic allowed only for |
|---|---|---|
| Gate completion | `adv_gate_status`, `adv_gate_complete`, tasks, validation tools | missing-context discovery |
| Task classification | `metadata.tdd_intent`, validator schema | legacy fallback/warnings |
| Backlog triage | stable refs, issue IDs, typed project fields, explicit user assignments | ranking/kind/duplicate hints |
| Spec compliance | specs, validators, conformance verdicts | research leads/advisory risks |

Heuristics may assist discovery/ranking/triage/advice only. MUST NOT own correctness/security/persistence/workflow state/gates/spec compliance. If unavoidable: isolate, document assumptions, deterministic guardrails, edge/property tests.

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
- `adv_temporal_diagnose` — peer count, worker-lock holder PID, change workflow presence

**Known OpenCode-core race (out of ADV's layer):** OpenCode's snapshot service is keyed on `projectID`, not on worktree path. Two sessions on the same project — even in different worktrees — race on `~/.local/share/opencode/snapshot/{projectID}/{sha}/index.lock` and lose between-turn snapshots with `exitCode=128 ... 'index.lock': File exists`. ADV's task-checkpoint commits (separate git ops in the worktree) are unaffected, but OpenCode's snapshot history develops gaps. Tracked at [Sharper-Flow/Opencode-Advance#1](https://github.com/Sharper-Flow/Opencode-Advance/issues/1) — fix is oca/OpenCode-core, not ADV. The "Multi-session is the supported design center" claim above applies to **ADV state and per-worktree git**, not to OpenCode's snapshot subsystem.

### ADV MCP Tool Invocation

× NEVER call ADV tools with `{}`/empty args. Pass required args explicitly.

- `adv_change_update`: `changeId` + one of `proposal|problemStatement|agreement|design`; confirm target first. Zero-arg → `ToolExecutionTimeout`.
- `adv_task_add`: call `adv_task_list` before `blockedBy`; IDs must exist. Set `metadata.tdd_intent` when not `inline`: `separate_verification` or `not_applicable`.
- `adv_task_cancel`: same-change valid IDs only; atomic; verify via `adv_task_list`.
- `adv_change_archive`: from worktree pass `worktreePath:<worktree-root>` or archive bundle lands in main checkout.
- `adv_run_test`: pass `timeoutMs` (`1000..300000`) for slow commands; default `30000` may timeout.
- `adv_gate_complete`: planning requires `userApproved:true`; others accept flag but do not enforce.
- Tool `describe()` lists relational constraints; read before constructing calls.

### Question Tool UX

P26 write-in required. Use 2–5 concise options + contextual write-in. Leave custom input enabled.
Question tool only for non-checkpoint structured choices: change-id/disambiguation, doom-loop, review/harden drift, `/adv-discover` AC clarification, `/adv-idea`/`/adv-problem`/`/adv-clarify` triage. Human checkpoints use inline approval voice (`rq-inlineApproval01`).

### Tradeoff Prioritizer Protocol

2+ viable approaches + user values decide winner → prioritize before asking. Default: scan code → research tradeoffs → draft criteria → `question` → restate priorities → recommend. Optional: `skill("prioritizer")`. Skip bug fixes, mechanical work, security/API/architecture-constrained choices.

### Context Freshness

Phase start once: prefer `adv_change_show changeId:<id> include:{ snapshot:true, readyTasks:true }` to replace `adv_change_show + adv_gate_status + adv_task_ready` where enough.

| Flag | Field |
|---|---|
| `include.snapshot:true` | `_contextSnapshot` |
| `include.readyTasks:true` | `_readyTasks`, `_readyTasksMeta` |
| `include.readyTasksLimit:N` | top-N ready tasks (`1..50`) |

Per task: `adv_task_show`; do NOT call `adv_change_show` before every task. TodoWrite: task IDs only (`tk-abc123`).

### TDD Protocol (RSTC)

Inline TDD default; red/green within each task. × No separate test task for same scope.

- RED: write failing test (`edit`/`write`/`morph_edit`) → `adv_run_test phase:'red'` → failure evidence
- GREEN: implement → `adv_run_test phase:'green'` → pass evidence; retry on fail
- Trivial docs/config: note reason, skip TDD
- Cross-cutting verify task OK: `metadata.tdd_intent:"separate_verification"`

`adv_run_test` gives durable proof; final verification goes in task completion evidence.

### Reflection Protocol

Every archive runs `adv_reflect`: Plane 1 project execution; Plane 2 system friction. Informational only; persisted in `reflections.jsonl`; retrieve via `adv_change_show`.

### Task Checkpoint Commits

Every `/adv-apply` task with file changes MUST `adv_task_checkpoint` before `status:'done'`; cancellations checkpoint before `status:'cancelled'`. Enforcement at apply seam, not `adv_task_update`.

Apply loop: start → clean baseline HEAD/branch → RED → GREEN → verify → `adv_task_checkpoint` → `adv_task_update done`.

Failures: `SEMANTIC` diagnose/rerun; `ENVIRONMENTAL` escalate via `question`; `TRANSIENT` retried internally then semantic.

Commit format: subject `task(tk-xxxx): completed` or `task(tk-xxxx): cancel — <reason>`; trailers `Change`, `Task`, `Mode`, `Verification`. Stage `git add -A`.

Anti-patterns: no git inside Temporal; no `--allow-empty`; no checkpoint bypass for small tasks; no push/merge/archive/amend/force-push from checkpoint. Publication remains human-gated.

### Doom Loop Detection

Done = AC met. Doom-loop = 3 failed attempts. Environmental = missing dependency. After 3 failures: STOP → `[ADV:BLOCKED]` → document attempts with `strategy_label` → ask via `question`. Try different strategy; no silent retries.

### External Conformance

Black-box AC verification by external CI. Locked conformance source is unreadable after first archive.

`adv_conformance`: `status|init|lock|unlock|override|run`; `run` reads CI verdict artifact and returns `PASS|DRIFT` + failed rq list.

| Mode | Path | Isolation |
|---|---|---|
| `subfolder` | `.adv/specs/_conformance/` | in-repo honor-system |
| `sibling` | `{parent}/advance-conformance-{pid}/` | external repo guard-enforced |

Archive Phase 5.5 runs conformance. `DRIFT` halts; options: fix locally / override / unlock. No auto-fix. Unlock/override requires `{user, reason, re_verify_deadline}` audit.

<!-- rq-twf01 --> Enforcement: conformance bash guard blocks clone/curl/wget on locked sibling paths; `adv_conformance` blocked during execution gate; path policy blocks read/glob/grep/lgrep; trunk write firewall blocks default-branch direct writes.

### Trunk Write Firewall

`tool.execute.before` blocks writes via `write`/`edit`/`morph_edit` and obvious destructive shell patterns (`>`/`>>`, `tee`, `sed -i`, `cp`, `mv`, `rm`) on default-branch trunk. Worktrees/outside repos/git recovery states allowed. Git ops not classified. Residual risk: shell indirection/aliases/script-internal writes; still forbidden intentionally.

### Cross-Repo Execution

“Out of scope/different repo/cannot modify external code” invalid cancellation reason. Switch `workdir` to task `target_repo`/`target_path`; if metadata missing, confirm via `question`. `related_repos` in `project.json`. Review/Harden block on incomplete/cancelled cross-repo tasks without approval.

### Change Origin Linkage Strategy

ADV change ≠ GH issue. ADV change = Temporal workflow state; GH issue = public registered intent. Link, don’t merge concepts.

| Kind | When | Issue | Archive auto-close |
|---|---|---|---|
| `roadmap` | GH Project/ROADMAP via `/adv-roadmap` → `/adv-proposal` | upstream; `origin.issue_number` required | yes later |
| `discovery` | mid-session bug/drive-by/`/adv-improve` | optional post-hoc | no |
| `triage` | `/adv-triage` promotes artifact | created by triage; issue set | yes |
| `adhoc` | explicit no-upstream | never | never |

Primitive: `change.origin = { kind, issue_number?, source_artifact? }`; legacy → `adhoc`.

Source split: ranked backlog = GH Project v2 + `ROADMAP.md`; in-flight ADV = Temporal + projection; linkage = `change.origin`. Schema shipped; behavior automation is follow-up. × Don’t short-circuit.

Anti-patterns: don’t auto-create GH issue for every proposal; don’t use `linked_issues[]` as canonical; don’t move backlog into Temporal; don’t default new changes to `roadmap` without `issue_number`.

Agent create mapping: roadmap rec → `roadmap` + `origin_issue_number`; mid-session bug → `discovery`; triage promotion → `triage` + artifact + issue; no upstream → `adhoc` or omit. Uncertain? Omit.

### Cross-Project Coordination

Use for ADV-enabled target via `target_path`. Reads = snapshot-ok; mutations = Temporal queue required. Untrusted mutation needs `target_confirmed:true` + `confirmationEvidence`. Never direct state files. `cross_project_links` provenance; `external_dependencies` advisory only. Inspect `_externalDependencyStatus`.

#### `target_path` matrix (which tools support cross-project)

Tools with `target_path` (read or mutation) accept the optional path argument and route through `resolveTargetProject` / `withTargetPathStore`. Tools NOT in the table operate on the current process project only.

| Tool                                                                                      | Mode                            | Notes                                                                              |
| ----------------------------------------------------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------- |
| `adv_change_show`, `adv_change_list`, `adv_change_validate`                               | snapshot-ok                     | Read-only; no `target_confirmed` needed                                            |
| `adv_status`                                                                              | snapshot-ok                     | Read-only; cross-project disk-snapshot view                                        |
| `adv_task_show`, `adv_task_list`, `adv_task_ready`                                        | snapshot-ok                     | Read-only                                                                          |
| `adv_change_update`, `adv_change_create`                                                  | temporal-required               | Mutation; `target_confirmed: true` + `confirmationEvidence` required for untrusted |
| `adv_change_archive`, `adv_change_close`, `adv_change_bulk_close`                         | temporal-required               | Mutation                                                                           |
| `adv_task_update`, `adv_task_cancel`, `adv_task_add`                                      | temporal-required               | Mutation                                                                           |
| `adv_gate_status`, `adv_gate_complete`                                                    | temporal-required               | Read-status / mutation                                                             |
| `adv_temporal_reconnect`                                                                  | temporal-required               | Mutation                                                                           |
| `adv_run_test`                                                                            | temporal-required               | Mutation (records evidence)                                                        |

Tools without `target_path` (current-project only): `adv_temporal_register_search_attributes`, `adv_temporal_worker_restart`, `adv_reflect`, `adv_conformance`, `adv_agenda_*`, `adv_wisdom_*`, `adv_project_metadata`, `adv_project_context`.

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
or task count alone.

| × Bad                                     | ✓ Good                                                   |
| ----------------------------------------- | -------------------------------------------------------- |
| "This seems large, want to split?"        | Trust the prep gate; execute                             |
| "Maybe break this into smaller changes?"  | Execute as planned                                       |
| Mid-execution split-suggestion            | Mid-execution scope discovery → scope-discovery protocol |

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

<!-- rq-gatemodel01 --> Gate order: `proposal` (`/adv-proposal`) → `discovery` (`/adv-discover`/research) → `design` (`/adv-design`) → `planning` (`/adv-prep`) → `execution` (`/adv-apply`) → `acceptance` (`/adv-review` + user) → `release` (`/adv-harden` + `/adv-archive`). Sequential; archive blocks until release ready. See `docs/adv-gates.md`.

Post-release deploy is outside ADV; ADV stops at push.

<!-- rq-extConfGate01 --> Conformance enabled: `/adv-archive` Phase 5.5 runs external CI check after sign-off, before execute archive. `DRIFT` halts with user options; no auto-resolve.

Gate behavior: discovery/planning validate full change incl completed work; acceptance emits `REVIEW_FINDINGS` and records user acceptance; release runs harden/archive/git/worktree cleanup/reflection.

## Command Execution Model

Commands run inline by default. Agents without `task` run inline only.

### Slash Command Boundary

Slash commands are user/session entry points, not internal dispatch. Agents MUST NOT invoke `/adv-*` inside workflows/sub-agent prompts. If ADV workflow needed, execute inline with tools/read command contract.

### Sub-Agent Orchestration (optional, requires `task` tool)

Use for 3+ independent scan dimensions. Single-level only. Cap `MAX_PARALLEL_SUBAGENTS` = 3; batch work; no spawn for single-tool-call work. `/adv-research` and `/adv-slop-scan` workers research/scan inline; no delegation or `/adv-*`.

| Command | Inline | Sub-Agent |
|---|---|---|
| research/task | Context7 + Kagi + lgrep | librarian + adv-researcher |
| review/harden/audit/slop-scan/refactor | sequential scans | explore/general per command docs |
| slop-scan | sequential categories | explore × 9 max, single-level |
| tron | lgrep + read | adv-tron |

Design gate requires independent `adv-researcher` validator before completion. Verdicts: VALIDATED, CAUTION, CONFLICT, INCONCLUSIVE.
Inline-only: `/adv-status`, `/adv-idea`, `/adv-problem`, `/adv-proposal`, `/adv-validate`, `/adv-archive`, `/adv-clarify`, `/adv-prep`, `/adv-cleanup`, `/adv-improve`.

### Delegation Routing

| Priority | Check | Result |
|---|---|---|
| 1 | `metadata.delegation_hint` | use hint |
| 2 | `tdd_intent == "not_applicable"` | `delegate_allowed` |
| 3 | trivial title pattern | `delegate_allowed` |
| 4 | risk: multi-file/cross-repo/architecture/failing-test diagnosis | `inline_required` |
| 4.5 | context-shed true + floor ~5 files or ~50 lines | `delegate_allowed` |
| 5 | default | `inline_required` |

<!-- rq-contextShed01 --><!-- rq-contextShed02 --> Context-shed = decided HOW + HOW not downstream + AC defined + mechanical. Unsure → `inline_required`. After delegation, P23 related/touched-scope scan.
ADV code-writing → `adv-engineer`; verify burst/non-ADV → `general`.

### Context Packet Standards

Apply packet: WORKING DIRECTORY, CHANGE, TASK, AFFECTED FILES, DESIGN EXCERPT, ACCEPTANCE CRITERIA, EXPECTED OUTPUT. `adv-engineer` must use packet workdir for every `bash/read/write/edit/morph_edit/adv_run_test`. Output fenced `ENGINEER_REPORT` JSON.

#### ENGINEER_REPORT Payload

Required keys: `schema_version`, `change_id`, `task_id`, `agent`, `scope`, `status`, `files_touched`, `verification`, `decisions`, `blockers`, `follow_ups`, `related_scan`, `workdir_used`, `context_update_for_adv` (`what_ads_needs_to_know`, `suggested_next_action`). `agent` MUST equal `"adv-engineer"`.

### Structured Sub-Agent Prompt Protocol

Every spawn includes: ROLE, OUTPUT_SCHEMA, BUDGET, STOP_WHEN.

### Orchestration Token-Budget Policy

Spawn for 3+ independent dimensions; max 3 parallel; cap 6 total/command. Inline sequential/context-dependent work.

### Phase Summary Pattern

After each phase, `adv_change_update` compact summaries; no full-context duplication.

## Sub-Agent Selection

| Tier | Agents | Loading |
|---|---|---|
| Primary | `adv`, `plan`, `build` | global |
| Common subagents | `explore`, `general`, `librarian`, `mechanic`, `prioritizer` | global |
| ADV specialists | `adv-researcher`, `adv-engineer` | bundled global |
| Repo-local | `adv-tron` | `.opencode/agents/` |

Only `mode: subagent` spawn via Task. `adv`/`plan`/`build` are primary.

| Agent | Use |
|---|---|
| `librarian` | docs/API/examples |
| `adv-researcher` | architecture validation |
| `explore` | code navigation |
| `adv-engineer` | delegated ADV code-writing; packet workdir |
| `general` | verify bursts/generic work |
| `mechanic` | MCP/config/ADV diagnostics |
| `adv-tron` | recon/hotspots |

`adv-tron` repo-local. `adv-researcher`/`adv-engineer` bundled by `scripts/sync-global.sh`. Pattern: `librarian` + `adv-researcher` parallel → synthesize.

## Skill Discovery Protocol

Enabled in `/adv-research`; filesystem-only. Search trusted dirs only: `~/.config/opencode/skills/*/SKILL.md`, repo `skills/*/SKILL.md`. Read YAML frontmatter; match `keywords` to stack/domain; load via `skill("{name}")`. × Never auto-load arbitrary `*/SKILL.md` outside trusted dirs. Skip malformed/no-keyword skills.

## Skill Creation Protocol

Enabled in `/adv-discover` and `/adv-research`; conservative; core problem domain only.

Trigger iff: no matching skill; domain clearly core; no partial skill covers it. Name `agent-{domain-slug}`; × MUST NOT use `adv-` prefix.

Create `agent-{domain}/SKILL.md` with YAML `name`, `description`, `keywords`, `metadata.source:"agent-created"`, `review_status:"pending"`, `created_at`, `trigger_change`, then Purpose/Key Patterns/Common Pitfalls/Sources. Research via Context7/Kagi/`gh_grep_searchGitHub`; cite sources; skip if exists; load skill; emit `[ADV:SKILL_CREATED]`.

Pending review: next `/adv-discover` scans `review_status:"pending"`; user confirms → `reviewed`, rejects → delete. Non-implementing agents report gap and proceed.

## Command vs Skill Boundaries

Commands own workflow/state/gates; skills are read-only methodology. Skills MUST NOT mutate ADV state or own gate completion. Commands need inline fallback if skill missing. Checklist docs canonical.

| Class | Commands |
|---|---|
| Command-only | `adv-idea`, `adv-problem`, `adv-proposal`, `adv-research`, `adv-task`, `adv-validate`, `adv-archive`, `adv-status`, `adv-cleanup`, `adv-clarify`, `adv-refactor`, `adv-improve`, `adv-design`, `adv-audit` |
| Dedicated skill | `adv-tron` → `adv-tron` |
| Shared skill | `adv-harden`, `adv-slop-scan` → `adv-slop-detection` |
| Embedded methodology | `adv-discover`, `adv-review` |
| Dynamic discovery | `adv-discover`, `adv-research` |

Stale refs: `adv-review-methodology`, `adv-harden-methodology`, `adv-apply-methodology` were inlined/deleted. Read command Phase 0 instead.

## Worktree Integration

ADV external mutable state shared by worktrees; specs stay repo-local (`.adv/specs/`). Legacy `db_dir`/physical `db/` only.

State: `$XDG_DATA_HOME/opencode/plugins/advance/{project-id}/`; worktrees: `$XDG_DATA_HOME/opencode/worktree/{project-id}/{branch}`. Cleanup deletion needs approval.

Policy: every ADV change runs in worktree; create/reuse before Phase 1; tool unavailable → `[ADV:BLOCKED]`; same-change worktree → auto-reuse.

Reuse: `git worktree list --porcelain` for `change/{change-id}`; existing path reuse; missing → `git worktree prune` then fresh.

Setup: `.opencode/worktree.jsonc` controls `sync.copyFiles`, `hooks.postCreate`, `hooks.preDelete`. `postCreate` fail → `setup_failed` blocks routing.

| Data | Location | Shared? |
|---|---|---|
| Specs `.adv/specs/` | repo/git | branch-local |
| Changes/archive/wisdom/agenda | external | yes, project-id keyed |

Spec changes in worktree invisible elsewhere until merge. Archive Phase 9 stages/commits, detects default branch, refreshes basis, ff-only/reconcile/PR, verifies, then deletes worktree. × Never delete unmerged worktree.

## When to Use ADV

**Use for:** New features, breaking changes, architecture, compliance, unclear bug fixes via `/adv-problem`
**Use lighter workflows for:** Typos, deps, exploration

### Provider ADV agent assembly

<!-- rq-scopedAdvInstructions01 --> `scripts/sync-global.sh` generates provider-specific ADV variants (`adv-claude`, `adv-gpt`, `adv-glm`, `adv-kimi`) as generated runtime agents backed by global prompt parts:
