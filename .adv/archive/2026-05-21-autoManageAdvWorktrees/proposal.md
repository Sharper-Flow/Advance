# Auto-manage ADV Worktrees

## Intent

Make ADV worktree isolation structural and automatic — not agent-optional. Today, worktree creation is a manual agent decision (only `adv-apply` Phase 0.1 structurally creates one), the mutation guard defaults to off (`worktree_guard_enforce: false`), and cleanup after archive is advisory. This change makes the full worktree lifecycle automatic: creation at the right gate, enforcement during mutation gates, and reliable eventual cleanup of terminal worktrees.

## Problem Statement

ADV changes currently run in whatever checkout the agent happens to be in. The `worktree_guard_enforce` flag exists but defaults off, so agents can (and do) mutate the main checkout during discovery/design/prep — risking trunk contamination. The only structural worktree creation point is `adv-apply` Phase 0.1, but by then 3 gates (proposal → discovery → design) have already completed, potentially from the main checkout. Worktree cleanup after archive exists, but terminal worktrees can still survive when archive/session cleanup is missed, when `/exit` cannot run reliable async plugin cleanup, or when a prior delete was queued while the worktree was still in use.

This creates four failure classes:
1. **Trunk contamination** — agent writes implementation files to main checkout during design/prep
2. **Missing isolation** — concurrent changes on same project share working directory
3. **Orphan worktrees** — archive completes but cleanup doesn't fire because the session wasn't in a worktree
4. **Terminal worktree leaks** — completed/dead change worktrees survive because cleanup depends on a single lifecycle trigger or queued delete retry

## Scope

### In Scope
- `plugin/src/tools/gate.ts` — auto-create worktree before gate completion (at discovery gate entry)
- `plugin/src/tools/worktree-isolation-guard.ts` — flip `worktree_guard_enforce` default to `true`
- `plugin/src/tools/adv-worktree.ts` — automatic creation integration from gate flow and manual cleanup behavior
- `plugin/src/tools/worktree/index.ts` — lifecycle integration hooks and removal/consolidation of stale standalone event logic
- Shared worktree reaper helper — enumerate terminal ADV worktrees, apply structural safety gates, delete eligible worktrees, and queue retained in-use worktrees
- Plugin startup and `session.deleted` best-effort trigger wiring for eventual cleanup
- `adv_worktree_cleanup` — drain both queued pending deletes and terminal leftover worktrees
- `adv_worktree_triage` / status visibility — surface terminal-not-cleaned, in-use terminal, dirty terminal, unmerged terminal, and pending-delete states
- `plugin/src/tools/gate.ts` + `plugin/src/tools/task.ts` — mutation guard enforcement
- `.opencode/command/adv-*.md` — update command protocols for auto-worktree flow and cleanup guarantees
- `ADV_INSTRUCTIONS.md` — update worktree integration section
- Tests for all above

### Out of Scope
- `renameAdvWorktreeNamespace` — separate draft change
- Warp/terminal mode changes — already handled by existing `resolveEffectiveWorktreeMode`
- Cross-project worktree coordination beyond worktree path routing and cleanup target enumeration already in scope
- File-overlap scan at prep (separate concern)
- OpenCode core shutdown-hook changes; `/exit` remains best-effort from ADV's perspective
- Deleting dirty, unmerged, active, or in-use worktrees
- Broad repository cleanup unrelated to ADV-managed worktree lifecycle

### Must Not
- Must not depend on OpenCode `/exit` as the only cleanup trigger
- Must not delete worktrees unless terminal change state, merged branch, clean worktree, and no live process CWD checks pass
- Must not silently discard queued pending deletes or uncommitted work
- Must not duplicate lifecycle logic between active Advance plugin hooks and stale standalone `WorktreePlugin` code paths
- Must not bypass existing branch deletion safety or worktree path resolution helpers

## Success Criteria

- [ ] When a change starts the discovery workflow, a worktree is automatically created before any discovery-phase mutation
- [ ] `worktree_guard_enforce` defaults to `true`; existing projects with explicit `false` continue to work
- [ ] Gate completion (discovery+) and task mutations structurally block from main checkout when guard is on
- [ ] Archive Phase 9 cleanup fires reliably regardless of how the session entered the worktree
- [ ] Terminal ADV worktrees are eventually reaped via multiple triggers: archive, plugin startup, manual `adv_worktree_cleanup`, and best-effort `session.deleted`
- [ ] `adv_worktree_cleanup` processes both queued pending deletes and terminal leftover worktrees
- [ ] Cleanup only deletes when the structural safety gate passes: terminal change, merged branch, clean worktree, and no live process CWD
- [ ] Triage/status surfaces terminal worktree cleanup blockers instead of hiding them behind manual inspection
- [ ] Stale standalone worktree lifecycle logic is removed or consolidated behind the same shared reaper
- [ ] All existing tests pass; new tests cover auto-creation and terminal reaper flows

## Affected Code

Likely affected surfaces:

- `plugin/src/tools/worktree/index.ts` — delete/resume/cleanup implementation, stale standalone plugin event path
- `plugin/src/tools/adv-worktree.ts` — public ADV cleanup tool wiring
- `plugin/src/tools/worktree/triage.ts` — cleanup blocker classes
- `plugin/src/index.ts` / plugin init lifecycle — startup and `session.deleted` best-effort reaper trigger
- `plugin/src/tools/gate.ts` and `plugin/src/tools/task.ts` — isolation guard enforcement
- `plugin/src/tools/worktree/state.ts` — pending delete state read/write remains external-state backed
- Tests under `plugin/src/tools/worktree/*.test.ts`, `plugin/src/tools/adv-worktree.test.ts`, and relevant asset tests
- Workflow/spec docs: `.opencode/command/adv-*.md`, `ADV_INSTRUCTIONS.md`, `.adv/specs/*` if discovery confirms a spec delta

## Related Repositories

Current repo only for implementation. Cross-project behavior matters as an ADV feature because target-project and product-linked worktrees must be enumerated/cleaned through their own repo roots, but no separate repository change is proposed yet.

## Constraints

- Existing branch deletion safety remains: terminal/archived-or-closed, merged, clean, not in use.
- Existing pending-delete queue semantics remain durable and retryable.
- Startup and `session.deleted` cleanup must be bounded and best-effort; correctness must come from eventual reaping across triggers.
- Source edits to plugin runtime require `pnpm run build` and OpenCode restart for live tool validation.
- Proposal gate is already complete; this is a scope expansion that reopens discovery/design/planning/execution.

## Impact

- Reduces leaked ADV worktrees and dead branches after archive or cancellation.
- Makes cleanup observable instead of relying on agents remembering manual `adv_worktree_cleanup`.
- Avoids unsafe `/exit` dependence by making cleanup idempotent and multi-trigger.
- May require adding or adjusting task graph items for the reaper and triage/status surfaces.

## Context

Quick checks performed during proposal refinement:

- Active change overlap: `autoManageAdvWorktrees` already owns automatic worktree lifecycle and had pending cleanup task `tk-b200b621524b`.
- Existing code: `adv_worktree_delete` queues pending deletes when `isWorktreeInUse()` is true; `adv_worktree_cleanup` drains only queued pending deletes.
- Existing active plugin path: Advance `session.deleted` currently closes session/store state but does not run the worktree cleanup path.
- Existing stale path: standalone `WorktreePlugin` source has `session.deleted` cleanup logic, but that event path is not wired into active Advance plugin dist.
- OpenCode plugin docs list `session.deleted`, but current public issue evidence shows no reliable async shutdown hook; therefore `/exit` must remain best-effort, not correctness-critical.
- Spec search did not find an existing explicit requirement for terminal worktree reaper semantics.

## Discovery Findings — Reopened Terminal Reaper Scope

### Discovery Checklist

| Step | Result | Evidence |
|---|---|---|
| Skill Discovery | PASS | Loaded `adv-worktree`; pending-review scan found no pending skill frontmatter (only template text in `adv-skill-author`). |
| Prior Research Extension | PASS | Cited `docs/worktree-adv-integration-strategy.md`, `docs/repo-improve-prep.md`, and `docs/change-contract-traceability-prep.md`; new findings below. |
| Conflict & Related-Work Scan | PASS | Active overlap is this change; adjacent active changes: `fixWarpSessionLookup`, `addArchiveCleanupScanner`; agenda overlaps: `ag--cLGGs_E`, `ag-DvnHAk7B`, `ag-iMDCWjqt`, `ag-Vc_f34eL`. Validation passes with expected `NO_DELTAS` warning. |
| Edge Case Investigation | PASS | Edge cases listed below for lifecycle triggers, safety gate, pending-delete exhaustion, status visibility, and duplicate cleanup. |
| Design Question Depth | PASS | Technical questions resolved or carried into design with trust/blast-radius notes. User-facing questions answered in discovery loop. |
| Draft Spec Delta Shapes | PASS | Drafted worktree-lifecycle and advance-workflow deltas for terminal reaper and status visibility. |
| Related Pattern Scan | PASS | Similar lifecycle/reconciliation patterns found in `branch-integration.ts`, `worktree/census.ts`, `status.ts`, and archived worktree changes. |
| LBP Check | PASS | Internal structural reaper is the best direction; no external tool replaces ADV-owned lifecycle semantics. |
| Opportunity Scout | PASS | Scout produced five candidates; two safety/architecture findings escalated into design/AC. |

### Skills Considered

| Skill | Match | Action |
|---|---|---|
| `adv-worktree` | Strong | Loaded; confirms 3-condition delete discipline, merge-before-delete, and triage role. |
| `adv-opportunity-scout` | Required by discovery | Loaded and executed via `adv-researcher`; findings integrated below. |
| `lgrep` | Tooling policy | Used exact text search after earlier semantic timeout. |
| `customize-opencode` | Weak | Not loaded for implementation methodology; OpenCode core shutdown-hook changes are out of scope. |

### Extends

- `docs/worktree-adv-integration-strategy.md` — historical Option B already chose ADV-owned worktree lifecycle and single authority. New finding: terminal reaper should continue Option B by using active ADV plugin paths, not stale standalone plugin event handlers.
- `docs/repo-improve-prep.md` — identifies `worktree/index.ts` as a locality hotspot. New finding: put terminal reaper in a focused `tools/worktree/reaper.ts` helper or similarly local split, instead of adding more lifecycle logic to the mega-file.
- `docs/change-contract-traceability-prep.md` — argues for structural contract proof. New finding: cleanup/reaper obligations should become explicit AC/spec deltas so review/archive can prove them instead of relying on prose.
- Archived `fixWorktreeTerminalStatusGate` — terminal now means `archived` or `closed`. New finding: reaper should reuse this terminal set and not invent archived-only semantics.
- Archived `fixWorktreeDeleteRegistryDrift` — missing-registry delete recovery already proves archived/merged/clean before deletion. New finding: reaper should delegate per-worktree deletion to `advWorktreeDelete` to inherit that safety.
- Archived `fixWorktreeSessionRoot` — session registry is retired/no-op and double-init hooks need idempotency. New finding: startup/session-deleted reaper wiring must not depend on retired session records and must be singleton/bounded.

### Conflict Scan

- `autoManageAdvWorktrees` is the owning change; re-entry is already recorded from discovery.
- `fixWarpSessionLookup` may touch warp/session lookup behavior; coordinate only if both modify `plugin/src/index.ts` or workspace-warp surfaces.
- `addArchiveCleanupScanner` touches archive cleanup, but its scope is terminal temp/session artifact cleanup, not git worktree reaping. Avoid merging those responsibilities.
- `ag--cLGGs_E` and `ag-DvnHAk7B` are guard-related bugfix agenda items; this change should absorb or supersede only if implementation directly resolves them.
- `ag-iMDCWjqt` is archive dirty-trunk integration; adjacent to Phase 9 but distinct from terminal worktree reaper.
- `ag-Vc_f34eL` warp endpoint hang is adjacent; do not expand into warp mode fixes.
- `adv_change_validate` passes; `NO_DELTAS` warning remains expected until spec deltas are added.

### Current State

- `worktree-lifecycle` spec already defines branch-aware registry, git-first reconciliation, resume/materialization, cleanup eligibility tracking, and mutation guard.
- `plugin/src/utils/branch-integration.ts` defines the delete gate: terminal (`archived` or `closed`), merged, and clean.
- `plugin/src/tools/worktree/in-use.ts` adds the live CWD check via `/proc/*/cwd`.
- `advWorktreeDelete` queues a pending delete when the worktree is in use and delegates workspace cleanup + parent directory reaping after successful remove.
- `advWorktreeCleanup` currently drains queued pending deletes only; it does not enumerate terminal leftover worktrees.
- Standalone `WorktreePlugin` source has `session.deleted → processPendingDeletes`, but active Advance plugin `session.deleted` only closes state and does not call worktree cleanup.
- `worktree/census.ts` already computes `cleanupEligible` and `cleanupBlockedBy` from dirty/merged/live state, but it does not include terminal change state.
- `adv_status` has a TTL-bounded worktree census and currently surfaces total/stale counts, not terminal cleanup blockers.
- Existing git worktree flock serializes create operations; delete/reaper concurrency needs explicit design.

### Edge Cases

| Gap | Edge cases / failure modes |
|---|---|
| Lifecycle trigger reliability | `/exit` exits before async cleanup finishes; `session.deleted` fires after store close; startup reaper races with another session; multiple sessions run reaper concurrently. |
| Safety gate completeness | Active change branch is merged but still in development; closed change is unmerged; worktree is clean in git but process CWD is inside it; registry missing but branch name implies change id. |
| Pending deletes | Pending delete hits max attempts and session cleanup skips it; pending-delete file says path A but git worktree moved/removed; in-use worktree becomes eligible after shell exits. |
| Status visibility | Summary becomes noisy if every blocker is listed; health-only hides real cleanup leaks; status scan becomes expensive if it does N workflow reads per render. |
| Duplicate lifecycle logic | Active plugin and stale `WorktreePlugin` diverge; standalone path calls cleanup without Store so terminal status cannot be verified; reaper bypasses `advWorktreeDelete` and misses parent-dir cleanup. |
| Cross-project/product cleanup | Target repo has its own project id/worktree base; scope repo cleanup failures should not block other repo cleanup; missing secondary repo path must report blocker, not delete by guessed path. |

### Open Design Questions

| Question | Trust model | Blast radius | Alternatives / recommendation |
|---|---|---|---|
| Where should shared reaper live? | Agent-resolved | Wrong location worsens `worktree/index.ts` hotspot and duplicates logic. | Prefer `plugin/src/tools/worktree/reaper.ts`, exporting pure-ish classification + orchestration helpers; keep `index.ts` delete primitive. |
| How should terminal candidates be enumerated? | Agent-resolved | Git-only scan misses branch-only registry entries; Visibility-only scan can miss drift. | Use hybrid: git/census for concrete worktrees plus store/visibility-backed terminal verification. Design should consider a terminal visibility query for `archived|closed` worktree branches. |
| How should startup and `session.deleted` run? | Agent-resolved | Running after store close or blocking startup can fail/hang. | Startup: bounded fire-and-forget after store init. `session.deleted`: bounded best-effort before `store.close()`. Both share same reaper and lock. |
| How should concurrent reapers be serialized? | Agent-resolved | Double `git worktree remove` causes noisy failures or races. | Reuse or extend git-worktree flock around deletion/reaper critical section; do not rely on process-local booleans only. |
| Should closed/cancelled worktrees auto-delete? | User-resolved | Wrong default either leaks closed changes or deletes unexpectedly. | User answered: yes, same safe terminal gate as archived. |
| How aggressive should startup cleanup be? | User-resolved | Report-only weakens eventual cleanup; auto-delete needs trust in safety gate. | User answered: auto-delete safe eligible terminal worktrees. |
| Where should blockers surface? | User-resolved | Too quiet hides leaks; too noisy clutters status. | User answered: normal `adv_status` short warning + detailed triage. |

### Draft Spec Deltas

- `rq-terminalWorktreeReaper01` — Terminal worktree reaper lifecycle.
  - Given an ADV worktree branch belongs to a terminal change (`archived` or `closed`),
  - When archive cleanup, plugin startup, manual cleanup, or best-effort session deletion runs,
  - Then the shared reaper attempts cleanup only after terminal, merged, clean, and not-in-use checks pass.
- `rq-terminalWorktreeReaper01.1` — Pending-delete retention and retry.
  - Given a terminal worktree is still in use,
  - When cleanup runs,
  - Then the worktree is retained and queued/preserved for retry without losing prior pending-delete state.
- `rq-terminalWorktreeReaper01.2` — Reaper concurrency safety.
  - Given multiple sessions can trigger cleanup,
  - When two reapers run concurrently,
  - Then git worktree deletion is serialized and duplicate cleanup attempts are idempotent/noisy-only.
- `rq-worktreeCleanupVisibility01` — Cleanup blocker visibility.
  - Given terminal worktrees are retained due to dirty, unmerged, in-use, or pending-delete blockers,
  - When `adv_status` or `adv_worktree_triage` runs,
  - Then the user sees concise default warnings and detailed blocker records without manual git inspection.
- `rq-worktreeLifecycleSinglePath01` — Single cleanup lifecycle implementation.
  - Given active Advance plugin lifecycle hooks and legacy standalone worktree plugin code paths exist,
  - When terminal cleanup behavior is implemented,
  - Then all active triggers call one shared reaper or stale inactive event logic is removed.

### Related Pattern Scan

- `plugin/src/utils/branch-integration.ts` — structural delete gate already enforces terminal/merged/clean.
- `plugin/src/tools/worktree/in-use.ts` — live CWD guard should be part of terminal reaper safety.
- `plugin/src/tools/worktree/census.ts` — reusable dirty/merged/live cleanup eligibility classification, but missing terminal state.
- `plugin/src/tools/worktree/index.ts` — pending-delete queue and `advWorktreeDelete` path already handle in-use retention, OpenCode workspace cleanup, `git worktree remove`, empty-parent reaping, and worktree-deleted signal.
- `plugin/src/tools/status.ts` — existing TTL worktree census can host concise cleanup warning counts.
- `plugin/src/utils/git-worktree-flock.ts` — existing per-project git lock pattern likely reusable for delete/reaper serialization.
- Archived `fixWorktreeSessionRoot` — idempotent singleton handler pattern for double-init lifecycle surfaces.

### LBP Check

Best direction remains internal structural reaper inside ADV. External alternatives are not viable because the required correctness depends on ADV change status, gates, worktree registry/projections, and git integration state. OpenCode currently exposes `session.deleted`, but public issue evidence for a plugin shutdown hook shows no reliable async shutdown/exit hook; therefore `/exit` must be one best-effort trigger among several.

Long-term best practice:

1. Use one shared reaper implementation.
2. Delegate actual deletion to `advWorktreeDelete` so existing safety, workspace cleanup, parent-dir cleanup, and signals remain centralized.
3. Compose with `reconcileWorktreeRegistry` for dirty/merged/live classification, then add terminal-change-state verification.
4. Serialize delete/reaper critical sections with the existing git-worktree flock pattern.
5. Keep `session.deleted` bounded and best-effort; make startup/manual/archive triggers provide eventual correctness.

### Discovery Opportunity Scout

Scout attempted via `adv-researcher`; 5 candidates returned.

Auto-adopted into design/AC:

- Add explicit terminal-candidate enumeration strategy; existing active-worktree visibility query excludes archived/closed changes.
- Reaper must not rely on `cleanupEligible` alone; it must add terminal change-state verification.
- Reaper should compose from `reconcileWorktreeRegistry` where practical.
- Reaper must delegate deletion to `advWorktreeDelete` to preserve empty-parent cleanup and existing gate behavior.
- Reaper must handle exhausted pending-delete attempts for terminal worktrees.

Surfaced/resolved with user:

- Closed/cancelled cleanup eligibility: yes, same safe terminal gate.
- Startup cleanup aggressiveness: auto-delete eligible safe terminal worktrees.
- Blocker visibility: normal status warning plus detailed triage.

### Recommended Objectives

1. Make worktree auto-creation and mutation isolation structural and default-on for newly created changes.
2. Preserve backward compatibility for existing changes and explicit flag-off projects.
3. Support cross-project and product-linked worktree creation/routing/cleanup.
4. Make terminal worktree cleanup eventual via archive, startup, manual cleanup, and best-effort `session.deleted`.
5. Keep terminal cleanup safe: terminal status, merged branch, clean worktree, no live CWD.
6. Centralize cleanup through one shared reaper and existing `advWorktreeDelete` delete primitive.
7. Surface retained terminal cleanup blockers in normal status and detailed triage.
8. Add spec/test coverage for reaper triggers, safety gates, concurrency, pending-delete behavior, and observability.

### AMBIGUITY ANALYSIS — no ambiguity findings. Coverage: B:C F:C S:C M:C

Evidence scan:

- B clear: proposal has populated In Scope, Out of Scope, and Must Not sections.
- F clear: success criteria cover auto-creation, default guard flip, task/gate blocking, archive cleanup, terminal reaper triggers, cleanup safety gate, observability, stale lifecycle cleanup, and tests.
- S clear: completion signals are testable through cleanup behavior, `adv_worktree_cleanup`, status/triage visibility, and full test suite.
- M clear: discovery resolved codebase/current-state unknowns enough to proceed; design questions are technical and agent-resolvable except user preferences, which were answered.
