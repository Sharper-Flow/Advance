# Advance Delivery

> **Version:** 1.0.0
> **Updated:** 2026-04-28

## Purpose

Capability: Execution-layer contract for ADV — TDD execution routing, task-run ledger, bulk operations, delta operations, and per-task checkpoint commits. Split from `advance` capability; absorbs former `contract-system` and `checkpoint-commits` capabilities.

## Requirements

### Canonical Apply Tool Path for Inline TDD

**ID:** `rq-ADVEXEC01` | **Priority:** **[MUST]**

For ordinary inline TDD work, /adv-apply MUST explicitly name editing tools (edit, write, morph_edit where appropriate) as the correct path for creating or modifying test files, and MUST explicitly name adv_run_test as the primary red/green test execution path.

**Tags:** `workflow`, `execution`, `tdd`, `tool-routing`

#### Scenarios

**Red and green contract lines name adv_run_test** (`rq-ADVEXEC01.1`)

**Given:**
- The /adv-apply command contract is present

**When:** Its Red and Green phase guidance is inspected

**Then:**
- The Red phase line names adv_run_test with phase 'red'
- The Green phase line names adv_run_test with phase 'green'

**Apply contract names editing tools for test-file changes** (`rq-ADVEXEC01.2`)

**Given:**
- The /adv-apply command contract is present

**When:** Its ordinary inline-TDD file-editing guidance is inspected

**Then:**
- At least one supported editing tool is named for test-file creation or modification
- Raw shell file-writing is not presented as the normal path

**Fallback framing keeps adv_task_evidence secondary** (`rq-ADVEXEC01.3`)

**Given:**
- The /adv-apply command or adjacent remediation guidance references adv_task_evidence

**When:** The evidence workflow is described

**Then:**
- adv_task_evidence is described as fallback or externally captured evidence path
- It is not described as the primary inline-TDD execution path

---

### Apply Contract Regression Anchors

**ID:** `rq-ADVEXEC02` | **Priority:** **[MUST]**

The repository MUST maintain asset or regression tests that fail when canonical inline-TDD path wording is removed from /adv-apply or when shell-authored test-file content is reintroduced as normal-path guidance.

**Tags:** `workflow`, `execution`, `regression`, `tool-routing`

#### Scenarios

**Asset tests guard canonical path wording** (`rq-ADVEXEC02.1`)

**Given:**
- The /adv-apply contract is covered by asset tests

**When:** Canonical Red/Green adv_run_test wording is removed

**Then:**
- The asset or regression suite fails

**Asset tests guard anti-pattern row** (`rq-ADVEXEC02.2`)

**Given:**
- The /adv-apply contract is covered by asset tests

**When:** The shell-authored test-file anti-pattern row is removed or weakened

**Then:**
- The asset or regression suite fails

---

### Runtime Enforcement for Inline-TDD Bash Workarounds

**ID:** `rq-ADVEXEC03` | **Priority:** **[MUST]**

During active inline-TDD work, runtime enforcement MUST treat shell-authored test-file content and direct test-runner bash differently. Shell-authored test-file content targeting test-glob paths is prohibited and MUST be blocked. Direct test-runner bash without a matching recent adv_run_test signal MUST emit an advisory but MUST NOT be blocked. These are firm defaults, not feature-flagged rollout modes.

**Tags:** `workflow`, `execution`, `runtime`, `guard`, `tdd`

#### Scenarios

**Shell-authored test-file content is blocked** (`rq-ADVEXEC03.1`)

**Given:**
- A change is active
- An inline-TDD task is in progress
- A bash command writes file content to a test-glob path

**When:** The bash command is checked by runtime enforcement

**Then:**
- The command is blocked
- The error tells the agent to use editing tools and adv_run_test instead

**Direct test-runner bash is advisory only** (`rq-ADVEXEC03.2`)

**Given:**
- A change is active
- An inline-TDD task is in progress
- A bash command runs a test runner without a matching recent adv_run_test signal

**When:** The bash command is checked by runtime enforcement

**Then:**
- The command is not blocked
- An advisory is emitted directing the agent to prefer adv_run_test

---

### Filter-Aware Bulk Close

**ID:** `rq-bulkClose01` | **Priority:** **[MUST]**

adv_change_bulk_close must support closing multiple changes in a single approved tool call, using either an explicit ID list or filter-based selection, with fail-all semantics on invalid targets and a structured result envelope.

**Tags:** `workflow`, `changes`, `bulk-operations`

#### Scenarios

**Explicit ID list close** (`rq-bulkClose01.1`)

**Given:**
- A list of valid active change IDs

**When:** adv_change_bulk_close is called with kind: 'explicit' and those IDs

**Then:**
- All specified changes are closed with the provided reason
- The result envelope lists each change with success or error status
- If reason: 'superseded', at most one survivor change ID may be provided

**Filter-based close requires explicit filter** (`rq-bulkClose01.2`)

**Given:**
- A repository with changes in various states

**When:** adv_change_bulk_close is called with kind: 'filter'

**Then:**
- The call must supply either a status filter (draft or pending) OR a staleness filter (createdBefore or lastActivityBefore)
- No implicit default status is applied

**Fail-all on protected targets** (`rq-bulkClose01.3`)

**Given:**
- A bulk close request targeting a mix of valid and invalid changes

**When:** Any resolved target is active, archived, closed, nonexistent, ambiguous, or duplicated

**Then:**
- The entire request fails before any mutation
- The error identifies every invalid target and its specific failure reason

**Empty match is a structured error** (`rq-bulkClose01.4`)

**Given:**
- A filter-based bulk close that matches zero changes

**When:** The selection resolves

**Then:**
- A structured error is returned with success: false
- The message clearly states that no changes matched the filter
- No silent no-op occurs

**Result envelope mirrors task-cancel pattern** (`rq-bulkClose01.5`)

**Given:**
- A bulk close request that partially or fully succeeds

**When:** The result is returned

**Then:**
- The envelope contains success, closed (count), results (array of per-change entries), and message
- Each per-change entry includes changeId, success, and optional error

**No hard delete** (`rq-bulkClose01.6`)

**Given:**
- Any bulk close call

**When:** The operation completes

**Then:**
- Changes are closed (status moved to closed) but never purged or hard-deleted
- Audit metadata is preserved for every closed change

**Existing close signature unchanged** (`rq-bulkClose01.7`)

**Given:**
- The existing adv_change_close tool

**When:** Inspected after this change ships

**Then:**
- Its signature and behavior remain identical to before adv_change_bulk_close was added

---

### Durable Task-Run Lifecycle Ledger

**ID:** `rq-taskRunLedger01` | **Priority:** **[MUST]**

/adv-apply task execution must maintain a Temporal-owned task-run ledger that records lifecycle phase, required next action, resume hint, evidence, verification, checkpoint, and blocker/failure events without moving OpenCode tool/model/file-edit execution into Temporal activities. The ledger must preserve existing inline TDD, checkpoint-before-done, and no-pause apply-loop semantics.

**Tags:** `tasks`, `temporal`, `resumability`, `ledger`, `apply`

#### Scenarios

**Task-run status exposes safe resume point** (`rq-taskRunLedger01.1`)

**Given:**
- An /adv-apply task has started or partially completed

**When:** adv_task_run_status is called for that task

**Then:**
- The response includes the current phase
- The response includes requiredNextAction and resumeHint
- The response summarizes baseline, evidence, verification, checkpoint, attempts, and recent events when present

**Evidence and checkpoint events are linked to the ledger** (`rq-taskRunLedger01.2`)

**Given:**
- An /adv-apply task records red evidence, green evidence, verification, or checkpoint result

**When:** The corresponding tool path succeeds

**Then:**
- A task-run ledger event is recorded with a deterministic idempotency key
- Duplicate idempotency keys do not append duplicate events or re-advance phase
- The existing tdd_evidence and checkpoint outputs remain intact

**Ledger survives Temporal continue-as-new** (`rq-taskRunLedger01.3`)

**Given:**
- A change workflow has task_runs state

**When:** The workflow continues as new to bound history size

**Then:**
- The task_runs state is included in the seed state
- Handler-level idempotency data survives workflow-run rollover
- No task-run phase or resume information is silently reset

**Temporal remains the runtime state authority** (`rq-taskRunLedger01.4`)

**Given:**
- Task-run lifecycle state is persisted

**When:** The runtime reads or mutates task-run state

**Then:**
- The authoritative runtime state lives in Temporal workflow state
- Disk artifacts may support recovery or tests but are not the task-run runtime source of truth
- No SQLite or replacement local database is introduced for task-run state

**No direct Temporal execution of OpenCode side effects in v1** (`rq-taskRunLedger01.5`)

**Given:**
- A task-run event represents evidence, verification, or checkpoint outcome

**When:** The event is recorded

**Then:**
- OpenCode agents still perform file edits, shell/test commands, model calls, sub-agent calls, and git commits
- Temporal records externally supplied results rather than directly executing those side effects

**Apply-loop autonomy is preserved** (`rq-taskRunLedger01.6`)

**Given:**
- A task-run ledger indicates the next resume action

**When:** /adv-apply resumes or continues execution

**Then:**
- The ledger guides the agent to the next apply-loop step
- No new user pause or approval checkpoint is introduced
- Existing blocker, doom-loop, cancellation, re-entry, and acceptance checkpoints remain unchanged

---

### Typed Delta Operations

**ID:** `rq-deltaOps01` | **Priority:** **[MUST]**

The delta system MUST enforce type safety on modifications and support rename operations on requirements. Modifications must reject unknown keys; renames must update title (and optionally id) while preserving all other fields.

**Tags:** `contract-system`, `delta`, `schema`

#### Scenarios

**Reject unknown keys on modify** (`rq-deltaOps01.1`)

**Given:**
- A DeltaModifySchema object with unknown keys

**When:** The schema is parsed by Zod

**Then:**
- The parse operation MUST fail with a validation error

**Successful rename preserves other fields** (`rq-deltaOps01.2`)

**Given:**
- An existing requirement
- A rename delta targeting its ID

**When:** The delta is applied

**Then:**
- The requirement's title is updated
- All other fields are preserved

---

### Verified Checkpoint Ordering

**ID:** `rq-cc01` | **Priority:** **[MUST]**

Checkpoint commits MUST only represent verified task completion state. Verification runs before checkpoint, not after.

**Tags:** `checkpoint`, `ordering`, `verification`, `apply-flow`

#### Scenarios

**Complete-mode checkpoint requires verification** (`rq-cc01.1`)

**Given:**
- A task is in the green phase with file changes
- The agent calls `adv_task_checkpoint` with `mode: "complete"`

**When:** The checkpoint tool evaluates the request

**Then:**
- If `verification` is absent or empty, the checkpoint MUST fail with `errorClass: SEMANTIC`
- If `verification` is present, the checkpoint proceeds to guard validation

**Red-phase checkpoint prohibited** (`rq-cc01.2`)

**Given:**
- A task has failing tests or unverified changes

**When:** The agent attempts checkpoint before green phase

**Then:**
- The checkpoint MUST NOT run
- The agent retries or escalates per doom-loop protocol

---

### Scope Guard

**ID:** `rq-cc02` | **Priority:** **[MUST]**

Checkpoint commits MUST be scoped to the correct change worktree. Branch and HEAD guards are fail-closed and run before staging.

**Tags:** `checkpoint`, `guard`, `worktree`, `scope`

#### Scenarios

**Branch mismatch blocks checkpoint** (`rq-cc02.1`)

**Given:**
- `expectedBranch` is provided and does not match `git branch --show-current`

**When:** The checkpoint tool validates context

**Then:**
- The checkpoint MUST fail with structured mismatch details (`expectedBranch`, `actualBranch`)
- Remediation guidance MUST include the correct branch name and checkout command
- No files are staged or committed

**HEAD mismatch blocks checkpoint** (`rq-cc02.2`)

**Given:**
- `expectedHeadSha` is provided and does not match `git rev-parse HEAD`

**When:** The checkpoint tool validates context

**Then:**
- The checkpoint MUST fail with structured mismatch details (`expectedHeadSha`, `actualHeadSha`)
- Remediation guidance MUST include the correct HEAD SHA
- No files are staged or committed

**Change identity derived from task** (`rq-cc02.3`)

**Given:**
- A valid `taskId` is provided

**When:** The checkpoint tool resolves the change context

**Then:**
- The tool MUST call `store.tasks.show(taskId)` to derive the owning `changeId`
- If an optional caller `changeId` is provided, it MUST match the derived value
- Mismatch MUST fail with `errorClass: SEMANTIC`

---

### Audit Metadata

**ID:** `rq-cc03` | **Priority:** **[MUST]**

Checkpoint commits MUST include machine-readable metadata in the commit message for audit and rollback purposes.

**Tags:** `checkpoint`, `metadata`, `audit`, `commit-message`

#### Scenarios

**Structured commit message** (`rq-cc03.1`)

**Given:**
- A checkpoint succeeds

**When:** The commit is created

**Then:**
- The commit message MUST have a terse subject line (`task({taskId}): {mode}`)
- The commit body MUST include `Change: {changeId}`
- The commit body MUST include `Task: {taskId}`
- The commit body MUST include `Mode: {mode}`
- When `verification` is present, the body MUST include `Verification: {verification}`
- The message MUST be created with multiple `-m` args for subject + body/trailers

**Clean tree returns without commit** (`rq-cc03.2`)

**Given:**
- The working tree has no changes

**When:** The checkpoint tool runs

**Then:**
- No commit is created
- The result MUST include `status: "clean"`
- Branch/HEAD guards still validate when guard params are active

---

### Dirty-Baseline Protection

**ID:** `rq-cc04` | **Priority:** **[MUST]**

The `/adv-apply` flow MUST capture a clean baseline before the Red Phase to ensure checkpoint commits represent only the task's incremental changes.

**Tags:** `checkpoint`, `baseline`, `apply-flow`, `dirty-tree`

#### Scenarios

**Baseline capture before Red Phase** (`rq-cc04.1`)

**Given:**
- A task is starting in `/adv-apply`

**When:** The agent begins the task workflow

**Then:**
- The agent MUST verify the working tree is clean or checkpoint any pre-existing changes before entering Red Phase
- The Red Phase MUST begin from a known-clean or checkpointed state

**Incremental verification before checkpoint** (`rq-cc04.2`)

**Given:**
- A task has completed the Green Phase

**When:** The agent prepares to checkpoint

**Then:**
- The agent MUST run incremental verification (tests, typecheck, lint) before calling `adv_task_checkpoint`
- Verification output is passed as the `verification` argument

---

### No-Publication Authority

**ID:** `rq-cc05` | **Priority:** **[MUST]**

Checkpoint commits are local rollback/audit points only. Publication, merge, and archive remain separate workflows requiring explicit user approval.

**Tags:** `checkpoint`, `publication`, `authority`, `archive`

#### Scenarios

**Checkpoint commits are not published** (`rq-cc05.1`)

**Given:**
- A checkpoint commit exists in a change worktree

**When:** The agent considers next steps

**Then:**
- The agent MUST NOT push the checkpoint commit to a remote
- The agent MUST NOT merge the checkpoint commit to the default branch
- The agent MUST NOT treat the checkpoint as an archived release

**Archive is the separate publication path** (`rq-cc05.2`)

**Given:**
- All tasks are done and the acceptance gate is complete

**When:** The user requests archive

**Then:**
- `/adv-archive` runs Phase 9 Git Finalization as the publication path
- Worktree cleanup is blocked until the branch is merged or the archive process completes
- The user MUST explicitly approve archive sign-off

---
