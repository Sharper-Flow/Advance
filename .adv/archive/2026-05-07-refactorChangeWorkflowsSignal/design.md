# Design: Signal-Driven Change Workflows

> **Note:** This document is mirrored to `docs/decisions/2026-05-04-signal-driven-change-workflows.md` (git-tracked, durable). That file is the canonical long-term record. This `design.md` is the workflow-state working copy during the change lifetime.

> **Status:** all 9 sections drafted + Section 10 spec deltas (comprehensive) added; CONFLICT (V6) resolved via path-B; V7 CAUTION verdict — 6 spec-coherence cautions folded into Section 10; design gate ready.
> **Last updated:** 2026-05-05
> **Validator history:**
> - V1-V5: refined design through 5 iterative passes (continueAsNew triggers, search-attribute Keyword type + client-side sort, migration marker barriers, gate-batched replay, enforcement-layer migration)
> - V6: CONFLICT (3 spec-law conflicts: rq-taskRunLedger01, rq-TDD007req, rq-TDD008path/009/010/ADVEXEC04.2 cluster) + 3 cautions (A1 enforcement gaps, A2 worktree visibility, A3 read routing)
> - V7: CAUTION — all V6 conflicts RESOLVED, all V6 cautions ADDRESSED. 6 new spec-text coherence findings (dangling references to retired concepts) folded into Section 10 delta catalog.

## Path-B Resolution Summary (2026-05-05)

The V6 validator returned `CONFLICT` against current spec requirements that mandate tool surfaces the design deletes. The user chose to retire the tool surfaces because they no longer fit ADV's refined value vision (single user, single machine, trust the agent, durable trinity).

**Retired tool surfaces:**

| Tool | Specs retired | Specs amended |
|---|---|---|
| `adv_task_run_status` | `rq-taskRunLedger01` (advance-delivery) | `rq-ADVEXEC04.1` value-category text |
| `adv_task_tdd` (reclassification) | `rq-TDD007req` (tdd-contract) | — |
| `adv_task_evidence` | `rq-TDD009idem`, `rq-TDD010phase` (tdd-contract) | `rq-TDD001inl` (body + `.1`), `rq-TDD008path.2` deleted, `rq-TDD008path.3` given, `rq-ADVEXEC01.3` deleted, `rq-ADVEXEC04.2` deleted |

**V7 spec-text coherence amendments (additional, beyond direct retirements):**

| Spec | Requirement | Reason |
|---|---|---|
| `advance-delivery` | `rq-ADVEXEC04.1` | Drops "task-run ledger continuity" value category (ledger retired) |
| `tdd-contract` | `rq-TDD001inl` body | Drops `tdd_phase` field reference (phase machine retired) |
| `tdd-contract` | `rq-TDD008path.3` given | Drops `adv_task_evidence` from disjunction (tool retired) |
| `advance-meta` | `rq-worktreeRegistry01` | Replaces `ProjectWorkflowState.worktree_registry` with change-workflow state + search attributes |
| `advance-meta` | `rq-multiSessionCoordination01` | Replaces "workflow updates" with "workflow signals"; per-change workflow not project workflow |
| `worktree-lifecycle` | `rq-wl-branchRegistry01` body | Replaces `ProjectWorkflowState.worktree_registry` reference |
| `worktree-lifecycle` | `rq-worktreeReuse01.1` | Replaces "project-workflow recovery" reference (cosmetic; info-only) |

**Cautions addressed inline:**
- **A1** — V5 enforcement migration table extended in canonical Section 1 (sequential gate enforcement, execution-gate task completeness, re-entry cascade reset).
- **A2** — Cross-change worktree visibility via `AdvWorktreeBranches` / `AdvWorktreePaths` search attributes (canonical Section 7).
- **A3** — Disk projection read routing clarified: internal reads via workflow query (strongly consistent); external CI workers via projection (eventually consistent) (canonical Section 3, SC4 amendment).

**Mission justification (path B):** The retired surfaces all served audit/compliance use cases on a single machine where the human orchestrator already has agent context, git history, and downstream gate verification. The verification field on `taskCompletedSignal` carries whatever the agent claims; if the agent lies, downstream gates (`/adv-review`, `/adv-harden`, conformance CI) catch the lie in code/tests, not in a Temporal ledger.

See canonical Section 10 for the full spec delta catalog (4 retired + 3 scenario-deletes + 7 modifications) and tool-layer boundary enforcement preserved by the resolution.

## Table of Contents

| Section | Question | Status |
|---|---|---|
| 1. Signal Schema (+ V5/V6 enforcement layer migration) | Q1 + A1 | ✓ |
| 2. Bucket Derivation | Q7 | ✓ |
| 3. Disk Projection Contract (+ V6 read path routing) | Q2 + A3 | ✓ |
| 4. Archive Contract | Q8 | ✓ |
| 5. continueAsNew Strategy | Q4 | ✓ |
| 6. Tool Adapter Pattern | Q5 | ✓ |
| 7. Cross-Project Discovery (+ V6 cross-change worktree lookup) | Q6 + A2 | ✓ |
| 8. Migration Script | Q3 | ✓ |
| 9. Removal & Test Strategy (Apply Efficiency) | new | ✓ |
| 10. Spec Deltas (V6 CONFLICT + V7 coherence resolution) | new (path B) | ✓ |

For the full design content, see the canonical git-tracked record at:
`docs/decisions/2026-05-04-signal-driven-change-workflows.md` (770 lines)

This workflow-state copy is intentionally a pointer to avoid duplicate-edit drift between the workflow projection and the git-tracked source of truth.

## Quick Reference

### Signal Surface (24 new + 1 retained = 25 total)

Document/metadata (5), Task lifecycle (7), Gate state (5), Wisdom/reflection (2), Worktree (2), Conformance (3), Lifecycle (2). See canonical Section 1.

### Status Buckets (derived)

`awaiting_approval` | `in_flight` | `stuck` | `drifting` | `ready_to_archive` | `never_started`. Pure function in `plugin/src/utils/buckets.ts`.

### Disk Projection

~10 disk writes per change (gate transitions only). Internal reads via workflow query. External CI via projection.

### Search Attributes

Cross-project: `AdvChangeId`, `AdvChangeStatus`, `AdvChangeTitle` (Keyword), `AdvAffectedProjects`, `AdvAffectedPaths`, `AdvCurrentGate`, `AdvCurrentBucket`, `AdvLastSignalAt`, `AdvCreatedAt`. Cross-change worktree (V6 A2): `AdvWorktreeBranches`, `AdvWorktreePaths` (KeywordList). Sort client-side.

### continueAsNew

Defensive: `historyLength > 5,000` OR `info.continueAsNewSuggested === true`. Safe point: after `allHandlersFinished()`.

### Removal Strategy

Rip out and rewrite. Don't salvage. M1-M6 milestones with broken-build windows acceptable.

### Spec Deltas (Section 10)

- **Retired (delete):** `rq-taskRunLedger01`, `rq-TDD007req`, `rq-TDD009idem`, `rq-TDD010phase`
- **Scenario-deleted:** `rq-ADVEXEC01.3`, `rq-ADVEXEC04.2`, `rq-TDD008path.2`
- **Modified:** `rq-ADVEXEC04.1`, `rq-TDD001inl` (body + `.1`), `rq-TDD008path.3` given, `rq-worktreeRegistry01`, `rq-multiSessionCoordination01`, `rq-wl-branchRegistry01`, `rq-worktreeReuse01.1`
- **Preserved:** all other requirements in `advance-delivery`, `tdd-contract`, `advance-meta`, `worktree-lifecycle` (inline-TDD model, classifier, inversion detection, exit-code semantics, checkpoint contract, asset/regression anchors, runtime guards)

Applied at archive Phase 9 via direct edits to `.adv/specs/*.yaml`.