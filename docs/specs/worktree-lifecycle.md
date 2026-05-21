# Worktree Lifecycle

> **Version:** 1.2.0
> **Updated:** 2026-05-21

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

### Machine-Enforced ADV Worktree Mutation Guard

**ID:** `rq-worktreeMutationGuard01` | **Priority:** **[MUST]**

ADV mutating tools that advance gates or change task execution state must structurally block execution from the main checkout when feature_flags.worktree_guard_enforce is true (default per rq-autoManageAdvWorktrees AC2) OR when the per-change `worktree_auto_managed` marker is true (regardless of global flag). Mutations from an ADV worktree remain allowed. The proposal gate remains exempt so a change can be created before a worktree exists. For auto-managed changes, the guard MUST attempt to materialize the worktree via `advWorktreeResume` before BLOCKing, and surface the resulting path via `expectedWorktreePath` so the agent can re-run from the correct workdir. The guard must return WorktreeIsolationViolation with main checkout path and remediation instead of relying on agent-only instructions. Explicit `worktree_guard_enforce: false` preserves legacy permissive behavior for non-auto-managed changes.

**Tags:** `worktree`, `safety`, `mutation-guard`

#### Scenarios

**Gate completion blocks from main checkout** (`rq-worktreeMutationGuard01.1`)

**Given:**

- feature_flags.worktree_guard_enforce is true
- The current session is in the main checkout

**When:** adv_gate_complete is called for discovery, design, planning, execution, acceptance, or release

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

Worktree cleanup operations must be bounded to prevent runaway deletion. After each worktree deletion, a post-delete notification must be emitted within a bounded timeout (5-15s). Per-item cleanup must proceed sequentially with bounded retries; batch or parallel unbounded cleanup is prohibited. The cleanup tool must classify worktrees into drift groups (safe, blocked, dirty/in-use, needs-investigation) and remain report-only for worktree drift even under `--execute`. Actual worktree deletion remains owned by `adv_worktree_delete` and `adv_worktree_cleanup`.

**Tags:** `worktree`, `cleanup`, `bounded`, `safety`

#### Scenarios

**Post-delete notification is bounded** (`rq-worktreeBoundedCleanup01.1`)

**Given:**

- A worktree deletion is requested via adv_worktree_delete or adv_worktree_cleanup

**When:** The deletion completes

**Then:**

- A post-delete notification is emitted within 5-15s
- No unbounded wait blocks subsequent operations

**Per-item sequential cleanup with bounded retries** (`rq-worktreeBoundedCleanup01.2`)

**Given:**

- Multiple worktrees are eligible for cleanup

**When:** adv_worktree_cleanup processes the queue

**Then:**

- Worktrees are processed sequentially, one at a time
- Each item has a bounded retry count (max 3)
- Batch or parallel unbounded deletion is not performed
