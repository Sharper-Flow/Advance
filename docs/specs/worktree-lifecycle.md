# Worktree Lifecycle — Branch-Aware Registry, Setup Readiness, Git-First Reconciliation

> **Version:** 1.11.1
> **Updated:** 2026-08-27

## Purpose

Capability: Branch-aware worktree registry with strict setup readiness, git-first workspace reconciliation, resume/materialization tool, main-checkout safety guard, cleanup eligibility tracking, and bounded cleanup.

## Requirements

### Branch-Aware Disk Worktree Registry

**ID:** `rq-wl-branchRegistry01` | **Priority:** **[MUST]**

The worktree registry MUST persist per-change entries in durable disk projections and expose a compatibility view containing branch, path, materialized, changeId, status, setupReady, setupFailureReason, baseRef, headSha, source, cleanupEligible, and cleanupBlockedBy.

**Tags:** `worktree`, `registry`, `disk`

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

### Cross-Change Worktree Reads Isolate Unreadable Projections

**ID:** `rq-worktreePoisonVisibility01` | **Priority:** **[MUST]**

Cross-change worktree visibility MUST read each owning change projection independently. A failed per-change read MUST NOT abort the whole result; healthy records remain visible alongside structured unreadable-projection warnings. An unavailable projection source MUST be marked degraded rather than throwing to the WIP aggregator.

**Tags:** `worktree`, `disk`, `unavailable-projection`, `visibility`

#### Scenarios

**Open worktree owners are selected by lifecycle state** (`rq-worktreePoisonVisibility01.0`)

**Given:**
- A branch is registered by an open change change projection
- Another terminal change projection has stale AdvWorktreeBranches or AdvChangeStatus attributes

**When:** Branch-in-use or active-worktree discovery queries disk projection lookup

**Then:**
- The query includes AdvLifecycleState = "open"
- The query includes ExecutionStatus = "Running"
- The query does not use AdvChangeStatus as open-owner authority

**Per-change query failure returns partial results** (`rq-worktreePoisonVisibility01.1`)

**Given:**
- projection lookup lists two change change projections with active worktrees
- The first getWorktreesQuery succeeds
- The second getWorktreesQuery fails

**When:** listWorktreesAcrossChanges runs

**Then:**
- The first change projection's materialized worktree records are returned
- A warning is returned for the failed change projection
- The function does not throw for the per-change projection query failure

**Poison evidence is structured** (`rq-worktreePoisonVisibility01.2`)

**Given:**
- The failed change projection describe output contains TMPRL1100, NonDeterministic, Nondeterminism, Change projectionTaskFailedCauseNonDeterministicError, No command scheduled, or Change projectionExecutionUpdateAccepted evidence

**When:** listWorktreesAcrossChanges classifies the failure

**Then:**
- unreadableChange projections includes changeId, change projectionId, recoveryReason="unreadable_history", evidenceSummary, and message
- No destructive recovery action is performed

**projection lookup-source outage is explicit** (`rq-worktreePoisonVisibility01.3`)

**Given:**
- disk service, change projection list, or getHandle is unavailable

**When:** listWorktreesAcrossChanges runs

**Then:**
- The result has records: [] and unavailable: true
- A worktree_visibility warning explains the source failure

---

### Strict Setup Readiness

**ID:** `rq-wl-setupReadiness01` | **Priority:** **[MUST]**

advWorktreeCreate must record materializing state before git worktree add, then transition to active/idle only after postCreate hooks succeed. Hook failure writes setup_failed status with setupReady=false and the failure reason. The setup_failed record must be durable across sessions and visible to a later advWorktreeResume in a new session, which must return SETUP_FAILED with the recorded reason. Active session registration must be blocked on setup_failed records.

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

**setup_failed is durable and resume-visible across sessions** (`rq-wl-setupReadiness01.3`)

**Given:**
- advWorktreeCreate failed during postCreate hook for a change
- The original session ended

**When:** advWorktreeResume is called in a new session for the same change

**Then:**
- getWorktreeRecord returns status=setup_failed with the recorded reason
- advWorktreeResume returns SETUP_FAILED with branch, path, and the recorded reason

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

ADV must provide one shared terminal cleanup reaper for terminal ADV worktrees. A shipped archive MUST automatically invoke the shared terminal cleanup reaper for the exact change worktree. The reaper must be reachable from archive, manual cleanup, status/triage discovery, bounded startup pending-delete drain, and best-effort session.deleted. Startup behavior must drain already-known pending deletes only; full terminal discovery must not run during plugin startup. Cleanup refusal MUST remain non-destructive and MUST NOT activate PR branch deletion. All deletion attempts must delegate to advWorktreeDelete.

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

**Shipped archive invokes safe exact-worktree cleanup** (`rq-terminalCleanupReaper01.3`)

**Given:**
- Archive finalization has verified shipped proof for the exact change and worktree

**When:** Archive completion runs

**Then:**
- The shared reaper delegates cleanup to advWorktreeDelete
- A safe refusal records a typed retained disposition while the change remains archived
- No automatic local or remote PR branch deletion runs

---

### Terminal Cleanup Safety Gate

**ID:** `rq-terminalCleanupSafety01` | **Priority:** **[MUST]**

Terminal cleanup candidates MUST NOT run git worktree remove directly. advWorktreeDelete is the sole deletion authority and must verify durable ADV state, terminal owning change status (archived or closed), branch integration, clean worktree state, and no live process CWD before removal. Archive-owned historical recovery is permitted only when exact PR identity, terminal status, path allowlists, canonical hashes, and mode-specific ancestry all verify. Generic force MUST NOT activate historical recovery. census.cleanupEligible is advisory discovery/visibility data only and must not be used as sufficient deletion authority. The local CWD scan (isWorktreeInUse) is the sole safety authority for the "no live process CWD" portion of this requirement. The remote OpenCode workspace-list API is advisory: when reachable, it cleans up stale workspace registry entries; when unreachable, deletion proceeds with a logged warning and is not blocked.

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

**Remote workspace registry failure is advisory** (`rq-terminalCleanupSafety01.3`)

**Given:**
- advWorktreeDelete has verified via local /proc/*/cwd scan that no live process holds the worktree as CWD
- The remote OpenCode workspace-list API returns a failure (network, 5xx, malformed response)

**When:** The terminal cleanup evaluates workspace ownership

**Then:**
- Deletion proceeds without retaining the worktree
- A warning is logged with the remote failure reason

**Archive-owned historical recovery binds mode-specific ancestry** (`rq-terminalCleanupSafety01.4`)

**Given:**
- A clean archived worktree has local commits after the merged PR head
- Every changed path after the PR head is archive-owned and matches canonical bundle bytes

**When:** Archive-owned recovery planning runs

**Then:**
- PR-mode proof requires the PR head to be an ancestor of local HEAD
- Normal cleanup continues to require local HEAD to be integrated into the PR head
- The signed plan binds the exact recovery proof and the executor revalidates it under the cleanup lease

**Unsafe archive cleanup retains bounded blocker evidence** (`rq-terminalCleanupSafety01.5`)

**Given:**
- Dirty, ambiguous, expired, drifted, locked, in-use, hash-mismatched, path-mismatched, or unproven state

**When:** Automatic archive cleanup runs

**Then:**
- Deletion refuses without filesystem removal or branch deletion
- The returned disposition identifies the retained blocker with bounded evidence

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

ADV mutating tools that advance working-tree-impacting gates or change task execution state must structurally block execution from the main checkout when feature_flags.worktree_guard_enforce is true (default per rq-autoManageAdvWorktrees AC2) OR when the per-change `worktree_auto_managed` marker is true (regardless of global flag). Mutations from an ADV worktree remain allowed. Gate completion isolation is classified by working-tree impact: the proposal gate, discovery gate, and design gate are metadata-only gate completions and remain allowed from the main checkout; planning, execution, acceptance, and release are worktree-mutation gates and remain guarded. EXISTING-WORKTREE EXCEPTION: when a setup-ready ADV worktree already exists for the change, guarded gate/task state-transition mutations from the main checkout are ALLOWED (the mutation proceeds, no BLOCK), regardless of the per-change `worktree_auto_managed` marker (true, false, or undefined). Existing-worktree detection is the structural authority — read from the durable change-change projection `worktrees` map, never from heuristic/string-matched filesystem paths — and the marker is a fast-path hint only. A worktree counts as setup-ready ONLY when its record satisfies all of: status is neither `deleted` nor `setup_failed`, `setupReady === true`, and `path` is present; a `setup_failed` or `setupReady:false` record does NOT qualify. The BLOCK applies only when NO setup-ready worktree exists. This exception is scoped strictly to durable disk state-transition mutations that do not depend on `process.cwd()`; file-write isolation (task checkpoint and file edits) is unchanged and still requires an explicit worktree workdir. On probe error or disk-unavailable, the guard MUST NOT ALLOW on unknown existence — it falls back to the marker-based behavior. For auto-managed changes with no existing setup-ready worktree, guarded gate/task mutations MUST attempt to materialize the worktree via `advWorktreeResume` before BLOCKing, and surface the resulting path via `expectedWorktreePath` so the agent can re-run from the correct workdir. The guard must return WorktreeIsolationViolation with main checkout path and remediation instead of relying on agent-only instructions. Explicit `worktree_guard_enforce: false` preserves legacy permissive behavior for non-auto-managed changes.

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

**Worktree-mutation gate completion blocks from main checkout when no setup-ready worktree exists** (`rq-worktreeMutationGuard01.1b`)

**Given:**
- feature_flags.worktree_guard_enforce is true
- The current session is in the main checkout
- There is no setup-ready worktree for the change

**When:** adv_gate_complete is called for planning, execution, acceptance, or release

**Then:**
- The tool returns WorktreeIsolationViolation before any state mutation
- The response includes mainCheckoutPath and remediation
- No gate completion mutation is sent

**Task execution mutations block from main checkout when no setup-ready worktree exists** (`rq-worktreeMutationGuard01.2`)

**Given:**
- feature_flags.worktree_guard_enforce is true
- The current session is in the main checkout
- There is no setup-ready worktree for the change

**When:** adv_task_add or adv_task_update with in_progress, done, or cancelled status is called

**Then:**
- The tool returns WorktreeIsolationViolation before any task mutation mutation
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

**Mutation from main is allowed when a setup-ready worktree exists** (`rq-worktreeMutationGuard01.4`)

**Given:**
- feature_flags.worktree_guard_enforce is true
- The current session is in the main checkout
- A materialized, setupReady ADV worktree already exists for the change
- The per-change worktree_auto_managed marker may be true, false, or undefined

**When:** adv_gate_complete for a worktree-mutation gate, or adv_task_update with a status transition, is called

**Then:**
- The tool returns decision ALLOW and the state-transition mutation is sent
- The ALLOW holds regardless of the worktree_auto_managed marker value
- A worktree record with status setup_failed or setupReady false does NOT qualify and still blocks
- Existing-worktree detection reads the durable change-change projection worktrees map, not heuristic filesystem paths
- On probe error or disk-unavailable the guard does not ALLOW and falls back to marker-based behavior

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
- A post-delete notification is emitted within the signal timeout (5s default)
- Notification failure returns ok:true + warning (non-blocking)
- No unbounded wait blocks subsequent operations

**Per-item sequential cleanup with bounded retries** (`rq-worktreeBoundedCleanup01.2`)

**Given:**
- Multiple worktrees are eligible for cleanup

**When:** adv_worktree_cleanup processes the queue

**Then:**
- Worktrees are processed sequentially, one at a time
- Each item has a bounded retry count (max 5)
- Batch or parallel unbounded deletion is not performed

---

### Tool-Facing Timeout Safety Budget

**ID:** `rq-worktreeBoundedCleanup02` | **Priority:** **[MUST]**

Worktree tool wrappers (adv_worktree_delete, adv_worktree_cleanup) must enforce a safe timeout budget strictly below the SDK's 10s tool-execution ceiling. The safe budget is 8s (WORKTREE_TOOL_SAFE_TIMEOUT_MS). Caller-supplied timeoutMs values exceeding the safe budget are clamped automatically. On timeout, the tool must return a typed timeout response (no late background mutation). Internal operations (git remove, workspace fetch/delete, workflow signal) must each be bounded below the tool budget. The effective timeout must be reported in the response as effectiveTimeoutMs.

**Tags:** `worktree`, `timeout`, `safety`, `bounded`, `tool-wrapper`

#### Scenarios

**Safe budget constant is 8s** (`rq-worktreeBoundedCleanup02.1`)

**Given:**
- The worktree tool wrappers are loaded

**When:** WORKTREE_TOOL_SAFE_TIMEOUT_MS is queried

**Then:**
- The value is 8000ms

**Oversize timeout is clamped with effectiveTimeoutMs** (`rq-worktreeBoundedCleanup02.2`)

**Given:**
- adv_worktree_cleanup is called with timeoutMs > 8000

**When:** The tool processes the request

**Then:**
- The effective timeout is clamped to 8000ms
- The response includes effectiveTimeoutMs: 8000
- The response includes a timeoutNote explaining the clamping

**Timeout returns typed response with no late mutation** (`rq-worktreeBoundedCleanup02.3`)

**Given:**
- adv_worktree_delete or adv_worktree_cleanup times out during execution

**When:** The timeout fires

**Then:**
- The tool returns a response with timedOut: true
- No late background mutation modifies state after the timeout response
- drainPendingDeletes does not attach late-success handlers to timed-out delete promises

**Git remove is bounded** (`rq-worktreeBoundedCleanup02.4`)

**Given:**
- A worktree deletion calls git worktree remove

**When:** The git operation hangs

**Then:**
- The operation is killed after the git remove timeout (5s)
- The tool returns a REMOVE_FAILED error

**Workspace operations are bounded** (`rq-worktreeBoundedCleanup02.5`)

**Given:**
- Workspace find or delete operations are called during worktree cleanup

**When:** The HTTP request hangs

**Then:**
- The operation is aborted after 3s (AbortSignal.timeout)
- Workspace lookup returns null gracefully
- Workspace delete failure produces a warning but does not block deletion

---

### Target-Project Worktree Cleanup Routing

**ID:** `rq-worktreeTargetCleanup01` | **Priority:** **[MUST]**

Worktree cleanup mutation tools that support target-project operation MUST route target_path calls through the target project’s disk store, require explicit confirmation for untrusted target mutation, and preserve existing deletion safety gates. Triage recommendations MUST include target-aware remediation.

**Tags:** `worktree`, `cleanup`, `target-path`, `cross-project`

#### Scenarios

**Unconfirmed target cleanup mutation is rejected** (`rq-worktreeTargetCleanup01.1`)

**Given:**
- adv_worktree_delete or adv_worktree_cleanup is called with an untrusted target_path
- target_confirmed is missing or confirmationEvidence is blank

**When:** The tool validates the target-project mutation

**Then:**
- The tool rejects the call before filesystem or registry mutation
- The response explains that target confirmation evidence is required

**Approved target cleanup uses target project state** (`rq-worktreeTargetCleanup01.2`)

**Given:**
- adv_worktree_delete or adv_worktree_cleanup is called with an approved target_path

**When:** The cleanup operation evaluates a worktree or queued cleanup candidate

**Then:**
- The tool uses the target project's root, worktree registry, and disk queue
- Existing dirty, in-use, merged, terminal-state, timeout, and bounded-cleanup safety checks still apply

**Target triage recommendations are actionable** (`rq-worktreeTargetCleanup01.3`)

**Given:**
- adv_worktree_triage inspects a project root different from the current store root

**When:** The triage result includes a delete or cleanup remediation

**Then:**
- The recommendation includes target_path context or equivalent target-aware remediation
- The recommendation does not imply that a bare current-project adv_worktree_delete call will repair target-project drift

---

### Worktree Lease Liveness Is Fail-Safe

**ID:** `rq-worktreeLeaseLiveness01` | **Priority:** **[MUST]**

Worktree lease reclamation must treat an owning PID as alive unless the liveness probe definitively proves it dead. A process-existence probe (signal 0) that fails with ESRCH means the process is gone (dead); a failure with EPERM (process exists but is not signalable by this user) or any other error must be treated as alive. Lease reclamation must not reclaim or overwrite a lease whose owning PID is treated as alive, preserving the exclusive-worktree-ownership invariant on multi-user hosts. All worktree-lease liveness checks must use the shared liveness helper rather than divergent local implementations.

**Tags:** `worktree`, `lease`, `concurrency`, `liveness`

#### Scenarios

**EPERM liveness probe does not reclaim a live peer lease** (`rq-worktreeLeaseLiveness01.1`)

**Given:**
- A worktree lease is held by another PID
- A signal-0 probe against that PID throws EPERM or a non-ESRCH error

**When:** Lease reclamation evaluates whether the existing lease may be taken over

**Then:**
- The owning PID is treated as alive
- The existing lease is not reclaimed or overwritten

**ESRCH liveness probe allows reclaim of a dead-owner lease** (`rq-worktreeLeaseLiveness01.2`)

**Given:**
- A worktree lease is held by a PID that no longer exists
- A signal-0 probe against that PID throws ESRCH

**When:** Lease reclamation evaluates the stale lease

**Then:**
- The owning PID is treated as dead
- The lease may be reclaimed per the normal stale-reclaim rules

---

### Stale Missing-From-Disk Registry Cleanup

**ID:** `rq-worktreeStaleRegistryCleanup01` | **Priority:** **[MUST]**

adv_worktree_delete MUST safely clear worktree registry entries reported as `missing_from_disk` when the owning change is terminal (archived or closed) and the on-disk worktree is absent. The cleanup MUST dispatch `worktreeDeletedSignal` with reason `missing_from_disk_cleanup`, refresh the owning change's cache, and leave unsafe cases (non-terminal owning change, dirty/unmerged branch, in-use worktree) retained with a typed blocker. Subsequent `adv_worktree_triage` MUST NOT report the same cleared stale entry.

**Tags:** `worktree`, `cleanup`, `registry`, `missing-from-disk`

#### Scenarios

**Archived missing-from-disk entry is cleared** (`rq-worktreeStaleRegistryCleanup01.1`)

**Given:**
- A worktree_registry entry exists for branch change/x
- The owning change is archived
- No on-disk worktree exists for change/x

**When:** adv_worktree_delete is called for change/x

**Then:**
- worktreeDeletedSignal is dispatched with reason missing_from_disk_cleanup
- The owning change cache is refreshed
- The tool returns ok: true

**Non-terminal missing-from-disk entry is retained** (`rq-worktreeStaleRegistryCleanup01.2`)

**Given:**
- A worktree_registry entry exists for branch change/y
- The owning change is active
- No on-disk worktree exists for change/y

**When:** adv_worktree_delete is called for change/y

**Then:**
- The tool returns ok: false with reason change_not_terminal
- No worktreeDeletedSignal is dispatched

**Triage no longer reports cleared entry** (`rq-worktreeStaleRegistryCleanup01.3`)

**Given:**
- A missing_from_disk registry entry for an archived change was just cleared

**When:** adv_worktree_triage runs afterward

**Then:**
- The orphans list does not contain the cleared branch/path entry

---

### Health Worktree Diagnostics Are Read-Only

**ID:** `rq-healthReadOnlyWorktree01` | **Priority:** **[MUST]**

`adv_status view:health` MUST limit worktree diagnostics to bounded read-only census and retained-state aggregates. It MUST NOT discover cleanup candidates for mutation, drain pending deletions, delete worktrees, or delete branches. Exact cleanup actions remain owned by `adv_worktree_cleanup` and related typed cleanup tools. Hygiene MAY expose bounded read-only archaeology and recommendations without mutating worktree state.

**Tags:** `status`, `health`, `worktree`, `read-only`

#### Scenarios

**Health reports retained state without cleanup** (`rq-healthReadOnlyWorktree01.1`)

**Given:**
- Pending or retained worktree cleanup state exists

**When:** The health view reads worktree diagnostics

**Then:**
- Bounded counts and classes are reported
- No cleanup queue is drained
- No worktree or branch is deleted

**Explicit cleanup remains mutation owner** (`rq-healthReadOnlyWorktree01.2`)

**Given:**
- A safe terminal cleanup candidate exists

**When:** A caller only requests health status

**Then:**
- Health recommends the typed cleanup surface
- Mutation does not run from status
- Explicit cleanup tooling retains its safety checks

**Hygiene archaeology remains advisory** (`rq-healthReadOnlyWorktree01.3`)

**Given:**
- Detailed retained-state archaeology is requested

**When:** The hygiene view renders it

**Then:**
- The read is bounded
- Exact paths remain privacy-safe and scope-appropriate
- No deletion is authorized by the diagnostic read

---

### Truthful, Bounded Worktree Timeout Reporting

**ID:** `rq-worktreeTimeoutTruthfulness01` | **Priority:** **[MUST]**

Worktree tool timeout responses must not assert a cause they did not test, and must not advise an action that cannot succeed.

The timeout branches of adv_worktree_cleanup, adv_worktree_delete, and adv_worktree_detach resolve a setTimeout sentinel rather than a rejection, so no error object exists to classify. These responses must therefore not assert a unreadable projection and must not carry an unconditional adv_doctor referral, unless poison evidence was actually collected on that call (see rq-worktreePoisonprojection lookup01).

Timeout remediation must name an action that can actually succeed. When the caller's timeoutMs was clamped to the safe budget, the response must not advise passing a larger timeoutMs, must state that the safe budget is a structural ceiling, and must not name an option the current mode ignores.

On timeout, adv_worktree_cleanup must report the stage in flight (discovery or drain), captured synchronously before any post-timeout await, plus either pendingDeleteCount or pendingDeleteCountUnavailable when the pending-delete read fails. An empty queue and an unreadable queue must remain distinguishable.

adv_worktree_cleanup accepts an optional skipDiscovery flag (worktrees mode only) providing drain-only recovery of already-queued pending deletes after a prior cleanup timed out during discovery. Drain-only must not delete worktrees that discovery never validated.

Git subprocesses on the cleanup discovery path must each be bounded strictly below the tool budget, derived per-call as min(2000, floor(effectiveTimeoutMs / 4)). Shared git helpers retain their original defaults when invoked from non-cleanup paths.

**Tags:** `worktree`, `timeout`, `diagnostics`, `truthfulness`, `bounded`, `recovery`

#### Scenarios

**Clamped remediation names a reachable action** (`rq-worktreeTimeoutTruthfulness01.1`)

**Given:**
- adv_worktree_cleanup is called with timeoutMs above the safe budget
- The call times out in either worktrees or archived_branches mode

**When:** The typed timeout response is produced

**Then:**
- remediation does not instruct the caller to pass a larger timeoutMs
- remediation states the safe budget is a structural ceiling
- remediation names only actions the current mode supports
- archived_branches remediation does not name skipDiscovery, which that mode ignores

**Unclamped remediation may still offer a larger timeout** (`rq-worktreeTimeoutTruthfulness01.2`)

**Given:**
- adv_worktree_cleanup times out with no clamp applied

**When:** The typed timeout response is produced

**Then:**
- remediation may offer a larger timeoutMs because that action is reachable

**No unevidenced poison claim on any worktree timeout** (`rq-worktreeTimeoutTruthfulness01.3`)

**Given:**
- adv_worktree_cleanup, adv_worktree_delete, or adv_worktree_detach times out
- No poison evidence was collected on that call

**When:** The typed timeout response is produced

**Then:**
- The error contains no assertion that a change projection is unreadable
- Neither error nor remediation carries an unconditional adv_doctor referral

**Cleanup timeout reports the stage in flight** (`rq-worktreeTimeoutTruthfulness01.4`)

**Given:**
- adv_worktree_cleanup times out

**When:** The typed timeout response is produced

**Then:**
- The response includes a stage of discovery or drain
- The stage is captured synchronously before any post-timeout await so a value advanced by the still-running inner promise is never reported
- A stage of discovery is reported only when discovery actually ran

**Unreadable pending-delete queue is distinguishable from an empty one** (`rq-worktreeTimeoutTruthfulness01.5`)

**Given:**
- adv_worktree_cleanup times out

**When:** The pending-delete read succeeds

**Then:**
- The response includes pendingDeleteCount
- When the pending-delete read instead fails, the response includes pendingDeleteCountUnavailable true and omits pendingDeleteCount

**Drain-only recovery skips discovery** (`rq-worktreeTimeoutTruthfulness01.6`)

**Given:**
- A prior cleanup timed out during discovery leaving pending-delete entries queued

**When:** adv_worktree_cleanup is invoked with skipDiscovery true in worktrees mode

**Then:**
- The discovery scan is skipped
- The stage observer fires only for drain
- Queued pending deletes are drained within the same safe budget
- No worktree that discovery never validated is deleted

**Discovery git subprocesses are bounded below the tool budget** (`rq-worktreeTimeoutTruthfulness01.7`)

**Given:**
- A git subprocess is invoked on the cleanup discovery path

**When:** That subprocess hangs

**Then:**
- It is terminated by its own timeout strictly below the tool budget
- Discovery does not rely on the outer race as its only guard
- Shared git helpers invoked from non-cleanup paths retain their original defaults

---

### Bounded Git-Authoritative Worktree Deletion Protocol

**ID:** `rq-worktreeDeletionProtocol01` | **Priority:** **[MUST]**

Worktree deletion MUST use Git worktree census as existence and identity authority, produce a typed expiring plan before destructive apply, revalidate every safety fact under a liveness-aware repository lock, and enforce one cancellable end-to-end deadline. Archive-owned historical recovery MUST be an explicit signed-plan mode. The plan token MUST bind merge identity, PR head, local head, ancestry direction, changed paths, canonical hashes, and terminal proof. Apply MUST revalidate every bound fact. Registry state is advisory metadata and MUST NOT be required to discover a Git-owned worktree. Timeout responses MUST be terminal: no child process, Git removal, hook, or registry mutation may continue after response.

**Tags:** `worktree`, `cleanup`, `safety`, `deadline`, `cancellation`

#### Scenarios

**Unregistered merged worktree can be planned** (`rq-worktreeDeletionProtocol01.1`)

**Given:**
- A clean merged linked worktree exists in Git census
- Its branch is absent from ADV registry

**When:** Deletion planning runs

**Then:**
- A typed plan binds repository, path, branch, HEAD, safety facts, integration proof, expiry, and token
- Registry absence is advisory and does not refuse planning

**Apply rejects drift under lock** (`rq-worktreeDeletionProtocol01.2`)

**Given:**
- A valid deletion plan exists
- Any bound Git or safety fact changes before apply

**When:** Apply revalidates under the repository cleanup lock

**Then:**
- The result is typed as drifted
- No git worktree remove command runs

**Deadline is terminal** (`rq-worktreeDeletionProtocol01.3`)

**Given:**
- A deletion stage exceeds the end-to-end operation deadline

**When:** The deadline expires

**Then:**
- All spawned process groups are terminated and confirmed exited
- The tool returns typed deadline stage evidence before the host ceiling
- No later deletion or metadata mutation occurs

**Branch families share one authority path** (`rq-worktreeDeletionProtocol01.4`)

**Given:**
- Git owns clean integrated change, release, and ad-hoc worktrees

**When:** Each is planned and applied

**Then:**
- All use the same planner and executor
- Only lifecycle-specific terminal proof differs
- Repeated apply returns already absent

**Historical recovery revalidates the signed plan under lease** (`rq-worktreeDeletionProtocol01.5`)

**Given:**
- A valid archive-owned historical recovery plan

**When:** Apply runs under the repository cleanup lease

**Then:**
- Apply revalidates every bound merge, ancestry, path, hash, cleanliness, CWD, lock, deadline, and terminal fact
- Any mismatch returns a typed refusal or drift result before git worktree remove
- force:true without the signed recovery plan cannot select this mode

---

### Archive-Directory-First Archived Classification

**ID:** `rq-archivedBranchCleanupInversion01` | **Priority:** **[MUST]**

The archived_branches cleanup scan MUST classify local change/* branches as archived by names-only directory membership in the target-routed archive directory (a single readdir of store.paths.archive) BEFORE any per-id change-status lookup. Archive-directory membership is authoritative archived evidence and MUST override stale active projections. per-id store.changes.get lookups are permitted ONLY for residual (non-member) ids and MUST keep the fail-closed omission mapping; store.changes.list remains forbidden. If the archive directory read fails, the scan MUST degrade to the per-id path with a recorded warning rather than crash. The classification MUST complete within the rq-worktreeBoundedCleanup02 safe budget for portfolios of at least 100 local change branches.

**Tags:** `worktree`, `cleanup`, `archive`, `performance`

#### Scenarios

**Archive membership overrides stale draft projection** (`rq-archivedBranchCleanupInversion01.1`)

**Given:**
- a local change/* branch whose changeId has a directory in the archive store
- the active projection still reports status draft

**When:** an archived_branches full scan runs

**Then:**
- the branch is classified archived (a deletion candidate)
- no not_archived omission is emitted for it
- store.changes.get is not called for it

**Residual ids keep fail-closed mapping** (`rq-archivedBranchCleanupInversion01.2`)

**Given:**
- a local change/* branch whose changeId is absent from the archive directory

**When:** the per-id residual lookup returns null or a load failure

**Then:**
- the branch is omitted with lookup_failed (never a candidate)
- store.changes.list is not called

**Scale within safe budget** (`rq-archivedBranchCleanupInversion01.3`)

**Given:**
- at least 100 local change branches of which at least 90 are archive members

**When:** a full archived_branches scan runs under the default 8s safe budget

**Then:**
- the scan completes without partial, or reports partial only with honest deadline_exceeded labels
- no archived member is mislabeled not_archived

**Archive read failure degrades safely** (`rq-archivedBranchCleanupInversion01.4`)

**Given:**
- the archive directory readdir raises an error

**When:** the scan builds archived candidates

**Then:**
- the scan falls back to the per-id lookup path
- a warning records the fallback
- the scan does not crash

---
