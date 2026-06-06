# Advance Delivery

> **Version:** 1.3.2
> **Updated:** 2026-05-08

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

### Evidence Tool Value Justification

**ID:** `rq-ADVEXEC04` | **Priority:** **[MUST]**

ADV command and instruction guidance MUST justify prescribed evidence tooling by durable user value. `adv_run_test` is the normal inline TDD path because it provides executable proof for the current agent run; durable workflow evidence is the final task verification claim recorded by `taskCompletedSignal`. Retired fallback evidence tools MUST NOT be reintroduced as ordinary inline-TDD ceremony.

**Tags:** `workflow`, `execution`, `tdd`, `evidence`, `value`

#### Scenarios

**adv_run_test prescription names value categories** (`rq-ADVEXEC04.1`)

**Given:**
- /adv-apply or agent guidance prescribes adv_run_test for inline TDD

**When:** The guidance is inspected

**Then:**
- It explains executable proof value
- It explains how durable evidence is recorded through final task completion verification
- It does not claim adv_run_test alone persists durable workflow evidence

---

### Prescriptive Tool Guidance Must Pass Value-vs-Burden Test

**ID:** `rq-ADVEXEC05` | **Priority:** **[MUST]**

New prescriptive ADV execution guidance MUST state the durable value category that justifies its burden. Valid categories include reproducibility, durable audit, recovery, safety, validation, and governance. Guidance that only adds ceremony without one of these values MUST NOT be added.

**Tags:** `workflow`, `execution`, `governance`, `value`, `burden`

#### Scenarios

**Prescriptive guidance includes value category** (`rq-ADVEXEC05.1`)

**Given:**
- A command or agent instruction tells the agent it MUST use a specific tool or workflow step

**When:** The guidance is reviewed

**Then:**
- The guidance states at least one durable value category
- The category explains why the burden is useful to the user or future recovery

**Ceremony without durable value is rejected** (`rq-ADVEXEC05.2`)

**Given:**
- Proposed guidance adds an extra tool call or diagnostic surface

**When:** It does not improve reproducibility, durable audit, recovery, safety, validation, or governance

**Then:**
- The guidance is not added
- Existing guidance is kept focused on value-producing evidence

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

### Checkpoint Workflow Recording

**ID:** `rq-checkpointLedger01` | **Priority:** **[MUST]**

adv_task_checkpoint MUST surface workflow completion recording failures via `checkpointRecorded: false` when the git commit (or clean-tree result) succeeds but `taskCompletedSignal` is not durably reflected in workflow state. /adv-apply MUST treat `checkpointRecorded: false` as blocking task completion: the agent runs adv_task_show, retries the checkpoint recording path, and only proceeds after `checkpointRecorded: true` is observed. Returning `checkpointRecorded: false` MUST include actionable remediation guidance and MUST NOT be silently treated as success.

**Tags:** `checkpoint`, `ledger`, `task-run`, `apply-flow`, `recovery`

#### Scenarios

**Committed checkpoint with ledger failure surfaces checkpointRecorded:false** (`rq-checkpointLedger01.1`)

**Given:**
- An /adv-apply task has dirty tree changes that pass branch and HEAD guards
- The git commit phase succeeds but the taskCompletedSignal completion record is not durably reflected in workflow state

**When:** adv_task_checkpoint executes in mode complete or cancel

**Then:**
- The tool returns status `committed` with the new commit sha
- The tool returns `checkpointRecorded: false` to indicate the workflow completion record was not durably reflected
- The remediation guidance names adv_task_show and a retry path for checkpoint recording recovery
- The result MUST NOT be silently treated as task completion

**Clean-tree checkpoint with ledger failure surfaces checkpointRecorded:false** (`rq-checkpointLedger01.2`)

**Given:**
- An /adv-apply task has no dirty tree changes
- The clean-tree path executes but the taskCompletedSignal completion record is not durably reflected in workflow state

**When:** adv_task_checkpoint executes in mode complete

**Then:**
- The tool returns status `clean` with no new commit
- The tool returns `checkpointRecorded: false` to indicate the workflow completion record was not durably reflected
- The remediation guidance names adv_task_show and a retry path for checkpoint recording recovery

**Apply guidance treats checkpointRecorded:false as blocking task completion** (`rq-checkpointLedger01.3`)

**Given:**
- An /adv-apply task has received `checkpointRecorded: false` from adv_task_checkpoint

**When:** The agent prepares to mark the task done

**Then:**
- The agent MUST run adv_task_show to inspect workflow task state
- The agent MUST retry the checkpoint recording path before treating the task as done
- The agent MUST NOT call adv_task_update with status done in normal apply flow
- Existing doom-loop and blocker semantics apply if recovery cannot be achieved within the retry budget

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
- The commit message MUST have a Conventional Commit-compatible subject line (`chore(adv): checkpoint {taskId}` for complete mode, `chore(adv): cancel checkpoint {taskId}` for cancel mode)
- The commit body MUST include `Change: {changeId}`
- The commit body MUST include `Task: {taskId}`
- The commit body MUST include `Mode: {mode}`
- When cancellation `reason` is present, the body MUST include `Reason: {reason}`
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

### Archive Contract Proof Gate

**ID:** `rq-contractArchiveProof01` | **Priority:** **[MUST]**

When a change has `change.contract`, archive MUST verify structural contract proof before bundle creation or existing-bundle recovery. Archive checks proof completeness rather than re-reviewing product semantics. Passing contract archives include `CONTRACT_TRACEABILITY.md` in the archive bundle.

**Tags:** `archive`, `contract`, `traceability`, `validation`

#### Scenarios

**Missing review matrix blocks archive** (`rq-contractArchiveProof01.1`)

**Given:**
- A change has change.contract with required contract items
- contract.reviewMatrix is absent

**When:** adv_change_archive is invoked

**Then:**
- The archive is rejected with a contract proof error
- No archive bundle is written

**Unresolved proof status blocks archive** (`rq-contractArchiveProof01.2`)

**Given:**
- A required contract item has a review matrix row

**When:** The row status is fail, violated, or unknown

**Then:**
- adv_change_archive rejects the archive
- The response identifies contract proof errors for remediation

**Passing proof writes traceability artifact** (`rq-contractArchiveProof01.3`)

**Given:**
- All required contract items have passing, respected, or justified not_applicable proof rows

**When:** adv_change_archive creates the archive bundle

**Then:**
- The bundle includes CONTRACT_TRACEABILITY.md
- The artifact lists contract item IDs, task refs, proof status, evidence, and amendment audit entries

**Existing bundle retry does not bypass proof gate** (`rq-contractArchiveProof01.4`)

**Given:**
- An archive bundle already exists on disk for a non-archived change

**When:** adv_change_archive is retried

**Then:**
- Contract proof validation runs before existing-bundle recovery
- A stale or incomplete proof state still blocks the retry

---
