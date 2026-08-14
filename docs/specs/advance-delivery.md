# Advance Delivery

> **Version:** 1.6.0
> **Updated:** 2026-07-28

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

### Evidence Tool Value Justification

**ID:** `rq-ADVEXEC04` | **Priority:** **[MUST]**

ADV command and instruction guidance MUST justify prescribed evidence tooling by durable user value. adv_run_test is the normal inline TDD path because it provides executable proof for the current agent run; durable task evidence is the final task verification claim recorded by the disk mutation path. Retired fallback evidence tools MUST NOT be reintroduced as ordinary inline-TDD ceremony.

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

### Normalized Evidence Plan Compatibility Boundary and Advisory Proxies

**ID:** `rq-ADVEXEC06` | **Priority:** **[MUST]**

ADV execution guidance MUST align with the normalized task evidence plan (rq-TDD013evp). The plan's policy and proof target are the structural compatibility boundary for task execution; non-test routes for logic-bearing work require a bounded rationale and a linked review conclusion. Test-quality proxies (assertion density, mock surface, coverage, flake indicators) are advisory inputs only and MUST NOT be used as independent authority for task completion, gate progression, or acceptance. Legacy in-flight tasks remain readable via explicit compatibility provenance without heuristic cutover.

**Tags:** `workflow`, `execution`, `evidence`, `structural-correctness`

#### Scenarios

**Quality proxies are advisory only** (`rq-ADVEXEC06.1`)

**Given:**
- A task has low assertion density, high mock surface, or low file-level coverage

**When:** Evidence is evaluated

**Then:**
- The quality signal is surfaced as advisory input
- The signal does not by itself complete or block the task or gate

**Non-test route for logic-bearing work requires rationale and review conclusion** (`rq-ADVEXEC06.2`)

**Given:**
- A behavior-critical task selects a non-test evidence route

**When:** The task is executed and completed

**Then:**
- A bounded rationale is recorded in the evidence plan
- A linked review conclusion is recorded before completion

**Legacy tasks remain readable with explicit compatibility** (`rq-ADVEXEC06.3`)

**Given:**
- An in-flight task predates the normalized evidence-plan model

**When:** The task is executed or completed

**Then:**
- The task is normalized on read with compatibility `legacy`
- No heuristic cutover is performed

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

### Checkpoint change projection recording blocks task completion when recording fails

**ID:** `rq-checkpointLedger01` | **Priority:** **[MUST]**

adv_task_checkpoint MUST surface change projection completion recording failures via `checkpointRecorded: false` when the git commit (or clean-tree result) succeeds but `taskCompletedMutation` is not durably reflected in change projection state. /adv-apply MUST treat `checkpointRecorded: false` as blocking task completion: the agent runs adv_task_show, retries the checkpoint recording path, and only proceeds after `checkpointRecorded: true` is observed. Returning `checkpointRecorded: false` MUST include actionable remediation guidance and MUST NOT be silently treated as success.

**Tags:** `checkpoint`, `ledger`, `task-run`, `apply-flow`, `recovery`

#### Scenarios

**Committed checkpoint with ledger failure surfaces checkpointRecorded:false** (`rq-checkpointLedger01.1`)

**Given:**
- An /adv-apply task has dirty tree changes that pass branch and HEAD guards
- The git commit phase succeeds but the taskCompletedMutation completion record is not durably reflected in change projection state

**When:** adv_task_checkpoint executes in mode complete or cancel

**Then:**
- The tool returns status `committed` with the new commit sha
- The tool returns `checkpointRecorded: false` to indicate the change projection completion record was not durably reflected
- The remediation guidance names adv_task_show and a retry path for checkpoint recording recovery
- The result MUST NOT be silently treated as task completion

**Clean-tree checkpoint with ledger failure surfaces checkpointRecorded:false** (`rq-checkpointLedger01.2`)

**Given:**
- An /adv-apply task has no dirty tree changes
- The clean-tree path executes but the taskCompletedMutation completion record is not durably reflected in change projection state

**When:** adv_task_checkpoint executes in mode complete

**Then:**
- The tool returns status `clean` with no new commit
- The tool returns `checkpointRecorded: false` to indicate the change projection completion record was not durably reflected
- The remediation guidance names adv_task_show and a retry path for checkpoint recording recovery

**Apply guidance treats checkpointRecorded:false as blocking task completion** (`rq-checkpointLedger01.3`)

**Given:**
- An /adv-apply task has received `checkpointRecorded: false` from adv_task_checkpoint

**When:** The agent prepares to mark the task done

**Then:**
- The agent MUST run adv_task_show to inspect change projection task state
- The agent MUST retry the checkpoint recording path before treating the task as done
- The agent MUST NOT call adv_task_update with status done in normal apply flow
- Existing doom-loop and blocker semantics apply if recovery cannot be achieved within the retry budget

---

### Archive Completeness Validation

**ID:** `rq-archiveValidate01` | **Priority:** **[MUST]**

adv_change_archive MUST run validateChange before creating the archive bundle. Validation errors block the archive; warnings are included in the response but do not block. Validation runs before the idempotent bundle-existence check so that retries also validate.

**Tags:** `workflow`, `archive`, `validation`, `completeness`

#### Scenarios

**Validation errors block archive** (`rq-archiveValidate01.1`)

**Given:**
- A change passing archive preflight (all tasks done/cancelled, all gates satisfied)
- validateChange returns one or more errors

**When:** adv_change_archive is invoked

**Then:**
- The archive is rejected with a structured error response
- The error response includes validator error codes and messages
- No archive bundle is written

**Validation warnings do not block archive** (`rq-archiveValidate01.2`)

**Given:**
- A change passing archive preflight
- validateChange returns warnings but no errors

**When:** adv_change_archive is invoked

**Then:**
- Validation warnings are included in the archive response
- The archive proceeds normally

**Idempotent retry still validates** (`rq-archiveValidate01.3`)

**Given:**
- A previous archive attempt wrote a bundle but failed status transition
- The bundle exists on disk

**When:** adv_change_archive is invoked again

**Then:**
- validateChange runs before the bundle-existence short-circuit
- A previously-written bundle does not bypass validation

---

### Archive Contract Proof Gate

**ID:** `rq-contractArchiveProof01` | **Priority:** **[MUST]**

When a change has change.contract, archive MUST verify structural contract proof before bundle creation or existing-bundle recovery. Archive checks proof completeness rather than re-reviewing product semantics. Passing contract archives include CONTRACT_TRACEABILITY.md in the archive bundle.

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

### adv_change_show accepts opt-in include flags

**ID:** `rq-advChangeShowInclude01` | **Priority:** **[MUST]**

adv_change_show must accept an optional include argument with shape { ledger?: boolean, snapshot?: boolean, readyTasks?: boolean, readyTasksLimit?: number }. When include is omitted, the response shape is unchanged (backward compatible). When include.snapshot is true, the rendered context snapshot is attached as top-level _contextSnapshot, matching the mutation-tool convention. When include.ledger is true, the in-progress task's TaskRunState (or null) is attached as _ledger. When include.readyTasks is true, the unblocked ready queue is attached as _readyTasks (top-N by priority then created_at; default 10, max 50) along with _readyTasksMeta. Cross-project target_path routing is preserved.

**Tags:** `delivery`, `tools`, `context-emission`

#### Scenarios

**Default behavior preserved when include is omitted** (`rq-advChangeShowInclude01.1`)

**Given:**
- A change exists with completed and pending tasks

**When:** adv_change_show is called without include

**Then:**
- The response does NOT contain _contextSnapshot, _ledger, or _readyTasks
- All previously documented fields remain unchanged

**include.snapshot attaches _contextSnapshot** (`rq-advChangeShowInclude01.2`)

**Given:**
- A change exists

**When:** adv_change_show is called with include: { snapshot: true }

**Then:**
- The response includes top-level _contextSnapshot string
- The snapshot uses the same formatter as live system-block emission

**include.readyTasksLimit accepts 1-50** (`rq-advChangeShowInclude01.3`)

**Given:**
- A request includes readyTasks:true with readyTasksLimit:N

**When:** Zod validates the args

**Then:**
- Values 1-50 inclusive are accepted
- Values <1 or >50 are rejected at the schema layer

---

### Loop ledger readback via adv_change_show include flags

**ID:** `rq-loopLedger01` | **Priority:** **[MUST]**

adv_change_show MUST expose an opt-in typed loop-ledger readback over existing ADV loop evidence. include.loopLedger:true attaches a compact summary as _loopLedger (version, summary: totalEntries, byKind, byVerdict, latestStatus, sourceTotals, retryFailureCount, inconclusiveCount). include.loopLedgerDetails:true additionally attaches bounded detailed entries; include.loopLedgerLimit bounds the detail slice and MUST accept 1-100 inclusive, default to 20, and reject or clamp values outside 1-100. The legacy include.ledger flag is unchanged: when requested it still attaches _ledger: null and MUST NOT be aliased to the loop ledger. The readback is a derived projection over authoritative sources (task attempts/error_recovery, sub-agent reports, test_runs, ci_check targets) and is evidence-only: it MUST NOT authorize, complete, or block any task, contract item, report, or gate (AC5), and MUST NOT change retry budgets or autonomy (AC7). test_runs appear only as source refs (kind test_run) and MUST NOT be used as an attempt-count source; UNKNOWN or routing-only verification triage maps to verdict inconclusive and MUST NOT increment retryFailureCount. The readback MUST work for cross-project target_path reads and for terminal changes via the disk projection without a live workflow.

**Tags:** `delivery`, `tools`, `context-emission`, `loop-ledger`, `projection`

#### Scenarios

**include.loopLedger attaches compact summary only** (`rq-loopLedger01.1`)

**Given:**
- A change has task-attempt and sub-agent-report loop evidence

**When:** adv_change_show is called with include: { loopLedger: true }

**Then:**
- The response includes _loopLedger with version and summary
- summary exposes totalEntries, byKind, byVerdict, latestStatus, sourceTotals, retryFailureCount, inconclusiveCount
- _loopLedger.details is omitted (compact default)

**include.loopLedgerDetails opts into bounded details** (`rq-loopLedger01.2`)

**Given:**
- A request includes loopLedger:true with loopLedgerDetails:true and loopLedgerLimit:N

**When:** adv_change_show projects the readback

**Then:**
- _loopLedger.details contains at most N entries
- detailsLimit equals N and detailsTruncated reflects overflow
- loopLedgerLimit accepts 1-100 inclusive, defaults to 20, and rejects or clamps values outside 1-100

**Legacy include.ledger is unchanged** (`rq-loopLedger01.3`)

**Given:**
- adv_change_show is called with include: { ledger: true } only

**When:** The response is built

**Then:**
- _ledger is attached and equals null
- _loopLedger is NOT attached unless loopLedger/loopLedgerDetails is also requested
- include.ledger is not aliased to the loop ledger

**Loop ledger is evidence-only and non-authoritative** (`rq-loopLedger01.4`)

**Given:**
- A ledger entry reports verdict pass for a task or report

**When:** Task, contract, report, or gate readiness is evaluated

**Then:**
- The entry does NOT complete or unblock any task, contract item, report, or gate (AC5)
- Retry budgets and autonomy are unchanged (AC7)
- Vector/ML similarity is advisory-only and remains out of scope

**test_runs are evidence refs; UNKNOWN triage is inconclusive** (`rq-loopLedger01.5`)

**Given:**
- A task has test_runs but no recorded retry attempts, or a verification-triage report has error_class UNKNOWN or status inconclusive

**When:** The loop ledger is projected

**Then:**
- test_runs contribute only source refs of kind test_run, never attempt counts
- A task with test_runs but no attempts is not a retry loop
- UNKNOWN/routing-only or inconclusive triage yields verdict inconclusive and does NOT increment retryFailureCount

**Readback is target_path and terminal safe** (`rq-loopLedger01.6`)

**Given:**
- include.loopLedger is requested for a cross-project target_path read or for an archived/closed change

**When:** adv_change_show builds the response

**Then:**
- _loopLedger is returned from the target store or terminal disk projection
- No live/running workflow is required for the read

---

### adv_status accepts optional view selector

**ID:** `rq-advStatusView01` | **Priority:** **[MUST]**

adv_status must accept an optional view argument of type 'summary' | 'health' | 'changes' | 'hygiene' (default: 'summary'). The summary view returns specs.count, simplified changes.recent (id+title+recency+minutesSinceActivity only), recommendations, projection-health status, and worktree_count — explicitly omitting hygiene-archaeology fields like _healthSnapshot. The health view returns full projection/runtime diagnostics and metrics counters. The changes view returns full status.changes detail. The hygiene view returns _healthSnapshot, opencode_session_debt detail, project_metadata, recommendations, and migration_status. The formatted block is preserved across all views.

**Tags:** `delivery`, `tools`, `context-emission`

#### Scenarios

**Default view is summary** (`rq-advStatusView01.1`)

**Given:**
- adv_status is called with no view arg

**When:** The tool runs

**Then:**
- The response includes view:'summary'
- Hygiene archaeology fields (_healthSnapshot, opencode_session_debt, diagnostics) are absent

**Health view exposes full diagnostics** (`rq-advStatusView01.2`)

**Given:**
- adv_status is called with view:'health'

**When:** The tool runs

**Then:**
- The response includes projection/runtime health, opencode_session_debt, and diagnostics
- Summary-only fields (projection-health summary, worktree_count) are absent

---

### Per-phase metrics counters surfaced via health view

**ID:** `rq-advMetricsBaseline01` | **Priority:** **[MUST]**

The plugin must maintain in-memory counters for the session: adv_tool_calls (total adv_* tool invocations), adv_tool_call_count_by_name (Record<string, number> breakdown), system_block_bytes (cumulative bytes appended to output.system[0]), subagent_spawns (count of `task` tool invocations from main), and wall_time_ms. Counters reset on plugin init. They are surfaced as the metrics field on adv_status view:'health'. Per JC-1, persistence across sessions is OUT of scope for this baseline.

**Tags:** `delivery`, `metrics`, `observability`

#### Scenarios

**Counters reset on plugin init** (`rq-advMetricsBaseline01.1`)

**Given:**
- The plugin factory runs

**When:** resetMetrics is called

**Then:**
- All five counters are zero
- adv_tool_call_count_by_name is empty

**Health view exposes counters** (`rq-advMetricsBaseline01.2`)

**Given:**
- adv_status is called with view:'health'

**When:** The tool runs

**Then:**
- The response includes a metrics object with the five fields
- The counters reflect activity since the most recent plugin init

---

### Unavailable Projection Read Fallback

**ID:** `rq-replayFallback01` | **Priority:** **[MUST]**

When a change projection read fails because the source bytes are missing, malformed, or quarantined, ADV read surfaces SHALL attempt a durable projection or archive-bundle fallback before failing. If an active source snapshot or archive bundle exists, read tools SHALL return projection-backed change data with a recovery marker instead of requiring manual bundle assembly. Terminal projections (archived or closed) MUST remain read-only and MUST NOT be recreated during fallback.

**Tags:** `projection`, `fallback`, `recovery`, `read-tools`

#### Scenarios

**Unavailable source has archive projection** (`rq-replayFallback01.1`)

**Given:**
- The active change projection is unavailable or malformed
- An archive bundle exists for the change

**When:** A read tool loads the change

**Then:**
- The tool returns archive-backed change data
- The returned data includes a recovery/source marker
- The archived change is not recreated

**Unavailable source has no projection** (`rq-replayFallback01.2`)

**Given:**
- The active change projection is unavailable or malformed
- No active source snapshot or archive bundle exists

**When:** A read tool loads the change

**Then:**
- The original error remains visible
- No synthetic change state is invented

**Unavailable source with non-terminal change and active snapshot** (`rq-replayFallback01.3`)

**Given:**
- The active change projection is unavailable or malformed
- The change status is non-terminal (active, draft, pending)
- An active source snapshot exists
- The archive fallback is unavailable

**When:** A read tool loads the change

**Then:**
- The tool returns disk-backed change data
- The returned data includes recovery markers (_source: 'disk', _recovery.reason: 'projection_unavailable')
- No synthetic change state is started or emitted

---

### Runtime Provenance Diagnostic Surface

**ID:** `rq-runtimeProvenance01` | **Priority:** **[MUST]**

ADV SHALL expose plugin loaded-module provenance via the adv_status health view: dist mtime/path, source mtime/path, source-vs-dist freshness verdict (one of fresh, source_ahead_of_dist, dist_ahead_of_process, unknown), plugin checkout git branch and HEAD SHA when probable, cwd-vs-plugin-root relation (match/child/outside), and a structured recovery hint when not fresh. Filesystem stat failures and git probe failures MUST degrade gracefully to null rather than throwing. The recovery hint MUST be structured as { action, commands[], paths } so callers can render verbatim or extract commands programmatically. ADV SHALL NOT perform rebuild orchestration, session restart, or workflow-cache invalidation as part of this surface — those concerns are owned by external tooling.

**Tags:** `diagnostics`, `runtime`, `self-update`

#### Scenarios

**Fresh plugin emits no recovery hint** (`rq-runtimeProvenance01.1`)

**Given:**
- source_index_mtime <= dist_mtime AND dist_mtime <= process_started_at

**When:** adv_status view: health is read

**Then:**
- source_dist_freshness is 'fresh'
- recovery_hint is null
- Formatted healthSection contains no plugin freshness line

**Source ahead of dist instructs rebuild** (`rq-runtimeProvenance01.2`)

**Given:**
- source_index_mtime > dist_mtime

**When:** adv_status view: health is read

**Then:**
- source_dist_freshness is 'source_ahead_of_dist'
- recovery_hint.action mentions rebuild
- recovery_hint.commands includes 'pnpm run build'
- Formatted healthSection contains the verdict and command lines

**Dist ahead of process instructs session restart** (`rq-runtimeProvenance01.3`)

**Given:**
- source_index_mtime <= dist_mtime AND dist_mtime > process_started_at

**When:** adv_status view: health is read

**Then:**
- source_dist_freshness is 'dist_ahead_of_process'
- recovery_hint.action mentions session restart
- Formatted healthSection contains the verdict and restart guidance

**Unknown freshness on probe failure** (`rq-runtimeProvenance01.4`)

**Given:**
- Filesystem stat or git probe failed for the plugin checkout

**When:** adv_status view: health is read

**Then:**
- source_dist_freshness is 'unknown'
- recovery_hint.action indicates degraded mode
- plugin_checkout_branch and plugin_checkout_head_sha are null when git probe failed

---

### Store Cleanup Safety and Indefinite Retention

**ID:** `rq-storeCleanupCoupling01` | **Priority:** **[MUST]**

ADV retains `adv_store_cleanup` indefinitely as an operator-only maintenance tool for provably obsolete legacy agenda data; it is discoverable but must never become a routine autonomous agent action. Cleanup execute is manifest-before-delete: a `prepared` manifest row is persisted before any deletion, deletion proceeds only when that write succeeds, and a terminal outcome row is appended after each attempt so re-runs are idempotent. Dry-run plans stay reviewable before execution: bounded summary counts plus paged store renders, with plan_hash always computed over the full plan content — including paginated-out stores — so an approval pinned to a plan hash authorizes exactly one full plan. Cleanup never removes current change projections or archive bundles.

**Tags:** `cleanup`, `consolidation`, `maintenance`, `operator-only`, `audit`

#### Scenarios

**Current state refuses cleanup** (`rq-storeCleanupCoupling01.1`)

**Given:**
- A store contains current change projections or archive bundles

**When:** adv_store_cleanup evaluates the store

**Then:**
- The store is classified unsafe and planned as retain
- No current projection or archive file is deleted

**Cleanup preserves non-obsolete evidence** (`rq-storeCleanupCoupling01.2`)

**Given:**
- A store contains a file not proven to be obsolete legacy agenda data

**When:** adv_store_cleanup plans the store

**Then:**
- The store is classified unsafe and planned as retain
- The unproven file is preserved
- The dry-run report names the retention reason

**Execute is manifest-before-delete** (`rq-storeCleanupCoupling01.3`)

**Given:**
- An approved cleanup execute with a matching plan hash

**When:** A store planned as delete is processed

**Then:**
- A prepared manifest row is persisted before any deletion is attempted
- Deletion proceeds only when the manifest write succeeds
- A terminal outcome row (applied or failed) is appended after the attempt, making re-runs idempotent

**Dry-run plans are bounded, reviewable, and hash-exact** (`rq-storeCleanupCoupling01.4`)

**Given:**
- A dry-run plan over many stores

**When:** The operator reviews the plan with optional offset/limit/outcome paging

**Then:**
- A summary block reports aggregate counts (total stores, delete/skip/retain counts, total and delete row counts)
- Paged renders return a bounded stores slice with has_more
- plan_hash covers the full plan content including paginated-out stores, so paged and full renders share one hash and execute applies exactly the approved full plan

**Cleanup is retained indefinitely as operator-only maintenance** (`rq-storeCleanupCoupling01.5`)

**Given:**
- The retired legacy Agenda model

**When:** Operators maintain local stores over time

**Then:**
- adv_store_cleanup remains available indefinitely for removing provably obsolete legacy agenda files
- The tool is operator-only: discoverable, but never a routine autonomous agent action
- Every deletion remains approval-gated with a manifest audit trail

---
