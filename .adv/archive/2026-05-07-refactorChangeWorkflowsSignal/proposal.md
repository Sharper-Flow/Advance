## Autopilot Mode

approved_mode: autopilot
autopilot_invoked_at: 2026-05-05T03:15:00Z
autopilot_scope: routine checkpoints (proposal, discovery, design, prep, acceptance) — Tier B (archive sign-off, cancellation) and system interrupts preserved.

---

# Refactor change workflows to signal-driven state-holder architecture

## Outcome

Replace ADV's current "workflow-as-database" Temporal usage with a signal-driven state-holder model:

- Workflow becomes the single source of truth for change state
- Mutations happen via signals (fire-and-forget, queue-serialized)
- Reads happen via queries (synchronous, return current state)
- Disk becomes a downstream cache for external readers, not an authoritative store
- Per-gate state machine (pending / in_progress / awaiting_approval / stuck / done) replaces binary gate states and produces dashboard buckets as a derived view
- Project keying is dropped: changes are global; specs/conformance/worktrees stay project-local
- TDD ceremony (phase machine, separate evidence calls) collapses to a single `verification` field on `taskCompleted`
- Diagnostic/divergence machinery is deleted (~5,000-7,000 LOC)

## Why

Concurrent multi-session usage produces opaque `Workflow Update failed` errors that block work. Recovery paths often fail. The bug class has produced ~17 closed issues post-Temporal cutover and ~4 still open. Root cause: ADV's domain (state machine with append-mostly events) is structurally fitted to Temporal's signal model, not the update model. Reference proof: claude-tempo uses Temporal correctly for a similar workload and exhibits none of ADV's failure modes.

## Surface

- Workflow surface: 24 signals + 6 query handlers (vs current 30+ updates and similar query count)
- Tool layer: thin adapters over signals/queries; most tools return immediately after firing signal
- Storage: three tiers (workflow state during change / worktree disk for working memory / git for durable trinity)
- Archive contract: brief change summary + spec deltas + wisdom (the durable trinity); full proposal/design/etc. die on archive
- Cross-project: native via global Temporal namespace + Temporal search attributes for discovery
- Multi-session: native via signal queue serialization

## Success Criteria

This change ships when ALL of the following are true:

- **SC1** — Concurrent agents signaling the same change workflow do not produce `Workflow Update failed` errors. Verified via test: spawn 3 agents, each fires 50 signals to the same change workflow, all signals applied without rejection.
- **SC2** — Existing 7-gate sequence and HITL checkpoint behavior is preserved. Verified via existing test suite (`gate.test.ts`, `change-state.test.ts`, command asset tests) green after refactor.
- **SC3** — All 24 slash commands continue to function with no behavioral regression. Verified via command asset tests + manual smoke of `/adv-proposal`, `/adv-discover`, `/adv-design`, `/adv-prep`, `/adv-apply`, `/adv-review`, `/adv-archive` end-to-end.
- **SC4** — External CI conformance verification continues to function via disk projection. Verified via `adv_conformance` integration tests.
- **SC5** — Worktree management surface preserved. Verified via `adv-worktree.test.ts` + manual create/delete/triage.
- **SC6** — All currently-active changes (7 today) migrate cleanly via one-shot migration script. Verified by running migration in dry-run, comparing source state to projected target state, then executing for real.
- **SC7** — Diagnostic/divergence tooling deleted: `adv_workflow_repair`, `adv_change_diagnose`, `adv_change_import` (post-migration), `adv_orphan_sweep`, `adv_archive_sweep_orphans`, `adv_migrate_cleanup`. Verified via tool-registry inventory.
- **SC8** — `temporal/` directory LOC reduction ≥ 30% (target: ~6,500 LOC removed from current 18,551). Verified via `wc -l` before/after comparison.
- **SC9** — Per-change signal traffic ≤ 300 events for a representative change lifetime (vs current 1000+ updates). Verified via instrumented spike change.
- **SC10** — Spike validates: concurrent signaling works, `continueAsNew` preserves queryable state at 5,000 events, disk projection cadence (gate transitions only) satisfies external CI, migration script reproduces state. Spike must pass before full migration begins.

## Scope

### In scope (files and modules affected)

**Plugin core:**
- `plugin/src/temporal/workflows.ts` — full rewrite, replace update handlers with signal handlers
- `plugin/src/temporal/contracts.ts` — replace update definitions with signal definitions
- `plugin/src/temporal/messages.ts` — signal/query contract definitions
- `plugin/src/temporal/change-state.ts` — pure state mutation functions, simplified
- `plugin/src/temporal/retry-wrapper.ts` — most logic deleted (no domain-error mapping for signals)
- `plugin/src/temporal/migration.ts` — deleted (replaced by one-shot migration script)
- `plugin/src/temporal/health-probe.ts` — simplified (no STSL singleton complexity)
- `plugin/src/temporal/worker-lock.ts` — simplified (no peer-coordination heartbeat)
- `plugin/src/temporal/gate-reentry.ts` — simplified (no auto-reset complexity, addresses #46)
- `plugin/src/temporal/orphan-sweep.ts` — deleted

**Tools layer:**
- `plugin/src/tools/change.ts` — refactor to signal-fire pattern
- `plugin/src/tools/task.ts` — refactor; collapse TDD ceremony tools
- `plugin/src/tools/gate.ts` — refactor to signal-fire pattern
- `plugin/src/tools/wisdom.ts` — refactor to signal-fire pattern
- `plugin/src/tools/checkpoint.ts` — refactor; signal carries result
- `plugin/src/tools/test.ts` — drop `phase: 'red' | 'green'` parameter
- `plugin/src/tools/change-diagnose.ts` — DELETED
- `plugin/src/tools/change-import.ts` — DELETED post-migration
- `plugin/src/tools/archive-purge.ts` — simplified
- `plugin/src/tools/archive-sweep.ts` — DELETED
- `plugin/src/tools/migrate-cleanup.ts` — DELETED post-migration
- `plugin/src/tools/mesh-scan.ts` — DELETED
- `plugin/src/tools/temporal-ops.ts` — simplify diagnose, keep reconnect/restart

**Tool registry:**
- `plugin/src/tool-registry.ts` — remove deleted tool registrations

**Storage:**
- `plugin/src/storage/` — disk projection becomes write-only (workflow → disk); read paths simplified

**Archive helpers:**
- `plugin/src/tools/archive-helpers/` — refactor to produce durable trinity (summary + specs + wisdom)

**Tests:**
- All `.test.ts` co-located with refactored files — updated to test new signal-driven contracts
- New tests for concurrent signaling, signal queue serialization, status bucket derivation

**Documentation:**
- `ADV_INSTRUCTIONS.md` — update protocol references
- `AGENTS.md` — update architecture notes (remove TDD ceremony, project keying)
- `docs/adv-gates.md` — update gate state machine
- `docs/specs/` — update relevant spec docs

### Out of scope

- Replacing Temporal entirely (Path B from earlier discussion). Signal-driven model retains Temporal because the signal mailbox + queue serialization is exactly the property needed.
- Changes to the 7-gate sequence as a concept
- Changes to slash command surface (24 commands preserved as user entry points)
- Changes to skill/sub-agent orchestration
- Changes to worktree-as-concept (worktree state moves to workflow but UX preserved)
- Health UI improvements for #33 (orthogonal; tracked separately)
- Issue #46 root-cause fix (addressed indirectly by smaller workflow surface; tracked separately)
- TUI / dashboard surfacing of new status buckets (deferred — backend supports it; UI is follow-on work)

## References

Architecture document: see `proposal` field for full design (16 sections covering core insight, design principles, workflow surface, state shape, storage tiers, archive contract, status buckets, tool layer, multi-session model, cross-project model, what gets deleted, migration plan, spike plan, risks).

Related closed issues: #5, #6, #11, #17, #18, #20, #22, #23, #24, #25, #26, #27, #28, #30, #31, #32, #34, #35, #37, #47

Related open issues: #33, #39, #46, #48 (all addressed structurally by this refactor)

Reference architecture: claude-tempo (https://github.com/vinceblank/claude-tempo) — same library, correct usage pattern, zero equivalent bug class
