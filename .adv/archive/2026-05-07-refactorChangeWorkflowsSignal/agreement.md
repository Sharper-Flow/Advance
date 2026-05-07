# Agreement: Refactor Change Workflows to Signal-Driven Architecture

## Mission Anchor

ADV gives **human orchestrators** maximum power over their agentic workflows. Single user, single machine. Specs, wisdom, and brief change summaries are the durable artifacts; everything else is working memory.

This refactor makes ADV's Temporal usage match its actual workload (state machine + append-mostly events + per-change resume) instead of the current "Temporal as synchronous database" anti-pattern that produces the entire `Workflow Update failed` bug class.

## Objectives

| # | Objective |
|---|---|
| O1 | Eliminate the `Workflow Update failed` bug class (#39, #48, and the family) by switching from synchronous update handlers to fire-and-forget signal handlers. |
| O2 | Establish workflow as **single source of truth** for change state. Disk becomes a downstream cache for external readers (conformance CI, human inspection), not an authoritative store. |
| O3 | Drop project keying. Changes become global; specs/conformance/worktrees/wisdom remain project-local git artifacts. |
| O4 | Replace per-gate binary state (pending/done) with rich per-gate state machine (pending / in_progress / awaiting_approval / stuck / done) that produces dashboard buckets as a derived view. |
| O5 | Collapse TDD ceremony (phase machine, separate evidence calls, ledger queries) into a single `verification` field on `taskCompleted`. Trust the agent. |
| O6 | Delete the divergence-management infrastructure (`adv_workflow_repair`, `adv_change_diagnose`, `adv_orphan_sweep`, `adv_archive_sweep_orphans`, `adv_migrate_cleanup`, `adv_mesh_scan`). |
| O7 | Migrate the 7 currently-active changes via one-shot signal-replay script. Hard cutover acceptable. |
| O8 | Reduce `temporal/` LOC by ≥30% (~6,500 LOC removed from current 18,551). |
| O9 | Retire tool surfaces that no longer fit ADV's refined value vision (`adv_task_run_status`, `adv_task_tdd`, `adv_task_evidence`). Apply corresponding spec deltas. |

## Acceptance Criteria (locked from proposal SC1–SC10 + design SC11)

| # | Criterion | Verification |
|---|---|---|
| SC1 | Concurrent agents signaling the same change workflow produce no `Workflow Update failed` errors | Test: 3 agents × 50 signals each on same workflow, all applied without rejection |
| SC2 | Existing 7-gate sequence and HITL checkpoint behavior preserved | Existing test suite (gate.test.ts, change-state.test.ts, command asset tests) green |
| SC3 | All 24 slash commands continue to function with no behavioral regression | Command asset tests + manual end-to-end smoke of canonical workflows |
| SC4 | External CI conformance verification continues to function. Internal `adv_conformance action: 'run'` reads workflow state via query (strongly consistent). External CI workers read disk projection (eventually consistent, gate-transition cadence). | adv_conformance integration tests + external CI smoke run |
| SC5 | Worktree management surface preserved | adv-worktree.test.ts + manual create/delete/triage |
| SC6 | All 7 currently-active changes migrate cleanly via one-shot script | Dry-run comparison + executed migration |
| SC7 | Diagnostic/divergence tooling deleted | tool-registry inventory shows zero of: adv_workflow_repair, adv_change_diagnose, adv_change_import (post-migration), adv_orphan_sweep, adv_archive_sweep_orphans, adv_migrate_cleanup |
| SC8 | `temporal/` LOC reduction ≥30% | wc -l before/after |
| SC9 | Per-change signal traffic ≤300 events for representative change lifetime | Instrumented spike change |
| SC10 | Spike validates: concurrent signaling, continueAsNew at 5k events, disk projection cadence, migration script | Spike report with kill-criteria pass/fail recorded |
| SC11 | Spec deltas applied: `rq-taskRunLedger01`, `rq-TDD007req`, `rq-TDD009idem`, `rq-TDD010phase` deleted; `rq-ADVEXEC01.3`, `rq-ADVEXEC04.2`, `rq-TDD001inl.1`, `rq-TDD008path.2` amended (per Design § Section 10) | Inspection of `.adv/specs/advance-delivery.yaml` and `.adv/specs/tdd-contract.yaml` post-archive |

## Discovery Findings (Current-State Evidence)

### F1. Existing workflow surface

Confirmed via grep against `plugin/src/temporal/messages.ts` and `workflows.ts`:

| Surface element | Count today | Target |
|---|---|---|
| `wf.defineUpdate(...)` definitions | 28 | 0 (replaced by signals or deleted) |
| `wf.defineQuery(...)` definitions | 7 | 6 (similar; one consolidated) |
| `wf.defineSignal(...)` definitions | 1 (`applyChangeSummarySignal`) | 24 |

**Key finding:** the codebase already uses Temporal's signal API (just for one cross-workflow case). No SDK setup work needed. The pattern is proven.

### F2. Disk-read tool inventory

13 tool files do filesystem reads. Categorized:

| Category | Files | Action |
|---|---|---|
| **Legitimate disk reads (keep as-is)** | `conformance.ts` (CI verdict), `project.ts` (project.md config), `status.ts`/`worktree/in-use.ts` (/proc), `temporal-ops.ts` (worker.lock) | No change |
| **ADV state reads (refactor to query workflow)** | `change.ts` (proposal/agreement/design/problem-statement files) | Refactor: tools issue workflow query instead of reading disk |
| **Archive bundle readers (adapt to new archive contract)** | `reflection.ts` | Adapt to read durable trinity instead of full bundle |
| **Delete entirely** | `archive-sweep.ts`, `change-import.ts` (post-migration) | Delete |
| **Test mocks (update with refactor)** | `change.test.ts`, `gate.test.ts`, `target-mutation-tools.test.ts` | Update |

### F3. Deletion-target file sizes

Confirmed via lgrep file outlines:

| File | Approx LOC | Action |
|---|---|---|
| `temporal/migration.ts` | ~160 | Delete |
| `temporal/gate-reentry.ts` | ~42 | Delete (logic absorbed into signal handler) |
| `temporal/orphan-sweep.ts` | ~227 | Delete |
| `tools/change-diagnose.ts` | ~63 | Delete |
| `tools/change-import.ts` | ~131 | Delete after one-shot migration |
| `tools/archive-sweep.ts` | ~168 | Delete |
| `tools/mesh-scan.ts` | ~80 | Delete |
| `tools/migrate-cleanup.ts` | ~97 | Delete after one-shot migration |
| `tools/task-run-status.ts` (or equivalent) | ~50-100 | Delete (O9 retirement) |
| `tools/task-tdd.ts` (or equivalent) | ~80-120 | Delete (O9 retirement) |
| `tools/task-evidence.ts` (or equivalent) | ~100-150 | Delete (O9 retirement) |
| **Subtotal — direct deletion** | **~1,200-1,400 LOC** | |
| Plus their `.test.ts` siblings | ~1,800-2,500 LOC | |
| Plus simplification of workflows.ts, retry-wrapper.ts, worker-lock.ts, health-probe.ts | ~1,000-2,000 LOC | |
| **Estimated total reduction** | **~4,000-5,800 LOC** | SC8 target of ≥30% (=5,500 LOC) achievable with disciplined removal |

### F4. claude-tempo as positive control

Confirmed via repo clone + read:

- claude-tempo `session.ts` is 1,876 lines of rich domain logic (not infrastructure)
- Uses signals as primary mutation mechanism, updates only for atomic state transitions (claim/forceDetach/destroy)
- Per-host task queues for cross-host activity routing
- 10+ `patched()` markers showing healthy workflow code evolution
- `workflowNow()` helper documenting the determinism contract
- **No equivalent failure modes to ADV's `Workflow Update failed` family** — same library, structurally correct usage

This is the reference architecture for "what right looks like." Our refactor target matches the pattern.

### F5. Active changes for migration

Confirmed via `adv_change_list status: in-flight`:

7 active changes (all `draft` status):
- `removeBunTypesMainTsconfig` (4 tasks)
- `reconcilesessionlistwithdiagno` (0 tasks)
- `cleanupzombierunningworkflows` (0 tasks)
- `singleworkerperprojectpolicy` (0 tasks)
- `reconcilechangelistsourcesoftr` (0 tasks)
- `addAgentMeshAndInRepoArchive` (8 tasks, all completed)
- `makeAdvTaskEvidenceFallback` (5 tasks, all completed)

Migration script must handle all 7 cleanly. Two have completed work that must round-trip through replay.

## Constraints (Out of Scope)

| # | Out of scope |
|---|---|
| C1 | Replacing Temporal entirely. Signal-driven model retains Temporal because the signal mailbox + queue serialization is exactly the property we need. |
| C2 | Changes to the 7-gate sequence as a concept |
| C3 | Changes to the 24 slash command surface (preserved as user entry points) |
| C4 | Changes to skill/sub-agent orchestration |
| C5 | TUI/dashboard surfacing of new status buckets — backend supports them; UI is follow-on work |
| C6 | Health UI improvements for #33 — orthogonal; tracked separately |
| C7 | Issue #46 root-cause fix — addressed indirectly by smaller workflow surface; tracked separately |
| C8 | Bash-guard refactor / ADV self-update workflow — separate concern, another agent is already working on it |

## Identified Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | `continueAsNew` strategy needs validation for long-lived change workflows | Spike kill criterion: CAN at 5k events preserves queryable state. Most changes <1k events; rare to hit. |
| R2 | Disk projection cadence (gate-transition-only) might not satisfy all external readers | Spike validates conformance CI works; can tighten cadence if not. Internal reads use workflow query (strongly consistent). |
| R3 | Migration script must reproduce state from disk for all 7 active changes | Spike includes one-shot migration of one change end-to-end; full migration only after spike pass. Marker-signal barriers handle cross-name signal ordering. |
| R4 | Replay determinism still applies in workflow code | Smaller workflow surface = smaller risk; `patched()` markers + no `Date.now()`/`Math.random()`/file I/O in workflow code |
| R5 | Bash guard cached-dist friction may impede mid-spike work | Open OpenCode session in worktree directory; cwd-bound guards then pass |
| R6 | Trust-the-agent model may surface bad agent claims | Out of scope per mission (humans orchestrate, not auditors). Later gates (harden, conformance) catch lies in code/tests. |
| R7 | Retired tool surfaces (`adv_task_run_status`, `adv_task_tdd`, `adv_task_evidence`) may surprise users with downstream agents that depend on them | Spec deltas applied at archive; agent prompts and command files updated to remove references; migration script verifies no active task uses retired tools. |

## Open Questions for Design Phase

| # | Question | Status |
|---|---|---|
| Q1 | Concrete signal schema and Zod validators (full surface design) | RESOLVED (Section 1) |
| Q2 | Disk projection activity contract — exact write trigger conditions, file format | RESOLVED (Section 3) |
| Q3 | Migration script algorithm — read disk JSON, emit signals in order, verify state | RESOLVED (Section 8 with V4 marker barriers) |
| Q4 | `continueAsNew` strategy — when to fire, what to carry forward, retain history? | RESOLVED (Section 5 with V2 dual triggers) |
| Q5 | Tool-layer adapter pattern — how each tool maps to signal-fire, signal-then-query, or query-only | RESOLVED (Section 6) |
| Q6 | Cross-project workflow discovery — search attribute schema, indexing requirements | RESOLVED (Section 7 with V3 Keyword fix) |
| Q7 | Bucket derivation algorithm — pure function from gate states + lastSignalAt | RESOLVED (Section 2) |
| Q8 | Final archive contract — exact summary file format, when wisdom is promoted, when specs are promoted | RESOLVED (Section 4) |

## Architectural Decisions Carried Forward

These were locked during the conversation and remain agreed:

- **Mutation pattern:** signals (fire-and-forget, queue-serialized) replace updates
- **Read pattern:** queries (synchronous, return current state)
- **Source of truth:** workflow event history in Temporal Server's DB (via SDK, not direct)
- **Disk projection:** downstream cache for external readers; written on gate transitions + archive only; internal reads use workflow query
- **Storage tiers:** workflow state during change / worktree disk for working memory (gitignored) / git for durable trinity
- **Durable trinity:** brief change summary + spec deltas + wisdom entries (all git-tracked); all other working state dies on archive
- **Project keying:** dropped; changes are global; specs/conformance/worktrees/wisdom stay project-local
- **TDD enforcement:** completion signal carries `verification` free-text; agent owns the claim; no separate phase machine
- **Per-gate state machine:** pending/in_progress/awaiting_approval/stuck/done; buckets derived from current gate state
- **Recency banding:** dropped, replaced by status buckets

## Design Resolution (2026-05-05 — Path B: Retire Tool Surfaces)

The independent design validator (V6 pass, adv-researcher) returned `CONFLICT` against three current spec requirements: `rq-taskRunLedger01`, `rq-TDD007req`, and the cluster `rq-TDD008path.2` / `rq-TDD009idem` / `rq-TDD010phase` / `rq-ADVEXEC04.2`. The design deletes tool surfaces (`adv_task_run_status`, `adv_task_tdd`, `adv_task_evidence`) that those specs mandate.

The user chose **path B: retire the tool surfaces and amend the specs** — the affected requirements no longer fit ADV's refined value vision (single user, single machine, trust the agent, durable trinity). The retired surfaces all served audit/compliance use cases that don't help the human orchestrator.

**Decisions:**

1. **Add objective O9** — retire the 3 tool surfaces and apply spec deltas. (Above.)
2. **Add SC11** — verify spec deltas applied. (Above.)
3. **Spec delta catalog** lives in Design § Section 10 and is applied at archive Phase 9.
4. **V5 enforcement migration table extended** to cover sequential gate, execution-gate task completeness, and re-entry cascade reset (caution A1, Section 1).
5. **Disk projection read routing clarified** — internal reads strongly-consistent via workflow query; external CI workers eventually-consistent via projection (caution A3, Section 3).
6. **Cross-change worktree visibility** via `AdvWorktreeBranches` / `AdvWorktreePaths` search attributes (caution A2, Section 7).

This resolution is locked. Re-validation pending.

## Sign-off

This agreement locks objectives O1–O9 and acceptance criteria SC1–SC11. Open questions Q1–Q8 are resolved in design Sections 1–9. Discovery findings F1–F5 establish the current-state baseline. Constraints C1–C8 and risks R1–R7 are acknowledged. Design Resolution (2026-05-05) records the path-B decision for V6 CONFLICT findings.

Approval at the discovery gate signaled: "objectives and acceptance criteria are correct; we know the current state; design phase may now produce concrete signal schemas and migration plans against this contract."
