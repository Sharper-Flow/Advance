# Validator Report: refactorChangeWorkflowsSignal

> **Verdict:** CAUTION
> **Date:** 2026-05-04
> **Validator:** adv-researcher (independent design validation)
> **Design document:** `docs/decisions/2026-05-04-signal-driven-change-workflows.md`
> **Reference architecture:** [claude-tempo](https://github.com/vinceblank/claude-tempo)

The design is architecturally sound at the macro level. Signal-driven pattern is well-supported by Temporal for long-lived state-holder workflows; claude-tempo reference confirms correct paradigm. Three areas need refinement before locking — none architectural blockers, all documentation/completeness.

---

## V1: Signal/Query/Update Split — Temporal Best Practices

**Finding:** VALIDATED

**Evidence:**
- Temporal docs explicitly recommend signals for "asynchronous communication when clients want to move on quickly… 'fire and forget' approach, no result or exception needed." Updates are for "synchronous mutations… providing a return value upon successful execution." (Temporal: workflow-message-passing.mdx)
- claude-tempo's `session.ts` uses identical split: ~15 signals for mutations, ~5-7 updates only for atomic state transitions needing immediate response (claim/forceDetach/destroy), ~12 queries for reads.
- Removal of validation in workflow handlers: claude-tempo similarly uses tool-layer/adapter validation; workflow handlers trust payloads.
- Natural signal idempotency via client-supplied IDs is a documented pattern in Temporal samples.

**Concerns:** None.

**Recommendation:** Lock as designed.

---

## V2: continueAsNew Strategy

**Finding:** VALIDATED — add complementary trigger

**Evidence:**
- Temporal warns at 10,240 events, hard-limits at 51,200. Design's 5,000 threshold = 10% of hard limit, very conservative. (Temporal docs: self-hosted defaults)
- claude-tempo uses `continueAsNewSuggested` + explicit threshold. Design omits `continueAsNewSuggested`. (claude-tempo session.ts:1789)
- `allHandlersFinished()` guard is correct; official samples confirm this pattern. In-flight signals buffered and delivered to new run. (Temporal samples: safe-message-handlers)

**Concerns:**
- Add `workflowInfo().continueAsNewSuggested` as second CAN trigger alongside 5,000 threshold.

**Recommendation:** Lock as designed; add `continueAsNewSuggested` as complementary trigger in Section 5.

---

## V3: Search Attribute Design

**Finding:** CAUTION — two items

**Evidence:**
- `KeywordList` equality = "contains" semantics — correct for `AdvAffectedProjects` membership queries. (Temporal docs: list-filter.mdx)
- `ORDER BY` not supported on Temporal Cloud; `Text` type cannot be used in `ORDER BY`. Default sort is `ClosedTime DESC NULL FIRST`. (Temporal docs: list-filter.mdx)
- `addSearchAttributes` is idempotent (same type = no-op). `ensureAdvSearchAttributes()` startup pattern is correct. (Temporal docs: CLI operator)

**Concerns:**
- Document: no `ORDER BY` reliance — sort client-side after listing
- `AdvChangeTitle` as `Text` uses tokenized matching, but query examples use `=`. If exact match needed → switch to `Keyword`. Clarify intent.

**Recommendation:** Lock 9 attributes; document ORDER BY limitation; clarify AdvChangeTitle intent.

---

## V4: Migration Script Reproducibility

**Finding:** CAUTION — setTimeout barrier unreliable

**Evidence:**
- 500ms `setTimeout` is a timing assumption, not a correctness guarantee. Delivery latency varies with load. (Temporal docs: handling-messages.mdx)
- Signals across different names are NOT ordered — `gateCompletedSignal` may arrive before `taskAddedSignal`s. Must batch by gate. (Temporal ordering guarantee: per-name only)
- Acceptable losses verified against current `change-state.ts`: TDD evidence text, per-attempt error_recovery, seenIdempotencyKeys. All consistent with mission.

**Concerns:**
- Replace `setTimeout` with query barrier: fire marker signal, poll query until marker appears, then validate round-trip
- Document cross-name ordering: migration script must batch signals per-gate with barriers between batches

**Recommendation:** Replace setTimeout with marker-signal query barrier; batch by gate for ordering.

---

## V5: ADV Protocol Conflicts

**Finding:** CAUTION — two documentation gaps

**Evidence:**
- Systematic read of ADV_INSTRUCTIONS.md: HITL gates, 7-gate checklist, worktree, cross-repo, cross-project, doom-loop, multi-session, large-scope — all preserved. No architectural conflicts.
- Cancellation: `taskCancelledSignal` carries `approvalEvidence` but workflow doesn't validate it. Current update handler enforces `approvedByUser: true`. Enforcement must move to tool layer. (ADV_INSTRUCTIONS.md § Cancellation Policy)
- TDD phase machine: design drops it (Inflection 5), replaces with `verification` field. Protocol describes red/green as first-class workflow state. Must document enforcement moves to agent layer. (ADV_INSTRUCTIONS.md § TDD Protocol)

**Concerns:**
- Document cancellation validation moves to tool adapter: `approvedByUser + approvalEvidence` check before `fireSignal`
- Document TDD enforcement moves to agent layer: agent self-enforces red→green→complete; workflow records outcome only

**Recommendation:** Add two explicit notes to Sections 1 and 4; no architectural change needed.

---

## Overall Verdict Rationale

The design is architecturally correct and aligned with both Temporal best practices and the claude-tempo reference architecture. The signal/query/update split, the durable trinity archive contract, the per-gate state machine with derived buckets, and the cross-project search-attribute discovery model are all sound choices.

Three documentation/completeness adjustments are needed before locking, none requiring architectural redesign:

1. **Section 8 (Migration script):** Replace `setTimeout` with deterministic query barrier pattern; document cross-name signal ordering requirement (gate-batched replay).
2. **Section 7 (Search attributes):** Add note that sorting is client-side only on Temporal Cloud; clarify whether `AdvChangeTitle` is `Text` (partial/tokenized match) or `Keyword` (exact match).
3. **Sections 1 and 4 (Cancellation + TDD):** Add explicit notes that cancellation approval validation and TDD phase enforcement move from workflow to tool/agent layer, preserving the same protocol semantics at a different enforcement point.
4. **Section 5 (CAN):** Add `continueAsNewSuggested` as complementary trigger alongside the 5,000-event threshold.

Once these refinements are made, the design is ready for the planning phase.

## Per-Verdict Action

- **VALIDATED**: design gate may complete; proceed to prep
- **CAUTION** (this verdict): design may complete after documenting the 4 refinements above; user should be aware before prep starts
- **CONFLICT**: design gate must NOT complete; agent must surface conflicts to user
- **INCONCLUSIVE**: more research needed; specify what

Per HITL boundary model, CAUTION does not force a user checkpoint — but given user's collaborative engagement throughout this design, surfacing findings before completing the gate is appropriate.

---

## References

1. Temporal docs: Signal vs Update guidance — https://github.com/temporalio/documentation/blob/main/docs/encyclopedia/workflow-message-passing/workflow-message-passing.mdx
2. Temporal docs: Signal handlers (TypeScript) — https://github.com/temporalio/documentation/blob/main/docs/develop/typescript/workflows/message-passing.mdx
3. Temporal docs: Update handlers with validators — https://github.com/temporalio/documentation/blob/main/docs/develop/python/workflows/message-passing.mdx
4. Temporal docs: Continue-As-New (TypeScript) — https://github.com/temporalio/documentation/blob/main/docs/develop/typescript/workflows/continue-as-new.mdx
5. Temporal docs: Self-hosted defaults — history limits — https://github.com/temporalio/documentation/blob/main/docs/production-deployment/self-hosted-guide/defaults.mdx
6. Temporal docs: Handling messages — allHandlersFinished — https://github.com/temporalio/documentation/blob/main/docs/encyclopedia/workflow-message-passing/handling-messages.mdx
7. Temporal docs: List Filter operators — https://github.com/temporalio/documentation/blob/main/docs/encyclopedia/visibility/list-filter.mdx
8. Temporal docs: Search Attributes — upsert — https://github.com/temporalio/documentation/blob/main/docs/develop/typescript/platform/observability.mdx
9. Temporal docs: CLI operator — search-attribute create — https://github.com/temporalio/documentation/blob/main/docs/cli/operator.mdx
10. temporalio/samples-typescript: safe-message-handlers — CAN pattern — https://github.com/temporalio/samples-typescript/blob/main/message-passing/safe-message-handlers/src/workflows.ts
11. claude-tempo: session.ts — signal/update/query split — https://github.com/vinceblank/claude-tempo/blob/main/src/workflows/session.ts
12. claude-tempo: ARCHITECTURE.md — three-layer model — https://github.com/vinceblank/claude-tempo/blob/main/docs/ARCHITECTURE.md
13. claude-tempo: concepts.md — wire protocol — https://github.com/vinceblank/claude-tempo/blob/main/docs/concepts.md
14. ADV design document: `docs/decisions/2026-05-04-signal-driven-change-workflows.md` (this change)
15. ADV protocol: `ADV_INSTRUCTIONS.md` (repo root)
16. ADV architecture: `AGENTS.md` (repo root)
