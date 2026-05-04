# Decision: Refactor Change Workflows to Signal-Driven Architecture

> **Status:** design phase (ADV change `refactorChangeWorkflowsSignal`)
> **Date:** 2026-05-04
> **Author:** collaboratively designed across an extended conversation; recorded by adv-claude
> **Related ADV change:** `refactorChangeWorkflowsSignal`
> **Related issues:** closes #39, #48 structurally; related #33, #46
> **Reference architecture:** [claude-tempo](https://github.com/vinceblank/claude-tempo) — same library, correct usage

This document is the durable git-tracked record of the architectural decision and design. The active ADV change holds the same content in workflow state (`design.md`); this file is the long-term artifact that survives change archive.

---

## Part 1: The Decision Journey

This refactor was reached through an extended Q&A. The path matters because each turn sharpened the model further than the previous; the final design is much smaller than the first proposal.

### Inflection 1: Are the open Temporal bugs symptoms or root cause?

User asked: are these fixes bandaids or real fixes? Investigation showed:

- ~17 closed Temporal-related issues since the cutover, ~4 still open
- Bugs cluster in 4 layers: worker lock contention, `Workflow Update failed` opacity, health UI misreads, replay determinism
- Most are individually fixable but the pattern is structural

The honest answer: the fixes are real (they'll close the bleeding) but the root cause is "Temporal as a database" — the wrong fit for ADV's actual workload.

### Inflection 2: How does claude-tempo use Temporal differently?

User pointed at [claude-tempo](https://github.com/vinceblank/claude-tempo). Investigation revealed:

| | claude-tempo | ADV today |
|---|---|---|
| Workflow represents | A live agent session | A change (CRUD record) |
| Lifetime | Hours to days | Milliseconds per state mutation |
| Mutations | Signals (fire-and-forget) | Updates (synchronous, validated) |
| Concurrency | N independent workflows | Multiple agents on same workflow |
| Source of truth | Workflow event history | Disk + Temporal (dual-write) |

Same library, opposite usage. claude-tempo exhibits zero of ADV's bug class because it uses Temporal's actual sweet spot (long-lived signal-driven workflows).

### Inflection 3: What if changes were the workflows?

User proposed: workflow IS the change. Long-lived from proposal to archive. Signals carry mutations. Queries return state.

This eliminated:
- Disk-vs-Temporal divergence (no two sources)
- `adv_workflow_repair`, `adv_change_diagnose`, `adv_change_import`, `adv_orphan_sweep`, `adv_archive_sweep_orphans`, `adv_migrate_cleanup` (no divergence to manage)
- Update collision pattern (signals queue serially, never collide)
- Single-poller-per-project topology (single global namespace instead)

This was the core architectural pivot.

### Inflection 4: What about gate completion validation?

User asked: do we really need gate completion as updates with strict validation? The agent self-gates already. The workflow only RECORDS the gate state — the agent enforces sequence.

Conclusion: gate completion is also a signal. Validation moves from "synchronous workflow rejection" to "agent self-gates before firing". Trust the agent. Workflow records what agent claims.

### Inflection 5: What if task completion is also fire-and-forget?

User pushed further: ADV is not an audit/compliance system. It's a **resume system** for agents. The point of state is so a new agent can pick up where the previous one left off.

So:
- Task completion = single signal carrying verification claim
- TDD ceremony (red/green phase machine, separate evidence calls) = collapsed into `verification` field
- Gate enforcement at functional level (workflow records), not provable level (workflow validates)

### Inflection 6: Will signal volume be a problem?

Math: ~250 signals per change lifetime. Temporal handles 10,000+ events before warning. We're at 2.5% of capacity. Non-issue.

### Inflection 7: Where do learnings/wisdom come out?

User refined the archive contract: only the **durable trinity** survives:
1. Spec deltas (the laws — git-tracked)
2. Wisdom entries (cross-change learnings — git-tracked)
3. Brief change summary (<2KB, why+outcome — git-tracked)

Everything else dies on archive: full proposal text, full design text, task records, evidence. Working memory doesn't need to outlive the work. **Git is the implementation audit.**

### Inflection 8: Can we use ONE source of truth, with disk only as cache?

Yes. Workflow event history (in Temporal Server's DB) is THE source. Disk projection is a downstream cache for external readers (conformance CI, humans). Updated only on gate transitions and archive — not on every signal. ~10 disk writes per change lifetime instead of thousands.

### Inflection 9: Drop project keying?

User: changes shouldn't have to belong to one project. Single Temporal namespace; per-change workflows; agents in any project signal/query them; specs+conformance+wisdom stay project-local (git-tracked per repo).

This eliminated mesh scan and project-keyed task queues. Discovery via Temporal search attributes filtered by `AdvAffectedProjects`.

### Inflection 10: ADV's actual mission

User stated the tagline: **"ADV gives human orchestrators maximum power over their agentic workflows."** Single user, single machine. Specs/wisdom/summaries are git-tracked durable; everything else is working memory.

Every feature evaluated against: "does this empower the human orchestrator?" If not, drop.

### Inflection 11: Status buckets vs phase gates — overlap?

User noticed proposed "status buckets" (awaiting approval / in flight / stuck / drifting / ready to archive / never started) overlap with phase gates. Resolution: **unify**. Per-gate state machine (pending / in_progress / awaiting_approval / stuck / done) carries the rich state. Buckets are derived views on (current gate, gate state, idle threshold). One model, two surfaces.

### Inflection 12: Recency banding

User: what was that for? Real questions:
- "What's incomplete?"
- "What's not getting worked on?"

Time bands were a noisy proxy for state. State-driven buckets (above) answer the questions directly. Drop recency banding entirely.

---

## Part 2: Architectural Summary

### Core Pattern

| Layer | Today | Proposed |
|---|---|---|
| Source of truth | Disk + Temporal (dual-write) | Temporal workflow event history |
| Mutation | Updates (synchronous, validated) | Signals (fire-and-forget, queue-serialized) |
| Reads | Disk reads + workflow queries | Workflow queries; disk only for external CI |
| Validation | Workflow rejects bad updates | Agent self-validates; workflow records claims |
| Concurrent agents | Updates collide → opaque rejection | Signals queue → process serially → no collision |
| Archive output | Full bundle (~50KB per change) | Durable trinity (~1KB summary + specs + wisdom) |
| Project scope | Per-project state + per-project task queue | Global namespace; project-local artifacts only |

### What Survives Archive (Durable Trinity)

| Artifact | Storage | Lifetime |
|---|---|---|
| Spec deltas (the laws) | Git-tracked `.adv/specs/` | Forever |
| Wisdom entries (cross-change learnings) | Git-tracked `.adv/wisdom.jsonl` | Forever |
| Brief change summary (~1KB) | Git-tracked `.adv/archive/{change-id}.md` | Forever |

What dies on archive: full proposal, full design, task records, TDD evidence, review findings, error recovery logs, scratch research.

### What Gets Deleted

| Tool / module | Reason |
|---|---|
| `adv_workflow_repair` | No divergence to repair |
| `adv_change_diagnose` | Single source of truth |
| `adv_change_import` (post-migration) | One-shot tool only |
| `adv_orphan_sweep` | No orphans |
| `adv_archive_sweep_orphans` | No leakage class |
| `adv_migrate_cleanup` (post-migration) | One-shot tool only |
| `adv_archive_purge` | Workflow termination is the purge |
| `adv_mesh_scan` | Cross-project is native |
| `adv_task_run_status` | Task status is just a field |
| `adv_task_evidence` (separate) | Folded into `taskCompleted` |
| `adv_task_tdd` (separate) | TDD intent set at creation |
| TDD phase machine | Trust the agent |
| `seenIdempotencyKeys` infrastructure | Signals naturally idempotent |
| Most of `retry-wrapper.ts` | No domain-error mapping for signals |
| Most of `migration.ts` | No format migrations |
| `recencyBand` field | Replaced by status buckets |

**Estimated LOC delete: ~5,000-7,000** out of ~18,500 in `temporal/` plus tools touching these concerns.

---

## Part 3: Detailed Design

### Section 1: Signal Schema (24 Signals)

Each signal in `plugin/src/temporal/messages.ts` follows the existing pattern:

```typescript
export const fooSignal = wf.defineSignal<[FooPayload]>("foo");
```

#### Document & Metadata (5)

- `proposalUpdatedSignal({ text, updatedBy?, updatedAt })`
- `problemStatementUpdatedSignal({ text, updatedBy?, updatedAt })`
- `agreementUpdatedSignal({ text, updatedBy?, updatedAt })`
- `designUpdatedSignal({ text, updatedBy?, updatedAt })`
- `acceptanceCriteriaSetSignal({ criteria, setBy?, setAt })`

#### Task Lifecycle (7)

- `taskAddedSignal({ task, addedAt })`
- `taskUpdatedSignal({ taskId, partial, updatedAt })` — planning-time updates
- `taskRemovedSignal({ taskId, removedAt })`
- `taskAssignedSignal({ taskId, sessionId, assignedAt })`
- `taskCompletedSignal({ taskId, verification, summary, filesTouched, checkpointSha?, completedAt })`
- `taskBlockedSignal({ taskId, reason, attempts, blockedAt })`
- `taskCancelledSignal({ taskId, approvalEvidence, reason, cancelledAt })`

#### Gate State (5)

- `gateInProgressSignal({ gateId, triggeredBy?, triggeredAt })`
- `gateAwaitingApprovalSignal({ gateId, evidence, triggeredAt })`
- `gateStuckSignal({ gateId, reason, triggeredAt })`
- `gateCompletedSignal({ gateId, approvalEvidence?, completedBy, completedAt })`
- `gateReenteredSignal({ fromGateId, reason, scopeDelta?, reenteredBy, reenteredAt })`

#### Wisdom & Reflection (2)

- `wisdomAddedSignal({ entry, addedAt })`
- `reflectionRecordedSignal({ report, recordedAt })`

#### Worktree Registry (2)

- `worktreeCreatedSignal({ branch, path, baseRef, headSha, createdAt })`
- `worktreeDeletedSignal({ branch, reason, deletedAt })`

#### Conformance (3)

- `conformanceLockedSignal({ specs, lockedAt })`
- `conformanceVerdictSignal({ verdict, runId, failed?, recordedAt })`
- `conformanceOverriddenSignal({ user, reason, reVerifyDeadline, overriddenAt })`

#### Lifecycle (2)

- `archiveRequestedSignal({ approvalEvidence, requestedBy, requestedAt })` — terminal signal
- `changeCancelledSignal({ approvalEvidence, reason, supersededBy?, cancelledBy, cancelledAt })` — terminal signal

**Total: 24 new + 1 retained (`applyChangeSummarySignal`) = 25 signals.** Replaces 28 updates.

### Section 2: Bucket Derivation

Pure function in `plugin/src/utils/buckets.ts`. Computed from current gate state + idle threshold.

```typescript
type Bucket = "awaiting_approval" | "in_flight" | "stuck" | "drifting" | "ready_to_archive" | "never_started";

function deriveBucket(ctx: BucketContext): Bucket {
  // 1. pendingCheckpoint OR currentGate awaiting_approval → awaiting_approval
  // 2. All non-release gates done AND release awaiting → ready_to_archive
  // 3. currentGate stuck → stuck
  // 4. currentGate in_progress AND idle past threshold → drifting
  // 5. currentGate in_progress → in_flight
  // 6. Only proposal done, age > threshold → never_started
  // 7. Default → in_flight
}
```

Mutually exclusive. Configurable thresholds (default 24h idle).

### Section 3: Disk Projection Contract

| Trigger | Frequency |
|---|---|
| `gateCompleted` signal | ~7 per change |
| `gateAwaitingApproval` signal | Sporadic |
| `gateStuck` signal | Rare |
| `archiveRequested` final write | Once at end |
| `changeCancelled` final write | Once at end |
| On-demand `adv_change_export` | Manual |
| **NOT** triggered by task signals, doc updates, wisdom, worktree | — |

Net write rate: ~10 writes per change lifetime (99% reduction).

```typescript
wf.setHandler(gateCompletedSignal, async (payload) => {
  applyGateCompletedToState(state, payload);
  state.lastSignalAt = payload.completedAt;
  void writeChangeProjectionActivity({ /* ... */ });
});
```

Activity is idempotent, retryable, best-effort, atomic (tmp+rename).

External readers MUST: treat as eventually consistent, tolerate file absence, validate `schemaVersion === 2`.

### Section 4: Archive Contract

Trigger: agent fires `archiveRequestedSignal` with user approval. Workflow handler schedules `archiveChangeActivity`. Activity:

1. Generate brief summary
2. Per affected project: write summary, apply spec deltas, append wisdom, git commit
3. Final disk projection write
4. Delete active projection
5. Workflow completes (terminates)

#### Brief Summary Schema (locked)

```markdown
# {change-id}: {title}

**Status:** archived | cancelled
**Branch:** change/{change-id} (merged at {sha})
**Timeline:** {created-iso} → {archived-iso}

## Outcome
{1-2 sentence: what was achieved}

## Why
{1-2 sentence: motivation}

## Surface
{bullet list}

## Acceptance Criteria
{ ✓ SC1: criterion }

## Spec Deltas
- {rq-id}: {brief description}

## Wisdom Promoted
- {wisdom-id}: {title}

## Approval
{approver}, {approvalEvidence excerpt}, {iso timestamp}
```

Target: <2KB. Permanent. Greppable.

### Section 5: continueAsNew Strategy

| Default | Behavior |
|---|---|
| Most changes | Never CAN — workflow terminates at archive (~250 events typical) |
| Defensive | If `historyLength > 5,000`, schedule CAN at next safe point |
| Safe point | After signal handler completes AND `allHandlersFinished()` |

State size bound: ~64KB worst case. Cheap.

### Section 6: Tool Adapter Pattern

Adapter helpers in `plugin/src/tools/_adapters.ts`:

- `fireSignal(changeId, signal, payload)` — fire-and-forget
- `querySignal(changeId, query, ...args)` — synchronous read
- `fireSignalAndQuery(...)` — eventual fresh state
- `startChangeWorkflow(input)` — only for `adv_change_create`

Tool patterns:

| Pattern | Tool count |
|---|---|
| `fireSignal` | ~15 |
| `querySignal` | ~12 |
| `fireSignalAndQuery` | ~3 |
| Activity-direct | ~6 |
| Workflow-start | 1 |
| Local-only | ~6 |
| **DELETED** | ~10 |

### Section 7: Cross-Project Discovery

Single Temporal namespace. Search attributes for cross-workflow discovery:

```typescript
const ADV_SEARCH_ATTRIBUTES = {
  AdvChangeId: "Keyword",
  AdvChangeStatus: "Keyword",
  AdvChangeTitle: "Text",
  AdvAffectedProjects: "KeywordList",   // project IDs
  AdvAffectedPaths: "KeywordList",
  AdvCurrentGate: "Keyword",
  AdvCurrentBucket: "Keyword",
  AdvLastSignalAt: "Datetime",
  AdvCreatedAt: "Datetime",
};
```

Discovery query examples:

```typescript
// "Changes affecting this project"
client.workflow.list({ query: `AdvAffectedProjects = '${projectId}' AND AdvChangeStatus = 'active'` });

// "Stuck cross-project"
client.workflow.list({ query: `AdvChangeStatus = 'active' AND AdvCurrentBucket = 'stuck'` });

// "Awaiting my approval"
client.workflow.list({ query: `AdvChangeStatus = 'active' AND AdvCurrentBucket = 'awaiting_approval'` });
```

Task queue: `advance-changes` (single global) + `advance-host-{hostname}` (per-host activities).

### Section 8: Migration Script

One-shot script reads v1 disk JSON, replays as signals, verifies round-trip.

Operator workflow:

```bash
# 1. Dry-run
pnpm tsx plugin/scripts/migrate-to-signal-architecture.ts --dry-run

# 2. Inspect, fix issues

# 3. Execute
pnpm tsx plugin/scripts/migrate-to-signal-architecture.ts --execute

# 4. Verify
adv_change_list status: in-flight

# 5. Smoke test
adv_change_show changeId: <id>

# 6. Delete migration tooling
rm plugin/scripts/migrate-to-signal-architecture.ts
rm plugin/src/tools/change-import.ts
rm plugin/src/tools/migrate-cleanup.ts
```

Acceptable migration loss: per-phase TDD evidence text (folded into `verification` placeholder), per-attempt error_recovery on completed/cancelled tasks (only relevant when blocked), workflow event history (not in our model anyway), `seenIdempotencyKeys` (not needed).

---

## Part 4: Acceptance Criteria (from agreement)

The change ships when ALL true:

| # | Criterion | Verification |
|---|---|---|
| SC1 | Concurrent agents signaling same workflow produce no `Workflow Update failed` | Test: 3 agents × 50 signals each, all applied |
| SC2 | Existing 7-gate sequence and HITL behavior preserved | Existing test suite green |
| SC3 | All 24 slash commands function with no behavioral regression | Command asset tests + manual smoke |
| SC4 | External CI conformance verification continues via disk projection | adv_conformance integration tests |
| SC5 | Worktree management surface preserved | adv-worktree.test.ts + manual |
| SC6 | All 7 currently-active changes migrate cleanly | Dry-run comparison + execution |
| SC7 | Diagnostic/divergence tooling deleted | tool-registry inventory |
| SC8 | `temporal/` LOC reduction ≥30% (~6,500 LOC removed from 18,551) | wc -l before/after |
| SC9 | Per-change signal traffic ≤300 events for representative change | Instrumented spike change |
| SC10 | Spike validates: concurrent signaling, CAN at 5k events, projection cadence, migration | Spike report |

---

## Part 5: Mission Alignment

**ADV gives human orchestrators maximum power over their agentic workflows.**

Single user, single machine. Specs, wisdom, and brief change summaries are the durable artifacts; everything else is working memory.

Every design decision in this document was evaluated against: "does this give the human orchestrator more power?" Audit/compliance features that don't help the human were dropped. Cross-machine sync was dropped. Self-governing agent features were not added. Signal-driven design lets the human SEE more of what agents are doing.

---

## Part 6: References

- ADV change record: `refactorChangeWorkflowsSignal` (workflow state holds `proposal.md`, `agreement.md`, `design.md`)
- Reference architecture: [claude-tempo](https://github.com/vinceblank/claude-tempo) — same library, correct usage
- Closed Temporal-related issues since cutover: #5, #6, #11, #17, #18, #20, #22, #23, #24, #25, #26, #27, #28, #30, #31, #32, #34, #35, #37, #47
- Open issues addressed structurally: #39, #48
- Open issues addressed indirectly: #46 (smaller workflow surface)
- Open issues out of scope: #33 (orthogonal — health UI formatting), #40 (orthogonal — bash guard cached-dist friction; another agent working on it)
- Mission tagline source: this conversation, 2026-05-04
