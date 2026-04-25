# Checkpoint Commits

> **Version:** 1.0.0
> **Updated:** 2026-04-24

## Purpose

Capability: Verified per-task git checkpoints during `/adv-apply`. Every task with file changes produces a local commit scoped to the change worktree, with guardrails ensuring the commit represents a verified completion state and cannot be mistaken for a publication-ready archive.

## Requirements

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
