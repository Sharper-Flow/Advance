---
name: adv-apply
description: "Implement change with TDD, retry on failure, and final verification"
phaseGoal: "Execute the approved plan autonomously. Add discovered tasks within scope. Escalate only on failure."
---

<!-- manifest: adv-apply · gate: execution · requiresChangeId: true · prereqs: [adv-prep] · scope: reads[specs, proposal, tasks, codebase] · modifies[tasks, codebase] -->
<!-- rq-subagentReports14 -->

# ADV Apply — Produce Deliverables with TDD and Retry

Implement an ADV change using TDD. Produce the agreed deliverables — code, docs, ops changes, or verification artifacts — and pursue every task to completion.

## Task Completion Policy

| Exit             | Condition                                               |
| ---------------- | ------------------------------------------------------- |
| ✅ Done          | Implementation verified, tests pass                     |
| 🔁 Doom Loop     | 3 genuine fix attempts failed with documented diagnosis |
| 🌍 Environmental | Missing external dependency → escalate immediately      |

Cross-repo tasks: switch `workdir` to target path. "Different repo" is × never a valid exit. Product-linked tasks must respect `scope_repos`; record wisdom from the executing repo so entries keep `origin_repo_id`, `origin_repo_project_id`, `origin_repo_path`, and `product_id`.

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

| Phase   | Action                                                                            | Evidence                       |
| ------- | --------------------------------------------------------------------------------- | ------------------------------ |
| Red     | Write failing test using editing tool → `adv_run_test phase:'red'` → show failure | Test output with exit code ≠ 0 |
| Green   | Implement using editing tool → `adv_run_test phase:'green'` → show pass           | Test output with exit code 0   |
| Verify  | Optional final check → `adv_run_test phase:'verify'`                              | Test output + result fields    |
| Trivial | Set `tdd_intent: "not_applicable"`                                                | Rationale in task notes        |

`adv_run_test phase` is descriptive metadata, not gate enforcement. Use `passed`, `classification`, and `exitCode` as command-result evidence.

**rq-TDD009seq ordering enforcement:** When completing an inline TDD task, include the `runId` values from your red and green `adv_run_test` calls as `lastRedRunId` and `lastGreenRunId` in the task completion payload. The workflow verifies that a red run (phase:'red', exitCode≠0) precedes a green run (phase:'green', exitCode=0). Tasks without these refs are grandfathered (backward compatible).

**rq-TDD010qual advisory signals:** `adv_run_test` now returns `assertionDensity`, `mockSurface`, and `behaviorSurface` when a specific test file is referenced. These are advisory — surfaced to `/adv-review` for human attention, never gate task completion.

#### Retry Protocol

| Error type    | Examples                               | Action                      |
| ------------- | -------------------------------------- | --------------------------- |
| SEMANTIC      | Type errors, test failures, logic bugs | Diagnose → Fix → Retry (3×) |
| TRANSIENT     | Network timeout, flaky test            | Wait 5s → Retry once        |
| ENVIRONMENTAL | Missing dep, config not found          | Escalate immediately        |

Before any retry: emit diagnosis with root cause analysis and planned approach. Each attempt must have a different strategy.

#### Task Completion Rules

- Verify build/tests/lint pass after each task
- Mark done only after incremental verification passes
- Use `adv_task_show` for per-task context refresh (not `adv_change_show`)
- Use task IDs only in TodoWrite

#### Constraints

- **Read-only guidance** — this methodology block does not mutate ADV state
- **No gate completion** — command owns the execution gate
- **Canonical sources** — defer to `ADV_INSTRUCTIONS.md` for detailed protocol rules
- **No workflow sequencing** — command owns phase ordering and task loop

### Scope Expansion During Execution

<!-- rq-scopeDiscoveryProtocol01 -->
<!-- rq-scopeFollowupSchema01 -->

If new objectives or acceptance criteria are discovered during execution that were not part of the original agreement, do NOT silently fold them into current task graph. Instead, apply the **scope-discovery protocol** from `docs/scope-discovery-protocol.md`:

1. **Assess campsite eligibility** — If the discovered scope is P23-campsite-eligible (adjacent, clear, safe, focused), apply it freely without prompting.
2. **Non-campsite scope** — Emit a Tier A inline prompt with options:
   - `reenter {gate}` — reopen from the earliest affected gate (typically `discovery`)
   - `split` — create a fast-follow child change via `adv_change_create parent_change_id: <current>`
   - `keep` — absorb into current change (still requires `adv_change_reenter` if new objectives/AC are added)
   - `cancel` — discard the discovered scope
3. **Walk reopened gates** — If reenter chosen, use `adv_change_reenter` then walk gates normally (`/adv-discover` → `/adv-design` → `/adv-prep`)
4. **Resume execution** — After planning re-completes, resume `/adv-apply` — new tasks will be available alongside existing completed work

Existing tasks and completed work are preserved across re-entry. Only gate state is reset.

See also `ADV_INSTRUCTIONS.md § Large-Scope Validity` — size alone is never grounds for split-suggestion after prep approval.

## Phase 0.1: Worktree Isolation

### Tool Check

If `adv_worktree_create` unavailable → hard block: `[ADV:BLOCKED] Worktree tools required but unavailable. Configure ADV worktree tools to proceed.` → stop.

### Detect Existing Worktree

`git worktree list --porcelain` → find `change/{change-id}` branch.

- Path exists (healthy) → auto-reuse: switch `workdir` to existing path
- Path missing (stale) → `git worktree prune` → continue to create
- No match → continue to create

### Create Worktree

1. `adv_worktree_create branch: "change/{change-id}"`
2. **Immediately** capture returned path and set `workdir` for ALL subsequent tool calls
3. Continue inline — no handoff, no new terminal needed
4. When deleting later, pass `branch: "change/{change-id}"` to `adv_worktree_delete`

### Post-Creation Path Verification

<!-- rq-pathVerification01 -->

After worktree creation, verify that task-referenced paths exist in the worktree. This prevents the recurring class of errors where the agent reads files from its main-checkout context but the worktree (forked from the default branch) lacks them — or the paths were constructed from assumed project structure not actual files.

1. Extract key file/directory paths from ready tasks (task `content`, `metadata.affected_files`, or design excerpts). Distinguish **read-reference paths** (files the agent will read for patterns/context) from **create-target paths** (files task will create).
2. Verify read-reference paths: `bash "test -e '{workdir}/{path}' && echo OK || echo MISSING"` (use `workdir` parameter).
3. For each MISSING read-reference path:
   a. Discover actual structure: `glob pattern: "**/{basename}" workdir: {workdir}` or `bash "ls {workdir}/"` to find file or its directory.
   b. If found at a different path → record the corrected path and use it for all subsequent operations on this task.
   c. If not found at all → file may not exist on the default branch (feature-branch-only file), or the path was assumed from common patterns. In this case:
   - If file is essential for task → check if it exists in the main checkout: `bash "test -e '{main-checkout}/{path}'"` and note the discrepancy. The worktree may need a rebase or file may need to be created differently.
   - If file is advisory (pattern reference) → mark it as unavailable and proceed without it; do NOT block on missing pattern files.
4. For cross-repo tasks (detected via `target_repo`/`target_path` or path hints in title): resolve target repo from `related_repos` config or `target_path` and **switch `workdir`** to target repo path for that task. The ADV worktree is for current project; cross-repo task execution happens in target repo directly.
5. Emit brief result: `Path verification: {N} OK, {M} corrected, {K} advisory-skipped, {L} to-create`

× Do NOT block Phase 1 for missing advisory files. Only block for missing essential files that prevent task execution.

### Multi-Change Worktree Switch

When a session on change A needs to work on change B:

1. `git worktree list --porcelain` → find `change/{change-b-id}` branch
2. If worktree-B exists → switch `workdir` to worktree-B path
3. If worktree-B missing → `adv_worktree_create branch: "change/{change-b-id}"` → capture path → switch `workdir`
4. Resume work on change B in its isolated worktree
5. To return to change A → switch `workdir` back to worktree-A path

## Phase 0.2: Overlap Warning (Conditional)

Check `adv_change_list` for other active changes. Compare affected files.

- **3+ changes touching same file** → emit `COORDINATION REQUIRED` banner listing file and all overlapping change IDs. **Halt `/adv-apply`** until user resolves (merge/combine changes, or proceed with explicit override).
- **2 changes touching same file** → emit advisory warning listing file and overlapping change ID. Does NOT block work.
- **No overlaps** → proceed silently.

Cross-change coordination is now handled automatically by `/adv-archive` (merge-order queue) and `/adv-status` (cross-change health dashboard).

## Phase 0.5: Pre-Execution Rebase (per-worktree)

Before task loop begins, run `preExecutionRebase` from `apply-helpers/pre-rebase.ts` against current worktree. This keeps change branch fresh against `origin/<default-branch>` without modifying origin.

**Why per-worktree is safe:** Each change runs in its own git worktree with an independent working directory. There is no shared index or working tree, so concurrent `/adv-apply` sessions on different changes cannot interfere with each other. No cross-session lock is required.

**Outcomes:**

- `up_to_date` — nothing to do; proceed to task loop.
- `rebased` — local branch was behind; rebase succeeded. Proceed to task loop.
- `conflict` — rebase failed with conflicts. The worktree is left clean (rebase aborted). Halt `/adv-apply` and surface the conflict to user with the list of conflicted files.
- `no_remote` / `default_branch_unresolvable` / `not_a_worktree` / `rebase_failed` — halt `/adv-apply` and surface the specific error with the provided hint.

× **Local-only** — does not push or modify origin.
× **Requires clean worktree** — the apply pre-flight elsewhere enforces this before Phase 0.5 runs. No `--autostash` is used.

**Runtime wiring:** The actual call to `preExecutionRebase` before task loop is OUT OF SCOPE for this document; it will be wired in a follow-up task.

---

## Cross-Repo Execution

Tasks may target other repositories. See ADV_INSTRUCTIONS.md §Cross-Repo Execution for full protocol.

1. Detect: check `target_repo`/`target_path` fields or path hints in title
2. Resolve: use `related_repos` config or `target_path` directly; confirm with user if ambiguous
3. Execute: switch `workdir` → run TDD workflow → switch back

× Prohibited cancellation reasons: "out of scope", "different repository", "cannot modify external code", "backend/API changes needed", "would need database changes" — all require switching `workdir` and executing.

## Cross-Project Coordination

When task contributes to another ADV-enabled project, use ADV tools with explicit `target_path` instead of reading or editing ADV state files directly.

| Operation                  | Required behavior                                                                                                 |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Target reads               | Use `snapshot-ok` tools (`adv_change_show`, task/gate/status reads) with `target_path`; inspect `_projectContext` |
| Target mutations           | Use `temporal-required` tools with `target_path`; fail closed if target queue is unavailable                      |
| Untrusted target mutations | Pass `target_confirmed: true` and `confirmationEvidence` from explicit user approval                              |

- `cross_project_links` records source/target provenance after target change creation/linking.
- `external_dependencies` are advisory-only dependencies: unmet targets warn through `_externalDependencyStatus`; warnings do not block task/gate completion by themselves.
- Target-project contribution workflow: create/link target change → verify source-side `cross_project_links` → read `_externalDependencyStatus` → mutate target only through ADV tools with confirmation when required.

---

## Cancellation Policy (Inline — Tier B)

All cancellations require explicit user approval via `adv_task_cancel`. Cancellation is irreversible — Tier B uses inline structured prose with strict regex parsing (no LLM fallback) per `docs/command-voice-standard.md` § Inline Approval Voice and `rq-inlineApproval01.4`.

**Workflow:**

1. **Collect per-task reasons** for each task to be cancelled.
2. **Emit numbered per-task list inline** (no `question` tool):

   ```
   Cancellation requested for these tasks:

   1. {tk-id} — "{title}" — Reason: {reason}
   2. {tk-id} — "{title}" — Reason: {reason}

   Reply EXACTLY one of:
   - `approve all` — cancel all listed tasks
   - `reject all` — keep all tasks active
   - `keep N` (or `keep N,M`) — cancel inverse of listed numbers
   - `cancel N` (or `cancel N,M`) — cancel only the listed numbers
   - `stop` / `abort` — halt; do not cancel anything

   Anything else → agent will re-prompt with the same options.
   ```

3. **Parse reply with regex (no LLM fallback):**

   | Pattern               | Action                                                                     |
   | --------------------- | -------------------------------------------------------------------------- |
   | `^approve all$`       | Cancel all listed tasks                                                    |
   | `^reject all$`        | Keep all tasks active                                                      |
   | `^keep ([\d,\s]+)$`   | Cancel inverse of listed numbers                                           |
   | `^cancel ([\d,\s]+)$` | Cancel only the listed numbers                                             |
   | `^(stop\|abort)$`     | Halt; do not cancel anything                                               |
   | Anything else         | Re-prompt with same options. **× Do NOT** invoke LLM. **× Do NOT** advance |

4. **Anchor phrase:** `approve all`

5. **On approval (checkpoint before cancel):** for each task to be cancelled:
   - Call `adv_task_checkpoint` with `mode: 'cancel'`, `reason: <reason>`
   - Then call `adv_task_cancel` with `approvedByUser: true` and `approvalEvidence: <user reply text>`

× Do NOT use the `question` tool for cancellation approval. The inline pattern is canonical per `rq-inlineApproval01.4`.

---

## Phase 1: Load Change Context

Single phase-start call (replaces the legacy 4-tool quartet):

```
adv_change_show changeId: <target> include: { ledger: true, snapshot: true, readyTasks: true }
```

This returns:

- `tasks` (paginated) and `_taskPagination` — total/completed/in-progress counts
- `_contextSnapshot` — rendered gate row + counts (matches live emission)
- `_ledger` — durable run state for the in-progress task (or `null`)
- `_readyTasks` + `_readyTasksMeta` — unblocked queue (top-10; override with `readyTasksLimit`)

Fall back to the legacy trio (`adv_change_show + adv_task_list + adv_task_ready`) only if a specific call needs more than the included slice.

---

## Phase 1.5: Prep Gate Approval Verification

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
- **Planning gate pending**: The `/adv-apply {change-id}` invocation itself counts as explicit approval. Complete planning with `adv_gate_complete gateId: planning userApproved: true` and proceed immediately to execution. This is command-as-approval behavior per `rq-inlineApproval01.7`.
- **Prep gate not complete (and not planning pending)**: Stop — require `/adv-prep` first (handled by Gate Prerequisite Check above).

× MUST NOT ask "Begin work?" when prep gate has `userApproved` — that approval already happened during `/adv-prep`.

---

## Phase 2: Display Contract

<!-- rq-scopeFollowupSurfacing01 -->

Emit a purpose line: `Working on: {change-id}`. State is visible via `_contextSnapshot` and `adv_change_show` — do not duplicate it in a banner.

Retry policy (advisory): SEMANTIC 3 retries, TRANSIENT 1 retry + 5s delay, ENVIRONMENTAL immediate escalation.

Proceed directly to Phase 3 — do NOT ask for approval to begin work. Execution-start approval is NOT a sanctioned human checkpoint under `rq-autonomy01`. Scope and criteria were signed off at the Agreement gate; the prep gate confirms the plan is ready for execution.

---

## Retry Protocol

### Error Classification

| Type          | Examples                               | Action                      |
| ------------- | -------------------------------------- | --------------------------- |
| SEMANTIC      | Type errors, test failures, logic bugs | Diagnose → Fix → Retry (3×) |
| TRANSIENT     | Network timeout, flaky test            | Wait 5s → Retry once        |
| ENVIRONMENTAL | Missing dep, config not found          | Escalate immediately        |

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

<!-- rq-TDD008path -->
<!-- rq-taskRunLedger01 -->

### Context Freshness (MANDATORY)

Load context in two tiers:

**Phase start (once):** `adv_change_show` → load full change context including proposal, design, gates, and task summary.

**Per task:**

1. `adv_task_show` → load current task details
2. `adv_wisdom_list` → load accumulated learnings for this change
3. Read relevant proposal/design sections only when task description references them

× Do NOT call `adv_change_show` before every task — reserve for phase transitions.
× Do NOT invent todo entries with prose descriptions instead of tk-ID projections. Use `_todoProjection` rows only.

### Worktree Context for Sub-Agents

Include `WORKING DIRECTORY: {workdir}` in every sub-agent prompt. Detect via `pwd`. Critical in worktrees — sub-agents inherit default project root, not worktree path.

### TodoWrite Rules

TodoWrite is a projection over ADV tasks, not the task source of truth. Copy `_todoProjection` rows (`tk-abc123 — title`) from `adv_task_ready` or `adv_change_show include.readyTasks:true`.

- Unknown `tk-*` IDs, other-change IDs, and premature `completed` status are blocked during top-level active ADV execution.
- Entries without `tk-*` IDs are scratchpad-only / warning-first.
- Non-ADV work, early gates without tasks, degraded ADV state, and subagent scratchpads remain allowed.

### Anti-Patterns (PROHIBITED)

| × Anti-Pattern                                                                                 | ✓ Correct                                                                                                  |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| "Let's skip/defer this"                                                                        | Apply retry protocol                                                                                       |
| "This might need manual work"                                                                  | Try 3 times first                                                                                          |
| "I'm not sure how to proceed"                                                                  | Research, diagnose, attempt                                                                                |
| "Would you like me to skip?"                                                                   | Never offer skip                                                                                           |
| "Tests are flaky, marking done"                                                                | Fix flaky tests or document as environmental                                                               |
| Marking "blocked" after 1 try                                                                  | Must attempt 3 distinct fixes                                                                              |
| "This targets another repo"                                                                    | Switch workdir and execute                                                                                 |
| Shell-authored test-file content (heredoc / `python -c` / `echo > *.test.*` / `tee` / `cat >`) | Prohibited for ordinary TDD. Use `edit` / `write` / `morph_edit` for file changes, then run `adv_run_test` |
| Silent fold of non-campsite scope                                                              | Apply scope-discovery protocol (`docs/scope-discovery-protocol.md`)                                        |
| "We'll handle this later" without surfacing                                                    | Apply scope-discovery protocol                                                                             |
| Quietly trimming a planned task as redundant                                                   | Apply scope-discovery protocol                                                                             |

`adv_run_test` is prescribed for ordinary inline red/green work because it provides executable proof for the current agent run. Durable final proof is recorded on `taskCompletedSignal.verification` when `adv_task_checkpoint` transitions the task to `done`.

### Delegation Routing

Before TDD phases, evaluate each task for delegation eligibility:
| Priority | Check | Result |
|----------|-------|--------|
| 1 | `metadata.delegation_hint` set? | Use the hint value directly |
| 1.5 | `metadata.frontend == "true"`? | `delegate_allowed` to `adv-designer` (apply-phase frontend worker) — unless step 4 risk signals force inline |
| 2 | `tdd_intent == "not_applicable"`? | `delegate_allowed` |
| 3 | Title matches `isTrivialTask` patterns? | `delegate_allowed` |
| 4 | Risk signals: multi-file, cross-repo, architectural keywords, failing-test diagnosis? | Any present → `inline_required` |
| 4.5 | Context-shed test passes? (4-question AND, floor ~5 files or ~50 lines) | `delegate_allowed` |
| 5 | Default | `inline_required` |

Step 1.5 (`metadata.frontend`) routes UI/component work to `adv-designer` instead of `adv-engineer`. Priority 1 (`metadata.delegation_hint`) remains the explicit user override and wins over Step 1.5; Step 4 risk signals still force inline. Step 4.5 does not override Step 1 or Step 4; priority order is authoritative.

Hint semantics:

- `inline_required` → never delegate
- `delegate_allowed` → delegate when no risk signals force inline
- `delegate_preferred` → delegate by default; only override if an execution precondition makes delegation impossible

**If delegated to `adv-engineer` (`delegate_allowed` or `delegate_preferred`):** Spawn `adv-engineer` sub-agent with the Apply Context Packet below.

**If delegated to `adv-designer` (Priority 1.5 frontend branch):** Spawn `adv-designer` sub-agent with the Designer Apply Context Packet below. `adv-designer` is the apply-phase frontend specialist; review/harden ownership remains with `adv-reviewer`.

If sub-agent succeeds → run incremental verification → if passes → mark done. If sub-agent fails OR verification fails → immediate inline fallback, continue with Red/Green phases.

**If `inline_required`:** Proceed with standard TDD flow.

Emit routing summary: `tk-{id} → {inline|adv-engineer|adv-designer|general-verify} ({reason})`

#### Verify-Burst Delegation

Task-level delegation (above) covers _implementation_ of a single task. Separately, heavy _verification_ bursts — full lint, project-wide typecheck, broad test suites — are good candidates for isolation in a `general` subagent even during inline task work. Purpose: keep the main agent's context clean of long, noisy verify output, and isolate timeout risk from hangs.

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
ATTEMPT: {attempt-number, starting at 1 for this task delegation}
TASK_SCOPE: {one-line implementation objective}
IN_SCOPE:
  - {owned files/findings/contract refs for this task}
OUT_OF_SCOPE:
  - {boundaries, DONT/OOS refs, unrelated subsystems}
DONE_WHEN:
  - {task acceptance condition}
STOP_WHEN:
  - contract/security/release blocker, unsafe edit, or impossible verification
VERIFICATION:
  required_when_possible:
    - {task-specific test/lint/typecheck command}
  optional_additional_checks: true
AFFECTED FILES: {file list from task description — use VERIFIED paths from Phase 0.1 path verification, not assumed paths}
PROJECT STRUCTURE: {brief ls or glob output showing relevant directories/files in workdir — populated during Phase 0.1 path verification}
DESIGN EXCERPT: {relevant section if task references design}
ACCEPTANCE CRITERIA: {criteria relevant to this task}
EXPECTED OUTPUT: implement the task, run tests, call adv_subagent_report_submit with ENGINEER_REPORT per .opencode/agents/adv-engineer.md
```

`PROJECT STRUCTURE` provides the sub-agent with a ground-truth file manifest so it can self-correct path assumptions. Populate it from the Phase 0.1 path verification output. Example: `"Directories: repositories/, api/schemas/, services/; Pattern files: repositories/base.py, api/schemas/analytics.py"`.

#### Designer Apply Context Packet

Use this packet when delegating a task to `adv-designer` (Priority 1.5 routing branch — `metadata.frontend == "true"`). It mirrors the Apply Context Packet identity anchors and adds frontend-specific guidance.

```
WORKING DIRECTORY: {workdir}
CHANGE: {change-id} | {title}
TASK: {task-id} | {task-title} | type: {type} | tdd_intent: {intent}
ATTEMPT: {attempt-number, starting at 1 for this task delegation}
TASK_SCOPE: {one-line frontend/component objective}
IN_SCOPE:
  - {owned UI/component files/findings for this task}
OUT_OF_SCOPE:
  - {backend logic, storage, APIs, Temporal, business rules, unrelated subsystems, review/harden}
DONE_WHEN:
  - {task acceptance condition; UI verified}
STOP_WHEN:
  - contract/security/release blocker, unsafe edit, impossible verification, or BACKEND BOUNDARY hit
VERIFICATION:
  required_when_possible:
    - {task-specific component/lint/typecheck/a11y command}
  optional_additional_checks: true
VISUAL_CONTEXT:
  surface_type: {tool | dashboard | form | docs | marketing | component | unknown | unavailable: reason}
  existing_patterns:
    - {relevant primitives/components/layout patterns, or unavailable: reason}
  tokens_and_style_rules:
    - {known design tokens/style constraints, or unavailable: reason}
  viewport_targets:
    - {viewport/breakpoint expectations, or unavailable: reason}
  forbidden_patterns:
    - {agreement avoidances, project avoidances, and design anti-patterns}
  evidence_expectation: {browser/design proof expected with viewport context, or fallback rationale when unavailable}
DESIGN QUALITY BAR: component correctness, semantic HTML/accessibility, responsive behavior, visual polish, matching site design, finer details
NEIGHBORING RECOMMENDATIONS: finish owned UI scope if safe; surface adjacent UI inconsistencies (e.g., unstyled neighboring buttons, inconsistent tokens) via `DESIGNER_REPORT.neighboring_recommendations[]` and `required_main_agent_actions` for orchestrator/user HITL. Do not silently broaden scope.
BACKEND BOUNDARY: if the UI task requires changing storage, APIs, Temporal, or business logic, stop and report. Populate `scope_drift.recommendation: "stop_and_report"` and `required_main_agent_actions` with a handoff to `adv-engineer`. Do NOT edit backend files.
AFFECTED FILES: {file list from task description — use VERIFIED paths from Phase 0.1 path verification, not assumed paths}
PROJECT STRUCTURE: {brief ls or glob output showing relevant directories/files in workdir — populated during Phase 0.1 path verification}
DESIGN EXCERPT: {relevant section if task references design}
ACCEPTANCE CRITERIA: {criteria relevant to this task}
EXPECTED OUTPUT: implement the UI/component task, run tests, call adv_subagent_report_submit with DESIGNER_REPORT per .opencode/agents/adv-designer.md
```

<!-- rq-delDefaults08 -->

The Designer Apply Context Packet uses the same identity anchors as the Apply Context Packet (`WORKING DIRECTORY`, `CHANGE`, `TASK`, `ATTEMPT`). The packet adds `VISUAL_CONTEXT`, `DESIGN QUALITY BAR`, `NEIGHBORING RECOMMENDATIONS`, and `BACKEND BOUNDARY` as warn-first anchors specific to designer delegation. `VISUAL_CONTEXT` must use existing agreement/design/task/project/preview sources or explicit unavailable markers with reasons; it must not fabricate style context. `EXPECTED OUTPUT` references `adv_subagent_report_submit` with `DESIGNER_REPORT` — `adv-designer` MUST NOT submit `ENGINEER_REPORT`.

### Task Flow

`adv_task_ready changeId: <id>` → for each ready task:

**3a. Start:** Refresh context (MANDATORY) → `adv_task_update status: "in_progress"` fires `taskAssignedSignal`. On resume, query change workflow state and continue from the active task without adding a user pause.

**3a.5. Route:** Evaluate delegation routing (above). If delegated and verified → skip to 3d.

**3a.6. Clean Baseline Capture:** Verify `git status --porcelain` is clean and capture `baselineHeadSha = git rev-parse HEAD` and `baselineBranch = git branch --show-current`. If dirty → stop and remediate before Red Phase.

**3b. Red Phase:** Write failing test using `edit` / `write` / `morph_edit` → run with `adv_run_test phase:'red'` → show red evidence.

**3c. Green Phase:** Implement using `edit` / `write` / `morph_edit` → run with `adv_run_test phase:'green'` → if fails: retry protocol → show green evidence.

**3c.3. Verify Phase (optional):** Run final task-scope check with `adv_run_test phase:'verify'` when distinct from green evidence. Phase is descriptive metadata, not gate enforcement.

**3c.4. Incremental Verification:** Run build/tests/lint for task scope → if fails: retry protocol → only proceed to checkpoint after pass.

**3c.5. Checkpoint:** Call `adv_task_checkpoint` with:

- `taskId: <id>`
- `workdir: <effective workdir>`
- `changeId: <change-id>` (assertion — must match task owner)
- `expectedBranch: change/{change-id}` (or configured change branch)
- `expectedHeadSha: <baselineHeadSha>`
- `verification: <task verification summary>`

- `{status: 'clean' | 'committed', checkpointRecorded:true}` → `taskCompletedSignal` was fired and verified; the task is already `done`; proceed to 3c.55.
- `{status: 'clean' | 'committed', checkpointRecorded:false}` → workflow completion recording failed even though git checkpoint succeeded. Retry `adv_task_checkpoint`; if it persists, surface remediation before declaring task done.
- `{status: 'failed', classification: 'SEMANTIC'}` → diagnose, re-run checkpoint (retry budget applies).
- `{classification: 'ENVIRONMENTAL'}` → escalate via `question` tool; keep task `in_progress`.
- `{classification: 'TRANSIENT'}` → tool already retried internally; surface remaining failure as SEMANTIC or ENVIRONMENTAL per its follow-up classification.

**3c.55. Post-delegation P23 diff-scan:** If task was delegated to a sub-agent, diff the sub-agent's touched files against the pre-delegation baseline. For each touched file, check same-pattern local subsystem for identical defect/quality patterns (P23 campsite-rule scan). If same-pattern issues found and fix is small/safe/local → apply inline. If fix would expand scope → document in `follow_ups`, do NOT auto-fix. Skip this step for inline tasks.

**3d. Complete:** assert `adv_task_checkpoint` returned `checkpointRecorded:true`; do not call `adv_task_update status: "done"` in normal apply flow. Show evidence from the checkpoint result and continue.

**3e. Loop:** `adv_task_ready` → if ready tasks remain, **GOTO 3a**. REPEAT until the ready queue is empty.

You MUST continue to the next ready task without pausing. You MUST NOT pause between tasks, between sections, or after progress displays. Auto-continue is mandatory per `rq-autonomy01` / `rq-autonomy01.4`.

#### Allowed exit conditions (ONLY these end the loop)

1. `adv_task_ready` returns empty (all ready tasks done) → advance to Phase 5 verification.
2. Doom-loop triggered (3 failed SEMANTIC retries on task) → `[ADV:BLOCKED]` + user `question`.
3. ENVIRONMENTAL blocker (missing dep, config, credential) → escalate via `question`.
4. User-requested cancellation → `adv_task_cancel` flow.
5. Scope expansion requiring re-entry → `adv_change_reenter` flow.
6. Checkpoint failure with ENVIRONMENTAL or unresolved SEMANTIC classification → escalate via `question`.

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

Task state is visible via `_contextSnapshot` and `adv_task_list` — do not emit a per-task status block. TodoWrite projection is exempt — it is a UI surface over the task graph, not a chat status block.

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

> **{change-id}**
> execution ✓ → acceptance
>
> → `/adv-review {change-id}`
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
