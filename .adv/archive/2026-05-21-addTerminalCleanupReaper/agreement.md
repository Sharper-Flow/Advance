# Agreement — Add terminal cleanup reaper

## Objectives

- **SC1:** Add one shared terminal cleanup path for terminal ADV worktrees.
- **SC2:** Preserve strict deletion safety: terminal change state, merged branch, clean worktree, and no live process CWD inside the worktree.
- **SC3:** Reuse existing delete and pending-delete primitives instead of introducing parallel deletion logic.
- **SC4:** Keep startup bounded while making manual/status/archive cleanup thorough.
- **SC5:** Surface retained terminal cleanup blockers clearly without normal status noise.
- **SC6:** Consolidate or remove stale standalone lifecycle cleanup behavior.
- **SC7:** Add spec-law and test coverage for lifecycle triggers, safety, retries, and visibility.

## Acceptance Criteria

### AC1: Shared terminal cleanup triggers
Terminal ADV worktrees are eventually cleaned through shared cleanup behavior from archive, manual cleanup, status discovery, and best-effort `session.deleted`.

### AC2: Bounded startup cleanup
Startup cleanup stays bounded: it drains already-known pending deletes only; full terminal discovery does not block plugin startup.

### AC3: Structural safety gate
A worktree is deleted only when all safety checks pass: owning change is `archived` or `closed`, branch is merged to default, worktree is clean, and no live process has CWD inside it.

### AC4: Durable terminal-state verification
Reaper eligibility verifies terminal change state from durable ADV state; it must not rely on `census.cleanupEligible` alone.

### AC5: Existing delete primitive reuse
Deletion delegates to existing `advWorktreeDelete`; no parallel `git worktree remove` path is introduced.

### AC6: In-use retention and retry queue
In-use terminal worktrees are retained and queued/preserved for retry.

### AC7: Exhausted pending-delete retry
Manual terminal cleanup retries retained pending deletes after automatic retry caps are exhausted.

### AC8: Retained blocker visibility
`adv_status` reports retained cleanup blocker counts/classes only; `adv_worktree_triage` reports exact branches, paths, blockers, attempts, and remediation.

### AC9: Single lifecycle path
Manual cleanup, startup cleanup, `session.deleted`, status cleanup, and archive cleanup use the shared pending-delete drain behavior.

### AC10: Spec-law coverage
The worktree-lifecycle spec declares terminal cleanup reaper, safety, visibility, and lifecycle requirements.

### AC11: Verification coverage
Tests cover shared drain behavior, bounded startup, discovery, retry classification, status/triage visibility, and direct-delete guardrails.

## Constraints

- **C1:** Do not run full discovery during startup.
- **C2:** Do not rely on census advisory eligibility as deletion authority.
- **C3:** Preserve pending-delete retry/idempotency behavior.
- **C4:** Keep status aggregate-only; detailed paths belong in triage.
- **C5:** Treat cleanup as best-effort where it is triggered by lifecycle/status paths.
- **C6:** Preserve worktree isolation and do not delete live CWDs.

## Avoidances

- **DONT1:** Do not make startup cleanup a broad scan.
- **DONT2:** Do not introduce direct `git worktree remove` calls outside the existing primitive.
- **DONT3:** Do not make `adv_status` noisy with exact retained paths.
- **DONT4:** Do not bypass durable store verification for `change/*` terminal state.
- **DONT5:** Do not weaken existing merge/clean/live-CWD safety checks.
- **DONT6:** Do not recommend manual filesystem/git deletion for ADV worktrees.

## Sign-Off

Approved by user exact reply: `approve`.
