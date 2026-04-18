---
name: adv-apply
description: Implement change with TDD, retry on failure, and final verification
---
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
## Phase 0: Load Skill
`skill("adv-apply-methodology")` → provides TDD work loop shape, retry protocol, context freshness rules, and task completion criteria. If the skill is unavailable, continue with the embedded protocol in this command file.
### Scope Expansion During Execution
If new objectives or acceptance criteria are discovered during execution that were not part of the original agreement, do NOT silently fold them into the current task graph. Instead:
1. Present the scope expansion to the user and obtain explicit approval
2. Use `adv_change_reenter` to reopen from the earliest affected gate (typically `discovery`)
3. Walk the reopened gates normally (`/adv-discover` → `/adv-agree` → `/adv-design` → `/adv-prep`)
4. After the planning gate re-completes, resume `/adv-apply` — new tasks will be available alongside existing completed work

Existing tasks and completed work are preserved across re-entry. Only gate state is reset.

## Phase 0.1: Worktree Assessment
Assess whether change benefits from worktree isolation.
### Risk Assessment
| Signal | Risk |
|--------|------|
| 3+ files, breaking API, DB schema, auth, shared types, structural refactor, spike | High → suggest worktree |
| 1-2 files trivial, docs/config only | Low → skip worktree |

If low risk → skip to Phase 1.
### Tool Check
If `worktree_create` unavailable → `[ADV:INFO] Worktree tools not available — proceeding in-place.` → Phase 1.
### Detect Existing Worktree
`git worktree list --porcelain` → find `change/{change-id}` branch.
- Path exists (healthy) → ask via `question`: Switch to existing (Recommended), Delete and recreate, Work in place
- Path missing (stale) → `git worktree prune` → continue
- No match → continue
### Create Worktree
If user approves:
1. `worktree_create branch: "change/{change-id}"`
2. **Immediately** capture returned path and set `workdir` for ALL subsequent tool calls
3. Continue inline — no handoff, no new terminal needed
4. When deleting later, pass `branch: "change/{change-id}"` to `worktree_delete`

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

Workflow: collect per-task reasons → present via `question` tool (Approve all, Review individually, Reject) → execute only after approval.

---
## Phase 1: Load Change Context
1. `adv_change_show changeId: <target>` → extract title, status, deltas
2. `adv_task_list changeId: <target>` → total/completed counts, task details
3. `adv_task_ready changeId: <target>` → unblocked tasks

---
## Phase 1.5: Investment Check-In Preamble (addCostTimeInvestment)

Post-prep mandatory batch surfacing of judgment calls identified during
`/adv-prep` Phase J. Single cadence per change — this is the only point
where unresolved judgment calls are surfaced, plus the doom-loop-clearance
re-surface edge case. Agreement user decision #10; design D4.

### Flow

1. **Inspect `change.judgment_calls`** (from Phase 1 `adv_change_show`):
   - `undefined` → **legacy change** (pre-v1). Log silently, do NOT
     surface, do NOT record `batch_surfaced_at`. Proceed to Phase 2.
   - `[]` (empty array) → new-generation change with zero calls
     identified. Record `batch_surfaced_at` via `adv_change_update` for
     audit. Proceed to Phase 2 with no interruption.
   - populated → continue to step 2.

2. **Change-level doom-loop scan.** Call `adv_investment_report changeId: <target>`
   and inspect `doom_loop_active`. The report scans all tasks via
   `getDoomLoopInfo(task.id)` — any active tracker flags true. When
   active:
   - **Defer** judgment-call surfacing. Record notes "Phase 1.5 deferred
     — doom-loop active on task <id>". Proceed to doom-loop recovery path
     per ADV_INSTRUCTIONS.md § Doom Loop Detection.
   - Judgment calls **re-surface** automatically on the next Phase 1.5
     invocation after doom-loop clears.

3. **Surface unresolved calls.** Filter `judgment_calls[]` to entries
   where `user_choice === undefined`. If zero remain (all resolved from
   a prior session), record `batch_surfaced_at` and proceed.

   Otherwise emit **one** `question` tool call with multiple sub-questions
   — one per unresolved call. For each sub-question:
   - Question text = `judgment_calls[i].question`
   - Options = `judgment_calls[i].options[]`, with the option matching
     `agent_recommendation` labeled `(Recommended)` inline in its label.
   - Include the P26 write-in option automatically.
   - Surface `rationale` in a brief header line before the options.

4. **Record resolutions.** After the user responds, for each judgment
   call update:
   - `user_choice` = the selected option label (or `"(write-in: ...)"`)
   - `resolved_by` = `"user"`
   - `surfaced_at` = current ISO8601 timestamp
   - Persist via `adv_change_update` with the updated `judgment_calls[]`.

5. **Record change-level timestamp.** Set `change.batch_surfaced_at` to
   the current ISO8601 timestamp via `adv_change_update`. This is the
   audit anchor required by AC #6 (verifiable even for N=0 cases).

6. **Report investment tier to user** (optional context). If
   `threshold_tier === "hardstop"`, emit a strongly-worded note in the
   banner prelude: "This change has crossed the hard-stop tier
   (task/retry/elapsed thresholds). Consider pausing or scoping down if
   the remaining work no longer matches priority." **Do NOT** call
   `adv_change_reenter` — hard-stop is advisory in v1 per design D12.
   Re-entry remains scope-expansion-driven per `rq-scopeReentry01`.

### Composition with `rq-autonomy01`

Phase 1.5 does **not** introduce a new enumerated human checkpoint.
Judgment-call surfacing is covered by `rq-autonomy01`'s existing
"unresolved user-value tradeoff" escape clause — unresolved entries in
`judgment_calls[]` are, by construction, unresolved user-value tradeoffs
(non-functional tradeoffs, extensibility decisions, scope boundaries are
all inherently value-weighted). See `ADV_INSTRUCTIONS.md § Investment
Check-In` for the full citation.

---
## Phase 2: Display Contract
Generate CONTRACT ACTIVE banner from tool outputs:
- OBJECTIVE from change title
- SUCCESS CRITERIA from deltas (each as checkbox)
- TASKS from task list (with status, blocked_by)
- Progress: done/total
- RETRY POLICY: SEMANTIC 3 retries, TRANSIENT 1 retry + 5s delay, ENVIRONMENTAL immediate escalation

Ask via `question` tool: Begin work (Recommended), Modify criteria, Cancel.

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
[ADV:DOOM_LOOP] RETRY {n}/3
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

**If delegated (`delegate_allowed` or `delegate_preferred`):** Spawn `general` sub-agent with the Apply Context Packet below. If sub-agent succeeds → run incremental verification → if passes → mark done. If sub-agent fails OR verification fails → immediate inline fallback, continue with Red/Green phases.

**If `inline_required`:** Proceed with standard TDD flow.

Emit routing summary: `tk-{id} → {inline|general} ({reason})`
#### Apply Context Packet
```
WORKING DIRECTORY: {workdir}
CHANGE: {change-id} | {title}
TASK: {task-id} | {task-title} | type: {type} | tdd_intent: {intent}
AFFECTED FILES: {file list from task description}
DESIGN EXCERPT: {relevant section if task references design}
ACCEPTANCE CRITERIA: {criteria relevant to this task}
EXPECTED OUTPUT: implement the task, run tests, report pass/fail result
```
### Task Flow
`adv_task_ready changeId: <id>` → for each ready task:

**3a. Start:** Refresh context (MANDATORY) → `adv_task_update status: "in_progress"`

**3a.5. Route:** Evaluate delegation routing (above). If delegated and verified → skip to 3d.

**3b. Red Phase:** `[ADV:TDD_RED]` → write failing test → run → show failure evidence

**3c. Green Phase:** `[ADV:TDD_GREEN]` → implement → run → if fails: retry protocol → show pass evidence

**3d. Complete:** `adv_task_update status: "done"` → show evidence

**3e. Refresh:** `adv_task_ready` → next task
### Incremental Verification
After EACH task: run build/tests/lint → if fails: retry protocol → only mark complete after pass.

---
## Phase 4: Progress Tracking
After EACH task, emit CONTRACT STATUS from `adv_task_list`: task checkboxes with status/evidence, phase indicator, done/total count.

---
## Phase 5: Global Final Loop
Before CONTRACT FULFILLED: run full build + all tests + lint + type check. If any fail → retry protocol → continue until pass or budget exhausted.

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
### Contract Fulfilled Banner
Emit: objective, all criteria met, cancelled tasks (if any with reasons), completion mode (UNASSISTED / GUIDED / PARTIAL TAKEOVER), gate status.

Completion modes:
- UNASSISTED: all tasks done by agent, no hints
- GUIDED: agent completed all but needed user hints for some
- PARTIAL TAKEOVER: user manually completed some tasks
```
/adv-apply {change-id} COMPLETE
Result: CONTRACT FULFILLED
Completion: {mode}
Tasks: {completed}/{total}
Execution Gate: MARKED COMPLETE
Next: /adv-review {change-id}
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
