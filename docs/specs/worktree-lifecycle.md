# Worktree Lifecycle

> **Version:** 1.4.0
> **Updated:** 2026-05-23

## Purpose

Capability: Branch-aware worktree registry with strict setup readiness, git-first workspace reconciliation, resume/materialization tool, main-checkout safety guard, cleanup eligibility tracking, and bounded cleanup.

## Requirements

### Branch-Aware Worktree Registry

**ID:** `rq-wl-branchRegistry01` | **Priority:** **[MUST]**

The worktree registry (per-change workflow state, with cross-change visibility via AdvWorktreeBranches/AdvWorktreePaths Temporal search attributes) must store per-entry: branch, path, materialized flag, changeId, status, setupReady, setupFailureReason, baseRef, headSha, source, cleanupEligible, cleanupBlockedBy. Legacy MaterializedWorktreeRecord consumers must continue to work through a materialized-only compatibility view.

**Tags:** `worktree`, `registry`, `temporal`

#### Scenarios

**Branch-only record survives worktree delete** (`rq-wl-branchRegistry01.1`)

**Given:**

- A worktree is deleted via git but the registry entry retains branch

**When:** The registry is queried

**Then:**

- The entry exists with materialized=false and path=''

**Materialized-only view omits branch-only records** (`rq-wl-branchRegistry01.2`)

**Given:**

- Registry has both materialized and branch-only entries

**When:** A legacy consumer requests materialized worktrees

**Then:**

- Only entries with materialized=true are returned

---

### Cross-change worktree reads isolate poisoned workflow queries

**ID:** `rq-worktreePoisonVisibility01` | **Priority:** **[MUST]**

Cross-change worktree visibility MUST query each owning change workflow independently. A failed per-change getWorktreesQuery MUST NOT abort the whole listWorktreesAcrossChanges result. The result MUST include healthy records from other workflows plus structured warnings and poisonedWorkflows metadata when describe/error evidence identifies poisoned history. When the Temporal visibility source itself is unavailable, the result MUST be marked unavailable rather than throwing to the WIP aggregator.

**Tags:** `worktree`, `temporal`, `poisoned-history`, `visibility`

#### Scenarios

**Per-change query failure returns partial results** (`rq-worktreePoisonVisibility01.1`)

**Given:**

- Visibility lists two change workflows with active worktrees
- The first getWorktreesQuery succeeds
- The second getWorktreesQuery fails

**When:** listWorktreesAcrossChanges runs

**Then:**

- The first workflow's materialized worktree records are returned
- A warning is returned for the failed workflow
- The function does not throw for the per-workflow query failure

**Poison evidence is structured** (`rq-worktreePoisonVisibility01.2`)

**Given:**

- The failed workflow describe output contains TMPRL1100, NonDeterministic, Nondeterminism, WorkflowTaskFailedCauseNonDeterministicError, No command scheduled, or WorkflowExecutionUpdateAccepted evidence

**When:** listWorktreesAcrossChanges classifies the failure

**Then:**

- poisonedWorkflows includes changeId, workflowId, recoveryReason="poisoned_history", evidenceSummary, and message
- No destructive recovery action is performed

**Visibility-source outage is explicit** (`rq-worktreePoisonVisibility01.3`)

**Given:**

- Temporal service, workflow list, or getHandle is unavailable

**When:** listWorktreesAcrossChanges runs

**Then:**

- The result has records: [] and unavailable: true
- A worktree_visibility warning explains the source failure

---

### Strict Setup Readiness

**ID:** `rq-wl-setupReadiness01` | **Priority:** **[MUST]**

advWorktreeCreate must record materializing state before git worktree add, then transition to active/idle only after postCreate hooks succeed. Hook failure writes setup_failed status with setupReady=false and the failure reason. Active session registration must be blocked on setup_failed records.

**Tags:** `worktree`, `safety`, `hooks`

#### Scenarios

**Hook failure produces setup_failed** (`rq-wl-setupReadiness01.1`)

**Given:**

- advWorktreeCreate is called and postCreate hook times out or returns non-zero

**When:** The create flow handles the failure

**Then:**

- Registry entry has status=setup_failed
- setupReady=false
- setupFailureReason contains the error
- Active session is NOT registered for this worktree

**Successful setup transitions to active** (`rq-wl-setupReadiness01.2`)

**Given:**

- advWorktreeCreate is called and postCreate hooks succeed

**When:** The create flow completes

**Then:**

- Registry entry has status=active or idle
- setupReady=true
- Active session is registered

---

### Git-First Workspace Reconciliation

**ID:** `rq-wl-gitFirstReconcile01` | **Priority:** **[MUST]**

A git-first scanner (scanGitWorkspaceFacts) must enumerate actual git worktrees and classify their relationship to registry entries. A pure reconciler (reconcileWorktreeRegistry) must produce classification actions without IO side effects, separating git IO from deterministic state transitions.

**Tags:** `worktree`, `reconciliation`, `git`

#### Scenarios

**Orphan git worktree detected** (`rq-wl-gitFirstReconcile01.1`)

**Given:**

- A git worktree exists on disk but has no registry entry

**When:** scanGitWorkspaceFacts + reconcileWorktreeRegistry run

**Then:**

- The reconciler produces an 'untracked' classification for that worktree

**Missing worktree detected** (`rq-wl-gitFirstReconcile01.2`)

**Given:**

- A registry entry claims materialized=true but no git worktree exists

**When:** scanGitWorkspaceFacts + reconcileWorktreeRegistry run

**Then:**

- The reconciler produces a 'missing' classification for that entry

---

### Worktree Resume / Materialization Tool

**ID:** `rq-wl-resumeTool01` | **Priority:** **[MUST]**

advWorktreeResume must resolve a changeId or branch to an existing worktree record. It must block on setup_failed records (return SETUP_FAILED), reuse setup-ready materialized worktrees, and materialize branch-only records through the strict create path. It must return a concrete workdir path on success.

**Tags:** `worktree`, `resume`, `tool`

#### Scenarios

**Resume reuses ready worktree** (`rq-wl-resumeTool01.1`)

**Given:**

- A materialized worktree with setupReady=true exists for the change

**When:** advWorktreeResume is called with the changeId

**Then:**

- Returns the existing worktree path without creating a new one

**Resume blocks on setup_failed** (`rq-wl-resumeTool01.2`)

**Given:**

- A worktree record with status=setup_failed exists for the change

**When:** advWorktreeResume is called with the changeId

**Then:**

- Returns SETUP_FAILED result with branch, path, and reason

**Resume materializes branch-only record** (`rq-wl-resumeTool01.3`)

**Given:**

- A registry entry exists with materialized=false and a branch name

**When:** advWorktreeResume is called with the changeId

**Then:**

- Creates the git worktree through the strict create path
- Returns the new worktree path

---

### Cleanup Eligibility Tracking

**ID:** `rq-wl-cleanupEligibility01` | **Priority:** **[SHOULD]**

Registry entries must track cleanupEligible and cleanupBlockedBy fields. Entries with status=merged and no active sessions should be cleanup-eligible. Entries with setup_failed or active sessions should not be cleanup-eligible, with cleanupBlockedBy documenting the reason.

**Tags:** `worktree`, `cleanup`

#### Scenarios

**Merged entry is cleanup-eligible** (`rq-wl-cleanupEligibility01.1`)

**Given:**

- A worktree entry has status=merged
- No active sessions reference this worktree

**When:** Cleanup eligibility is evaluated

**Then:**

- cleanupEligible=true
- cleanupBlockedBy is empty

**Active session blocks cleanup** (`rq-wl-cleanupEligibility01.2`)

**Given:**

- A worktree entry has an active session

**When:** Cleanup eligibility is evaluated

**Then:**

- cleanupEligible=false
- cleanupBlockedBy documents the active session

---

### Terminal Worktree Cleanup Reaper

**ID:** `rq-terminalCleanupReaper01` | **Priority:** **[MUST]**

ADV must provide one shared terminal cleanup reaper for terminal ADV worktrees. The reaper must be reachable from archive, manual cleanup, status/triage discovery, bounded startup pending-delete drain, and best-effort session.deleted. Startup behavior must drain already-known pending deletes only; full terminal discovery must not run during plugin startup. All deletion attempts must delegate to advWorktreeDelete.

**Tags:** `worktree`, `cleanup`, `terminal`, `reaper`

#### Scenarios

**Shared triggers reach the reaper** (`rq-terminalCleanupReaper01.1`)

**Given:**

- A terminal ADV worktree exists for an archived or closed change

**When:** archive, manual cleanup, status/triage, startup, or session.deleted cleanup runs

**Then:**

- The shared terminal cleanup reaper evaluates the candidate
- The actual deletion attempt delegates to advWorktreeDelete

**Startup remains bounded** (`rq-terminalCleanupReaper01.2`)

**Given:**

- Plugin startup begins with pending deletes recorded

**When:** Startup cleanup runs

**Then:**

- Only already-known pending deletes are drained
- Full terminal discovery is not executed during startup

---

### Terminal Cleanup Safety Gate

**ID:** `rq-terminalCleanupSafety01` | **Priority:** **[MUST]**

Terminal cleanup candidates MUST NOT run git worktree remove directly. advWorktreeDelete is the sole deletion authority and must verify durable ADV state, terminal owning change status (archived or closed), branch integration, clean worktree state, and no live process CWD before removal. census.cleanupEligible is advisory discovery/visibility data only and must not be used as sufficient deletion authority.

**Tags:** `worktree`, `cleanup`, `safety`

#### Scenarios

**Unsafe candidates are retained** (`rq-terminalCleanupSafety01.1`)

**Given:**

- A cleanup candidate is dirty, unmerged, non-terminal, or in use

**When:** The terminal cleanup reaper evaluates it

**Then:**

- The candidate is retained with a blocker
- No direct git worktree remove command is run

**Census eligibility is not authority** (`rq-terminalCleanupSafety01.2`)

**Given:**

- census.cleanupEligible is true for a worktree

**When:** The reaper attempts cleanup

**Then:**

- advWorktreeDelete still verifies durable ADV state before deletion

---

### Terminal Cleanup Visibility

**ID:** `rq-terminalCleanupVisibility01` | **Priority:** **[MUST]**

Retained terminal cleanup blockers must be visible without requiring manual git inspection. adv_status must surface aggregate retained-terminal-worktree counts/classes only. adv_worktree_triage must surface exact branches, paths, and blockers for retained terminal cleanup candidates.

**Tags:** `worktree`, `cleanup`, `status`, `triage`

#### Scenarios

**Status shows aggregates** (`rq-terminalCleanupVisibility01.1`)

**Given:**

- Retained terminal cleanup blockers exist

**When:** adv_status runs

**Then:**

- The output includes retained cleanup counts/classes
- The normal status surface does not dump every retained path

**Triage shows exact blockers** (`rq-terminalCleanupVisibility01.2`)

**Given:**

- Retained terminal cleanup blockers exist

**When:** adv_worktree_triage runs

**Then:**

- Exact branches, paths, and blockers are returned

---

### Single Terminal Cleanup Lifecycle Path

**ID:** `rq-terminalCleanupLifecycle01` | **Priority:** **[MUST]**

Terminal cleanup processing must route through one shared cleanup path instead of duplicate lifecycle loops. Concurrent cleanup triggers must be serialized or idempotent, and retained in-use worktrees must stay queued or preserved for retry. Manual cleanup must be able to retry safe terminal pending deletes even when prior automatic attempts reached an attempt cap.

**Tags:** `worktree`, `cleanup`, `lifecycle`, `concurrency`

#### Scenarios

**Concurrent triggers are idempotent** (`rq-terminalCleanupLifecycle01.1`)

**Given:**

- Two cleanup triggers process the same pending delete

**When:** Both triggers run concurrently or sequentially

**Then:**

- Processing is serialized or idempotent
- At most one deletion succeeds and retained state remains consistent

**Manual cleanup can retry exhausted safe items** (`rq-terminalCleanupLifecycle01.2`)

**Given:**

- A safe terminal pending delete has exhausted automatic attempts

**When:** Manual cleanup runs

**Then:**

- The safe pending delete is retried through the shared path

---

### Machine-Enforced ADV Worktree Mutation Guard

**ID:** `rq-worktreeMutationGuard01` | **Priority:** **[MUST]**

ADV mutating tools that advance working-tree-impacting gates or change task execution state must structurally block execution from the main checkout when feature_flags.worktree_guard_enforce is true (default per rq-autoManageAdvWorktrees AC2) OR when the per-change `worktree_auto_managed` marker is true (regardless of global flag). Mutations from an ADV worktree remain allowed. Gate completion isolation is classified by working-tree impact: the proposal gate, discovery gate, and design gate are metadata-only gate completions and remain allowed from the main checkout; planning, execution, acceptance, and release are worktree-mutation gates and remain guarded. For auto-managed changes, guarded gate/task mutations MUST attempt to materialize the worktree via `advWorktreeResume` before BLOCKing, and surface the resulting path via `expectedWorktreePath` so the agent can re-run from the correct workdir. The guard must return WorktreeIsolationViolation with main checkout path and remediation instead of relying on agent-only instructions. Explicit `worktree_guard_enforce: false` preserves legacy permissive behavior for non-auto-managed changes.

**Tags:** `worktree`, `safety`, `mutation-guard`

#### Scenarios

**Metadata gate completion is allowed from main checkout** (`rq-worktreeMutationGuard01.1`)

**Given:**

- feature_flags.worktree_guard_enforce is true
- The current session is in the main checkout

**When:** adv_gate_complete is called for discovery or design

**Then:**

- The tool allows the metadata-only gate completion
- No worktree materialization is required
- Code and git mutation paths remain unaffected

**Worktree-mutation gate completion blocks from main checkout** (`rq-worktreeMutationGuard01.1b`)

**Given:**

- feature_flags.worktree_guard_enforce is true
- The current session is in the main checkout

**When:** adv_gate_complete is called for planning, execution, acceptance, or release

**Then:**

- The tool returns WorktreeIsolationViolation before any state mutation
- The response includes mainCheckoutPath and remediation
- No gate completion signal is sent

**Task execution mutations block from main checkout** (`rq-worktreeMutationGuard01.2`)

**Given:**

- feature_flags.worktree_guard_enforce is true
- The current session is in the main checkout

**When:** adv_task_add or adv_task_update with in_progress, done, or cancelled status is called

**Then:**

- The tool returns WorktreeIsolationViolation before any task signal mutation
- The response includes mainCheckoutPath and remediation
- Worktree-origin task mutations remain allowed

**Proposal gate and explicit-false paths remain compatible** (`rq-worktreeMutationGuard01.3`)

**Given:**

- The proposal gate is being completed or worktree_guard_enforce is explicitly false for a non-auto-managed change

**When:** A supported ADV mutation executes from the main checkout

**Then:**

- The proposal gate completion remains allowed so a worktree can be created after proposal
- Explicit-false behavior preserves legacy mutation flow for non-auto-managed changes
- The guard remains additive and does not alter read-only tools

---

### Bounded Worktree Cleanup

**ID:** `rq-worktreeBoundedCleanup01` | **Priority:** **[MUST]**

Worktree cleanup operations must be bounded to prevent runaway deletion. After each worktree deletion, a post-delete notification must be emitted within the default 10s timeout. Per-item cleanup must proceed sequentially with bounded retries; batch or parallel unbounded cleanup is prohibited. The cleanup tool must classify worktrees into drift groups (safe, blocked, dirty/in-use, needs-investigation) and remain report-only for worktree drift even under `--execute`. Actual worktree deletion remains owned by `adv_worktree_delete` and `adv_worktree_cleanup`.

**Tags:** `worktree`, `cleanup`, `bounded`, `safety`

#### Scenarios

**Post-delete notification is bounded** (`rq-worktreeBoundedCleanup01.1`)

**Given:**

- A worktree deletion is requested via adv_worktree_delete or adv_worktree_cleanup

**When:** The deletion completes

**Then:**

- A post-delete notification is emitted within the default 10s timeout
- No unbounded wait blocks subsequent operations

**Per-item sequential cleanup with bounded retries** (`rq-worktreeBoundedCleanup01.2`)

**Given:**

- Multiple worktrees are eligible for cleanup

**When:** adv_worktree_cleanup processes the queue

**Then:**

- Worktrees are processed sequentially, one at a time
- Each item has a bounded retry count (max 5)
- Batch or parallel unbounded deletion is not performed
