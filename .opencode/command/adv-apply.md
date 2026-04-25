---
name: adv-apply
description: "Implement change with TDD, retry on failure, and final verification"
phaseGoal: "Execute the approved plan autonomously. Add discovered tasks within scope. Escalate only on failure."
---
<!-- manifest: adv-apply · gate: execution · requiresChangeId: true · prereqs: [adv-prep] · scope: reads[specs, proposal, tasks, codebase] · modifies[tasks, codebase] -->
# ADV Apply — Produce Deliverables with TDD and Retry
Implement an ADV change using TDD. Produce the agreed deliverables — code, docs, ops changes, or verification artifacts — and pursue every task to completion.
## Task Completion Policy
| Exit | Condition |
|------|-----------|
| ✅ Done | Implementation verified, tests pass |
| 🔁 Doom Loop | 3 genuine fix attempts failed with documented diagnosis |
| 🌍 Environmental | Missing external dependency → escalate immediately |

Cross-repo tasks: switch `workdir` to target path. "Different repo" is × never a valid exit.

Cancellation: use `adv_task_cancel` with user approval. `adv_task_update status: cancelled` is rejected.
| × Bad | ✓ Good |
|-------|--------|
| "Let's skip this for now" | Apply retry protocol |
| "We can come back to this" | Complete now or exhaust retries |
| "This targets another repo" | Switch `workdir` and execute |
| `adv_task_update status: cancelled` | `adv_task_cancel` with user approval |
<UserRequest>
  $ARGUMENTS
</UserRequest>
## Target Resolution
1. If change-id provided → use directly
2. If empty → `adv_change_list` → confirm/select via `question` tool
3. If none → suggest `/adv-proposal`

## Gate Prerequisite Check
`adv_gate_status changeId: {change-id}`
- Discovery/design/planning incomplete → stop and require the pre-implementation workflow first
- All pre-implementation stages complete → proceed to Phase 0

× `/adv-apply` MUST NOT complete discovery, design, or planning gates.
## Phase 0: Embedded Methodology

### Apply Methodology

#### Purpose

Reusable implementation methodology for ADV apply workflows. Provides the TDD work loop shape, retry protocol, context freshness rules, and task completion criteria.

**Canonical sources:**
- `ADV_INSTRUCTIONS.md § Context Freshness` — two-tier context loading protocol
- `ADV_INSTRUCTIONS.md § TDD Protocol (RSTC)` — red/green/trivial phases
- `ADV_INSTRUCTIONS.md § Doom Loop Detection` — retry budget and escalation
- `ADV_INSTRUCTIONS.md § Cross-Repo Execution` — workdir switching protocol

#### TDD Work Loop

| Phase | Action | Evidence |
|-------|--------|----------|
| Red | Write failing test using editing tool → `adv_run_test phase:'red'` → show failure | Test output with exit code ≠ 0 |
| Green | Implement using editing tool → `adv_run_test phase:'green'` → show pass | Test output with exit code 0 |
| Trivial | Set `tdd_intent: "not_applicable"` | Rationale in task notes |

#### Retry Protocol

| Error type | Examples | Action |
|------------|----------|--------|
| SEMANTIC | Type errors, test failures, logic bugs | Diagnose → Fix → Retry (3×) |
| TRANSIENT | Network timeout, flaky test | Wait 5s → Retry once |
| ENVIRONMENTAL | Missing dep, config not found | Escalate immediately |

Before any retry: emit diagnosis with root cause analysis and planned approach. Each attempt must have a different strategy.

#### Task Completion Rules

- Verify build/tests/lint pass after each task
- Mark done only after incremental verification passes
- Use `adv_task_show` for per-task context refresh (not `adv_change_show`)
- Use task IDs only in TodoWrite

#### Constraints

- **Read-only guidance** — this methodology block does not mutate ADV state
- **No gate completion** — the command owns the execution gate
- **Canonical sources** — defer to `ADV_INSTRUCTIONS.md` for detailed protocol rules
- **No workflow sequencing** — the command owns phase ordering and task loop
### Scope Expansion During Execution
If new objectives or acceptance criteria are discovered during execution that were not part of the original agreement, do NOT silently fold them into the current task graph. Instead:
1. Identify earliest invalidated gate for the expanded scope
2. Use `adv_change_reenter` to reopen from the earliest affected gate (typically `discovery`)
3. Walk the reopened gates normally (`/adv-discover` → `/adv-design` → `/adv-prep`)
4. After the planning gate re-completes, resume `/adv-apply` — new tasks will be available alongside existing completed work

Existing tasks and completed work are preserved across re-entry. Only gate state is reset.

## Phase 0.1: Worktree Isolation

### Tool Check
If `worktree_create` unavailable → hard block: `[ADV:BLOCKED] Worktree tools required but unavailable. Configure worktree MCP server to proceed.` → stop.

### Detect Existing Worktree
`git worktree list --porcelain` → find `change/{change-id}` branch.
- Path exists (healthy) → auto-reuse: switch `workdir` to existing path
- Path missing (stale) → `git worktree prune` → continue to create
- No match → continue to create

### Create Worktree
1. `worktree_create branch: "change/{change-id}"`
2. **Immediately** capture returned path and set `workdir` for ALL subsequent tool calls
3. Continue inline — no handoff, no new terminal needed
4. When deleting later, pass `branch: "change/{change-id}"` to `worktree_delete`

### Multi-Change Worktree Switch
When a session on change A needs to work on change B:
1. `git worktree list --porcelain` → find `change/{change-b-id}` branch
2. If worktree-B exists → switch `workdir` to worktree-B path
3. If worktree-B missing → `worktree_create branch: "change/{change-b-id}"` → capture path → switch `workdir`
4. Resume work on change B in its isolated worktree
5. To return to change A → switch `workdir` back to worktree-A path

## Phase 0.2: Overlap Warning (Advisory)
Check `adv_change_list` for other active changes. Compare affected files. If overlaps found → emit advisory warning listing files and overlapping change IDs. Suggest `/adv-coordinate`. Does NOT block work.

---
## Cross-Repo Execution
Tasks may target other repositories. See ADV_INSTRUCTIONS.md §Cross-Repo Execution for full protocol.
1. Detect: check `target_repo`/`target_path` fields or path hints in title
2. Resolve: use `related_repos` config or `target_path` directly; confirm with user if ambiguous
3. Execute: switch `workdir` → run TDD workflow → switch back

× Prohibited cancellation reasons: "out of scope", "different repository", "cannot modify external code", "backend/API changes needed", "would need database changes" — all require switching `workdir` and executing.

---
## Cancellation Policy
All cancellations require explicit user approval via `adv_task_cancel`.

Workflow: collect per-task reasons → present via `question` tool (Approve all, Review individually, Reject) → user approves → **checkpoint before cancel**: call `adv_task_checkpoint` with `mode: 'cancel'`, `reason: <reason>` → then call `adv_task_cancel`.

---
## Phase 1: Load Change Context
1. `adv_change_show changeId: <target>` → extract title, status, deltas
2. `adv_task_list changeId: <target>` → total/completed counts, task details
3. `adv_task_ready changeId: <target>` → unblocked tasks

---
## Phase 1.5: Investment Check-In Preamble (addCostTimeInvestment)

Load `skill("adv-cost-governance-methodology")` and **apply the Surfacing
Protocol**. Single-cadence batch for judgment calls identified in `/adv-prep`
Phase J. Doom-loop-clearance re-surface is the only secondary path in v1.

**6-step summary:**

1. **Inspect** `change.judgment_calls`: `undefined` → legacy, skip silently; `[]` → record `batch_surfaced_at`, proceed; populated → continue.
2. **Change-level doom-loop scan** via `adv_investment_report` — if `doom_loop_active`, defer to doom-loop recovery (supersedes batch).
3. **Surface** unresolved entries (`user_choice === undefined`) via single `question` tool call, multi-question, `(Recommended)` + P26 write-in.
   - When a judgment call is easier to compare side-by-side than from prose alone, prepend a compact text-first comparison block before the `question` call.
   - Keep screenshots optional, require text fallback, and align displayed options with final `question` options.
4. **Record resolutions** per call: `user_choice`, `resolved_by: "user"`, `surfaced_at`; persist via `adv_change_update`.
5. **Record `batch_surfaced_at`** on change (audit anchor for AC #6, including N=0 case).
6. **Hard-stop advisory** (if `threshold_tier === "hardstop"`): strongly-worded recommend-pause note. × Do NOT call `adv_change_reenter` — re-entry is scope-expansion-driven per `rq-scopeReentry01`.

**Composition:** Phase 1.5 is covered by `rq-autonomy01`'s "unresolved user-value tradeoff" escape clause — NOT a new enumerated checkpoint. See skill for full protocol + detailed semantics.

## Phase 2: Prep Gate Approval Verification

### Prep Gate Approval Check

Verify that the prep gate was completed with user approval. The prep gate is the last human checkpoint — `/adv-apply` runs autonomously after it.

- **Prep gate complete with `userApproved`**: Proceed immediately. No confirmation needed.
- **Prep gate complete without `userApproved` (legacy change)**: Emit soft advisory:
  ```
  ⚠ ADVISORY: Prep gate was completed before HITL enforcement.
  This change was approved under the previous workflow.
  Proceeding with implementation.
  ```
  Ask via `question` tool: Proceed with implementation (Recommended), Re-run prep for explicit approval, Cancel.
- **Prep gate not complete**: Stop — require `/adv-prep` first (handled by Gate Prerequisite Check above).

× MUST NOT ask "Begin work?" when prep gate has `userApproved` — that approval already happened during `/adv-prep`.

---
## Phase 2: Display Contract

Emit a purpose line: `Working on: {change-id}`. State is visible via `_contextSnapshot` and `adv_change_show` — do not duplicate it in a banner.

Retry policy (advisory): SEMANTIC 3 retries, TRANSIENT 1 retry + 5s delay, ENVIRONMENTAL immediate escalation.

Proceed directly to Phase 3 — do NOT ask for approval to begin work. Execution-start approval is NOT a sanctioned human checkpoint under `rq-autonomy01`. Judgment calls have already been surfaced in Phase 1.5; scope and criteria were signed off at the Agreement gate.

---
## Retry Protocol
### Error Classification
| Type | Examples | Action |
|------|----------|--------|
| SEMANTIC | Type errors, test failures, logic bugs | Diagnose → Fix → Retry (3×) |
| TRANSIENT | Network timeout, flaky test | Wait 5s → Retry once |
| ENVIRONMENTAL | Missing dep, config not found | Escalate immediately |
### Diagnosis Requirement (Reflexion)
Before ANY SEMANTIC fix, emit:
```
[ADV:BLOCKED] RETRY {n}/3
DIAGNOSIS: {root cause analysis}
FIX: {planned approach}
```

Diagnosis MUST appear before fix. Each attempt must have different diagnosis and approach.
### Recording
After each failed attempt: `adv_task_update taskId: {id} status: "in_progress" notes: "RETRY {n}/3 - {error_class}: {last_error}" error_recovery: { last_error, retry_count, max_retries, error_class, next_strategy, attempts[] }`

The `error_recovery` field on task JSON captures: `last_error`, `retry_count`, `max_retries`, `error_class` (TRANSIENT|SEMANTIC|ENVIRONMENTAL|FATAL), `next_strategy`, and `attempts[]` (attempt_number, error, diagnosis, fix_tried, outcome, attempted_at). Left as-is on success (historical record).
### Budget Exhaustion (3 retries failed)
Emit RETRY BUDGET EXHAUSTED banner showing all 3 attempts (diagnosis, fix, result for each). Classify blocking reason: SEMANTIC, KNOWLEDGE, or ENVIRONMENTAL.

Ask via `question` tool: Provide hint (Recommended), Take over task, Void contract. × "Skip task" is NOT an option.

---
## Phase 3: TDD Work Loop
### Context Freshness (MANDATORY)
Load context in two tiers:

**Phase start (once):** `adv_change_show` → load full change context including proposal, design, gates, and task summary.

**Per task:**
1. `adv_task_show` → load current task details
2. `adv_wisdom_list` → load accumulated learnings for this change
3. Read relevant proposal/design sections only when the task description references them

× Do NOT call `adv_change_show` before every task — reserve for phase transitions.
× Do NOT batch tasks into local todo list with descriptive blurbs.
### Worktree Context for Sub-Agents
Include `WORKING DIRECTORY: {workdir}` in every sub-agent prompt. Detect via `pwd`. Critical in worktrees — sub-agents inherit default project root, not worktree path.
### TodoWrite Rules
Use task IDs only (`tk-abc123`), not descriptions. Forces context lookup via `adv_task_show`.
### Anti-Patterns (PROHIBITED)
| × Anti-Pattern | ✓ Correct |
|----------------|-----------|
| "Let's skip/defer this" | Apply retry protocol |
| "This might need manual work" | Try 3 times first |
| "I'm not sure how to proceed" | Research, diagnose, attempt |
| "Would you like me to skip?" | Never offer skip |
| "Tests are flaky, marking done" | Fix flaky tests or document as environmental |
| Marking "blocked" after 1 try | Must attempt 3 distinct fixes |
| "This targets another repo" | Switch workdir and execute |
| Shell-authored test-file content (heredoc / `python -c` / `echo > *.test.*` / `tee` / `cat >`) | Prohibited for ordinary TDD. Use `edit` / `write` / `morph_edit` for file changes, then run `adv_run_test` |

`adv_task_evidence` is fallback for externally captured evidence. It is not the primary inline-TDD path when the test command can run via `adv_run_test`.
### Delegation Routing
Before TDD phases, evaluate each task for delegation eligibility:
| Priority | Check | Result |
|----------|-------|--------|
| 1 | `metadata.delegation_hint` set? | Use the hint value directly |
| 2 | `tdd_intent == "not_applicable"`? | `delegate_allowed` |
| 3 | Title matches `isTrivialTask` patterns? | `delegate_allowed` |
| 4 | Risk signals: multi-file, cross-repo, architectural keywords, failing-test diagnosis? | Any present → `inline_required` |
| 5 | Default | `inline_required` |

Hint semantics:
- `inline_required` → never delegate
- `delegate_allowed` → delegate when no risk signals force inline
- `delegate_preferred` → delegate by default; only override if an execution precondition makes delegation impossible

**If delegated (`delegate_allowed` or `delegate_preferred`):** Spawn `adv-engineer` sub-agent with the Apply Context Packet below. If sub-agent succeeds → run incremental verification → if passes → mark done. If sub-agent fails OR verification fails → immediate inline fallback, continue with Red/Green phases.

**If `inline_required`:** Proceed with standard TDD flow.

Emit routing summary: `tk-{id} → {inline|adv-engineer|general-verify} ({reason})`

#### Verify-Burst Delegation

Task-level delegation (above) covers *implementation* of a single task. Separately, heavy *verification* bursts — full lint, project-wide typecheck, broad test suites — are good candidates for isolation in a `general` subagent even during inline task work. Purpose: keep the main agent's context clean of long, noisy verify output, and isolate timeout risk from hangs.

**When to delegate a verify burst:**
- Output expected to exceed ~200 lines (heavy warnings, stack traces, coverage reports)
- Single command runtime expected to exceed ~30s
- Running lint + typecheck + broader tests together — parallelism pays off
- Need timeout isolation so a hang in one check doesn't block the session

**When to keep inline:**
- Focused TDD red/green on the test file being driven (`adv_run_test` stays inline)
- Quick lint or test on a single file
- Verify step where output is already expected to be short

**Spawn contract** (`subagent_type: "general"`):

```
WORKING DIRECTORY: {workdir}
SCOPE: verify-only — do not edit, write, patch, or modify files
COMMANDS:
  - {cmd 1, e.g., pnpm lint src/components/Foo}
  - {cmd 2, e.g., pnpm typecheck}
  - {cmd 3, e.g., pnpm test -- src/components/Foo}
EXPECTED OUTPUT:
  Per-command:
    - status: PASS | FAIL
    - exit code
    - errors: [{file, line, message}] (first 20)
  Summary: PASS if all commands passed, else FAIL
```

**Post-spawn handling:**
- Worker PASS → continue task
- Worker FAIL with errors → main agent classifies and fixes inline
- Worker times out or empty result → retry once with narrower scope (single command) → if still fails, run inline with output truncation

Heuristic, not a hard rule. Prefer delegation when heavy; inline is fine otherwise. Focused TDD `adv_run_test` stays inline regardless.

#### Apply Context Packet
```
WORKING DIRECTORY: {workdir}
CHANGE: {change-id} | {title}
TASK: {task-id} | {task-title} | type: {type} | tdd_intent: {intent}
AFFECTED FILES: {file list from task description}
DESIGN EXCERPT: {relevant section if task references design}
ACCEPTANCE CRITERIA: {criteria relevant to this task}
EXPECTED OUTPUT: implement the task, run tests, emit a fenced ENGINEER_REPORT JSON block per .opencode/agents/adv-engineer.md
```
### Task Flow
`adv_task_ready changeId: <id>` → for each ready task:

**3a. Start:** Refresh context (MANDATORY) → `adv_task_update status: "in_progress"` → record task-run `start` in the durable task-run ledger. On resume, inspect `adv_task_run_status taskId: <id>` for `requiredNextAction` and continue from that point without adding a user pause.

**3a.5. Route:** Evaluate delegation routing (above). If delegated and verified → skip to 3d.

**3a.6. Clean Baseline Capture:** Verify `git status --porcelain` is clean and capture `baselineHeadSha = git rev-parse HEAD` and `baselineBranch = git branch --show-current`. record baseline in the task-run ledger. If dirty → stop and remediate before Red Phase.

**3b. Red Phase:** Write failing test using `edit` / `write` / `morph_edit` → run with `adv_run_test phase:'red'` → show red evidence. Successful `adv_run_test` records the red evidence event in the task-run ledger.

**3c. Green Phase:** Implement using `edit` / `write` / `morph_edit` → run with `adv_run_test phase:'green'` → if fails: retry protocol → show green evidence. Successful `adv_run_test` records the green evidence event in the task-run ledger.

**3c.4. Incremental Verification:** Run build/tests/lint for task scope → if fails: retry protocol → only proceed to checkpoint after pass. Record verification event in the task-run ledger.

**3c.5. Checkpoint:** Call `adv_task_checkpoint` with:
- `taskId: <id>`
- `workdir: <effective workdir>`
- `changeId: <change-id>` (assertion — must match task owner)
- `expectedBranch: change/{change-id}` (or configured change branch)
- `expectedHeadSha: <baselineHeadSha>`
- `verification: <task verification summary>`

- `{status: 'clean' | 'committed'}` → checkpoint event is recorded in the task-run ledger; proceed to 3d.
- `{status: 'failed', classification: 'SEMANTIC'}` → diagnose, re-run checkpoint (retry budget applies).
- `{classification: 'ENVIRONMENTAL'}` → escalate via `question` tool; keep task `in_progress`.
- `{classification: 'TRANSIENT'}` → tool already retried internally; surface remaining failure as SEMANTIC or ENVIRONMENTAL per its follow-up classification.

**3d. Complete:** assert task-run next action is `mark_done` or checkpoint phase is satisfied → `adv_task_update status: "done"` → show evidence

**3e. Loop:** `adv_task_ready` → if ready tasks remain, **GOTO 3a**. REPEAT until the ready queue is empty.

You MUST continue to the next ready task without pausing. You MUST NOT pause between tasks, between sections, or after progress displays. Auto-continue is mandatory per `rq-autonomy01` / `rq-autonomy01.4`.

#### Allowed exit conditions (ONLY these end the loop)
1. `adv_task_ready` returns empty (all ready tasks done) → advance to Phase 5 verification.
2. Doom-loop triggered (3 failed SEMANTIC retries on a task) → `[ADV:BLOCKED]` + user `question`.
3. ENVIRONMENTAL blocker (missing dep, config, credential) → escalate via `question`.
4. User-requested cancellation → `adv_task_cancel` flow.
5. Scope expansion requiring re-entry → `adv_change_reenter` flow.
6. New judgment call surfaces mid-execution that was not captured in Phase 1.5 → resurface via `question`.
7. Checkpoint failure with ENVIRONMENTAL or unresolved SEMANTIC classification → escalate via `question`.

#### Invalid stop reasons (MUST NOT pause for any of these)
- "Task complete" / "Section complete" / "Phase complete"
- "Progress update" / "Status report" / "Let me summarize"
- Asking whether to continue, proceed, or move on between tasks
- "Good stopping point" / "Natural checkpoint"
- Any reason not enumerated in the Allowed exit conditions above

### Incremental Verification
After EACH task: run build/tests/lint → if fails: retry protocol → only mark complete after pass. Incremental verification runs BEFORE the checkpoint (step 3c.4) so the checkpoint represents verified task state. Post-checkpoint fix-ups are not expected by design — verification must pass before committing.

---
## Phase 4: Progress Tracking

Task state is visible via `_contextSnapshot` and `adv_task_list` — do not emit a per-task status block.

---
## Phase 5: Global Final Loop
Before emitting the execution-gate handoff: run full build + all tests + lint + type check. If any fail → retry protocol → continue until pass or budget exhausted.

---
## Phase 6: Completion
### Pre-Completion Checklist
Verify: all tasks done or properly cancelled, no tasks skipped/deferred, all "trivial" skips have rationale, touched-scope quality/test obligations met (directly touched files, adjacent test/doc gaps addressed, same-pattern subsystem issues fixed).
### Cancelled Task Verification
If cancelled tasks exist → verify each has `cancellation.approved_by_user: true`. If any lack approval → ask via `question` tool for retroactive approval.
### Final Validation
`adv_change_validate changeId: <target>` → must pass.
### Mark Gate
`adv_gate_complete changeId: {change-id} gateId: execution`
### Handoff

Use the Gate Handoff Voice spine (see `docs/command-voice-standard.md § Gate Handoff Voice`):

```
## Problem
{One-line restatement of the problem this change addresses.}

## Chosen direction
What was built and how it was verified.

## Delivered
- {completed}/{total} tasks done
- Build, tests, lint pass
- {Completion mode: UNASSISTED/GUIDED/PARTIAL TAKEOVER, if relevant}
- {Cancelled tasks with reasons, if any}

---
**{change-id}** · execution ✓ → acceptance · `/adv-review {change-id}`
```

---
## Trivial Tasks
For tasks with `metadata.tdd_intent: "not_applicable"` (docs, config, non-code): skip Red/Green phases, verify manually, include rationale in status. These tasks are also candidates for delegation routing — see § Delegation Routing above.

---
## Key Principle
All state lives in ADV tools. Contract banners are views, not source of truth.
| State | Tool |
|-------|------|
| Task status | `adv_task_update` |
| Task list | `adv_task_list` |
| Ready tasks | `adv_task_ready` |
| Change data | `adv_change_show` |
| Validation | `adv_change_validate` |
