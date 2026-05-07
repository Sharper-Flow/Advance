# Decision: Refactor Change Workflows to Signal-Driven Architecture

> **Status:** IMPLEMENTED via `cullDeadCodeFixArchive` (2026-05-06–2026-05-07). The `projectWorkflow` / `ProjectWorkflowState` live authority was retired entirely; all consumers were rewired to per-change workflow + external state.
> **Date:** 2026-05-04 (initial draft); 2026-05-05 (resolution amendments); 2026-05-07 (implementation complete)
> **Author:** collaboratively designed across an extended conversation; recorded by adv-claude
> **Related ADV change:** `refactorChangeWorkflowsSignal` → superseded by `cullDeadCodeFixArchive`
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

#### Enforcement Layer Migration (V5 + V6 validator findings)

The current update-based architecture enforces several protocol rules inside the workflow handler (e.g., `cancelTaskUpdate` requires `approvedByUser: true`; `setTaskPhaseUpdate` enforces red→green→complete transitions). Under the signal-driven model, these enforcement points **move out of the workflow** to where they semantically belong:

| Rule | Today (workflow update) | Proposed (where enforced) |
|---|---|---|
| Cancellation requires user approval | `cancelTaskUpdate` rejects without `approvedByUser: true` | **Tool layer** — `adv_task_cancel` and `adv_change_close` validate `approvedByUser + approvalEvidence` before firing the signal. Bad calls rejected at the boundary. |
| TDD phase progression (red → green → complete) | `setTaskPhaseUpdate` enforces transitions | **Agent layer** — agent self-enforces. Workflow records final outcome via `taskCompletedSignal.verification`. No phase machine. |
| Planning gate requires `userApproved: true` | `completeGateUpdate` rejects without it | **Tool layer** — `adv_gate_complete` validates `userApproved` before firing `gateCompletedSignal` for the planning gate. |
| Spec-conformance lock prevents reads | (today: filesystem path guard) | **Unchanged** — path guards stay at the OS/tool layer, not workflow. |
| Sequential gate enforcement (`rq-gatemodel01.1`) | `completeGateUpdate` rejects if prior gate incomplete | **Tool layer** — `adv_gate_complete` queries current gate state via `getGateStatusQuery` before firing `gateCompletedSignal`; rejects if any prior gate is not `done`. The workflow handler stays a pure mutation. |
| Execution-gate task completeness (`rq-gatemodel01.4`) | `completeGateUpdate` rejects when execution gate has incomplete tasks | **Tool layer** — `adv_gate_complete` queries `getTasksQuery` before firing for `gateId: 'execution'`; rejects when any task is `pending` or `in_progress`. |
| Re-entry cascade reset (`rq-scopeReentry02`) | `reenterUpdate` resets target + downstream gates atomically | **Workflow handler** — `gateReenteredSignal` handler computes the downstream gate set from `fromGateId` and resets each to `pending` in one mutation. Tool-layer adapter only validates `approvalEvidence + reason`. The cascade is structural and stays in the workflow because it operates on workflow state, not tool inputs. |

**Protocol semantics are preserved**; only the enforcement point shifts. This is consistent with the design's "trust the agent at the workflow layer; validate at the boundary" principle. Bad payloads are rejected before they ever become signals; the workflow's signal handlers can therefore stay pure mutations on `state`.

This migration of enforcement is documented in tool layer specs and surfaced in `_adapters.ts` helper functions.

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

#### Read Path Routing (V6 validator finding — A3)

The disk projection is a downstream cache for **external readers only** (CI workers running outside the OpenCode session, human inspection, archival tooling). Internal ADV reads MUST go through workflow queries to preserve strong consistency.

| Reader | Path | Consistency |
|---|---|---|
| `adv_change_show`, `adv_task_list`, `adv_task_ready`, `adv_gate_status` (all internal tool reads) | Workflow query | Strongly consistent |
| `adv_conformance action: 'run'` (verdict computation) | Workflow query | Strongly consistent — verdict cannot race a pending signal |
| `adv_conformance action: 'status'`, `adv_change_export` | Workflow query (preferred) or projection (fallback when workflow unreachable) | Strongly consistent when workflow reachable |
| External CI worker reading `.adv/changes/{id}/projection.json` | Disk projection | Eventually consistent — must validate `schemaVersion === 2` and tolerate file absence |
| Human reading the on-disk bundle | Disk projection | Eventually consistent |

**SC4 amendment:** "External CI conformance verification continues to function. Internal `adv_conformance action: 'run'` reads workflow state via query (strongly consistent). External CI workers read disk projection (eventually consistent, gate-transition cadence)."

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
| Defensive trigger A | If `historyLength > 5,000`, schedule CAN at next safe point |
| Defensive trigger B | If `workflowInfo().continueAsNewSuggested === true`, schedule CAN (Temporal-suggested, claude-tempo pattern) |
| Safe point | After signal handler completes AND `allHandlersFinished()` |

```typescript
const CAN_THRESHOLD = 5000;

async function maybeCAN(state: ChangeState): Promise<void> {
  const info = wf.workflowInfo();
  // V2 validator: complementary triggers — Temporal-suggested OR explicit threshold
  const shouldCAN = info.continueAsNewSuggested || info.historyLength > CAN_THRESHOLD;
  if (!shouldCAN) return;
  await wf.condition(() => wf.allHandlersFinished());
  await wf.continueAsNew<typeof changeWorkflow>({ state });
}
```

State size bound: ~64KB worst case. Cheap.

In-flight signals during CAN: per Temporal samples (`safe-message-handlers`), buffered signals are delivered to the new run. `allHandlersFinished()` ensures we don't CAN mid-handler.

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

Discover-phase collision check uses the search attributes above to find in-flight
changes, then queries only a bounded high-level document projection for each
candidate. Agents may pull proposal/problem/agreement/design/acceptance-criteria
summaries for active changes to judge overlap, but must not pull full workflow
event history, task-run history, TDD evidence, per-attempt recovery logs, or
archived scratch context. This preserves the orchestrator's ability to avoid
collisions without reintroducing Temporal-as-database history scraping.

Task queue: `advance-changes` (single global) + `advance-host-{hostname}` (per-host activities).

#### Cross-Change Worktree Lookup (V6 validator finding — A2)

Worktree state lives in per-change workflow state (via `worktreeCreatedSignal` / `worktreeDeletedSignal`). Cross-change queries — "is branch X already in use by another change?", "list all worktrees for this project" — are answered via Temporal search attributes, not via a separate aggregation workflow.

Add two search attributes:

| Attribute | Type | Use |
|---|---|---|
| `AdvWorktreeBranches` | `KeywordList` | Active worktree branches owned by the change. Updated atomically when `worktreeCreatedSignal` / `worktreeDeletedSignal` is processed. |
| `AdvWorktreePaths` | `KeywordList` | Active worktree absolute paths. Same update lifecycle. |

Lookup pattern:

```typescript
// Is branch already in use?
const inUse = await client.workflow.list({
  query: `AdvAffectedProjects = '${projectId}' AND AdvWorktreeBranches = '${branch}' AND AdvChangeStatus = 'active'`,
});
if (inUse.length > 0) throw new BranchInUseError(branch, inUse[0].workflowId);
```

Worktree registry semantics from `worktree-lifecycle` spec (rq-wl-branchRegistry01) are preserved: branch-aware entries, setup readiness, git-first reconciliation. The location moves from a single project workflow's `worktree_registry` field to per-change workflow state, with cross-change visibility via search attributes. The `adv_worktree_triage` and `adv_worktree_resume` tools refactor to query search attributes for cross-change visibility.

#### Type & Sort Notes (V3 validator findings)

- **`AdvChangeTitle` type:** Use `Keyword` (exact match), NOT `Text` (tokenized). Query examples use `=` (exact equality). If full-text title search is later needed, add a separate `Text`-typed attribute. This avoids ambiguous matching semantics.
- **Sort order:** Temporal Cloud does NOT support `ORDER BY` on user-defined search attributes; default sort is `ClosedTime DESC NULL FIRST`. ADV is self-hosted today, but for portability, **sort client-side after listing**. Do not write `ORDER BY AdvCreatedAt DESC` in any list-query string. Fetch the result set, then sort in the tool layer.

Updated schema (final):

```typescript
const ADV_SEARCH_ATTRIBUTES = {
  AdvChangeId: "Keyword",                  // exact change ID
  AdvChangeStatus: "Keyword",              // active | archived | cancelled
  AdvChangeTitle: "Keyword",               // exact title match (V3 fix: was Text)
  AdvAffectedProjects: "KeywordList",      // contains-semantics for membership
  AdvAffectedPaths: "KeywordList",
  AdvCurrentGate: "Keyword",
  AdvCurrentBucket: "Keyword",
  AdvLastSignalAt: "Datetime",             // filter only; sort client-side
  AdvCreatedAt: "Datetime",                // filter only; sort client-side
};
```

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

#### Reliable Replay Barrier (V4 validator finding)

The earlier draft used `setTimeout(500)` as a "wait for mailbox to drain" barrier before round-trip validation. This is unreliable — delivery latency varies with load and gives no correctness guarantee.

**Replace with marker-signal query barrier:**

```typescript
// At the end of replay, fire a marker signal
const markerId = `migration-${changeId}-${Date.now()}`;
await handle.signal(migrationMarkerSignal, { markerId });

// Poll a query that returns whether the marker has been processed
async function waitForMarker(markerId: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const seen = await handle.query(getProcessedMarkersQuery);
    if (seen.includes(markerId)) return;
    await sleep(50);
  }
  throw new Error(`Migration marker ${markerId} not seen within ${timeoutMs}ms`);
}

await waitForMarker(markerId);

// Now validate round-trip
const newState = await handle.query(getChangeStateQuery);
return validateRoundTrip(source, newState, changeId);
```

This requires:
- Adding `migrationMarkerSignal` definition (only used by migration; can be deleted after migration completes)
- Adding `getProcessedMarkersQuery` query that returns the list of marker IDs the workflow has seen
- Both removed in post-migration cleanup

#### Cross-Name Signal Ordering (V4 validator finding)

Temporal guarantees ordered delivery for signals **of the same name**, but NOT across different signal names. Concrete risk during replay:

- Replay fires `taskAddedSignal(tk-001)`, `taskAddedSignal(tk-002)`, `gateCompletedSignal(planning)`
- `gateCompletedSignal` may arrive at the workflow handler BEFORE `taskAddedSignal` for tk-002 is processed
- If the gate-completion handler does anything that depends on full task list (e.g., updating search attributes from task counts), it sees a stale state

**Mitigation: gate-batched replay**

```typescript
// Replay tasks first, wait for marker, THEN gates
for (const task of source.tasks) {
  await replayTask(handle, task);
}
await waitForMarker(handle, "tasks-batch-complete");

for (const gateId of GATE_ORDER) {
  await replayGate(handle, source.gates[gateId]);
  await waitForMarker(handle, `gate-${gateId}-complete`);
}
```

Each batch of cross-name signals is followed by a marker barrier. This makes the migration deterministic regardless of internal Temporal scheduling.

---

### Section 9: Removal & Test Strategy (Apply Efficiency)

This refactor deletes ~5,000-7,000 LOC of source plus their associated test files. Trying to make existing tests pass against the new surface would waste enormous time and produce a broken-test thrash loop. Strategy: **rip out, rewrite. Don't salvage.**

#### Categorical Removal Approach

| Category | Code action | Test action |
|---|---|---|
| **Deleted entirely** (e.g., `change-diagnose.ts`, `mesh-scan.ts`, `archive-sweep.ts`, `change-import.ts`, `migrate-cleanup.ts`, `orphan-sweep.ts`, `gate-reentry.ts`) | `git rm` source file | `git rm` corresponding `.test.ts` |
| **Restructured** (`workflows.ts`, `change-state.ts`, `messages.ts`) | Rewrite from scratch using new patterns | Delete old `.test.ts`; write new from scratch |
| **Simplified** (`retry-wrapper.ts`, `health-probe.ts`, `worker-lock.ts`, `migration.ts`) | Remove most logic; keep simple core | Delete old `.test.ts`; write minimal new `.test.ts` |
| **Refactored tools** (`change.ts`, `task.ts`, `gate.ts`, `wisdom.ts`, etc.) | Rewrite tool body to use signal-fire / query pattern | Delete old `.test.ts` if substantial mocking; write new `.test.ts` against signal/query contracts |
| **Unchanged** (spec validator, project context, command asset tests, basic util tests) | No code change | Preserve existing tests |

#### Order of Operations During Apply

1. **Bulk deletions first.** `git rm` all confirmed-delete files in one commit (or per-category commits). Stops compilation of dead code paths immediately. Build will be broken — accept it.
2. **Build new workflow surface.** Write new `messages.ts` signal definitions, new `workflows.ts` signal handlers, new tool adapter helpers. TypeScript should typecheck.
3. **Build new tests against new surface.** TDD-style for each new construct: write failing test for signal handler / query / activity, write impl, repeat.
4. **Refactor tools to use new adapters.** Per tool: delete old test, refactor tool body, write new test.
5. **Update integration / asset tests.** Command asset tests, end-to-end smoke tests.
6. **Final cleanup.** Remove unused imports, dead types, orphaned helpers.

#### Heuristic: Salvage or Rewrite?

| Test asserts on… | Action |
|---|---|
| Internal data structures we're deleting (e.g., task-run ledger phases, idempotency keys) | **Delete** — those data structures don't exist anymore |
| Workflow update behavior with mocked `defineUpdate` | **Delete and rewrite** as signal-handler test |
| `Workflow Update failed` error path | **Delete** — no longer exists |
| Disk-Temporal divergence detection / repair | **Delete** — no divergence to detect |
| TDD phase machine state transitions | **Delete** — phase machine deleted |
| Tool's user-facing contract (e.g., `adv_change_show` returns task list) | **Likely salvageable** — update internal mocks to use signal/query, contract preserved |
| Spec/manifest/command-asset/help-text tests | **Preserve unchanged** |
| Pure utility functions (e.g., `formatDuration`, `parseGateId`) | **Preserve unchanged** |
| Cross-project resolution / search attribute building | **Rewrite** — search attribute schema changes (Q6) |

#### Build-Friendly Milestone Approach

Don't try to keep the build green throughout. Accept temporary breakage. Recover at milestones:

| Milestone | Definition | Verifies |
|---|---|---|
| **M1** | Bulk deletions complete; build broken (expected) | Dead code gone |
| **M2** | New workflow surface defined; `pnpm typecheck` passes | Type contracts coherent |
| **M3** | New signal/query/activity tests pass | Workflow contracts work |
| **M4** | All tools refactored to new adapters; `pnpm build` passes | Tool layer connects |
| **M5** | Integration tests pass (`pnpm test -- --run integration`) | End-to-end works |
| **M6** | Full test suite green; LOC delta ≥30% verified | SC8 met |

Each milestone is a checkpoint commit (per ADV protocol). Test failures between milestones are not investigated individually — they're either obviated by ongoing deletions or addressed in bulk at the milestone.

#### Anti-Patterns To Avoid During Apply

| × Anti-pattern | ✓ Right approach |
|---|---|
| Fix individual failing tests as they surface | Bulk-delete tests for removed surface; bulk-rewrite for restructured surface |
| Try to keep all tests passing at every commit | Accept M1-M5 broken-build window; restore at M6 |
| Salvage tests by adding mocks for deleted structures | Delete the test outright |
| "Maybe we should keep `adv_workflow_repair` just in case" | No. Delete. Single source of truth means no divergence to repair. |
| Add backwards-compat shims for old tool names | No. Hard cutover per migration plan. |
| Comment out tests instead of deleting | Delete. Git history holds it if ever needed. |
| Try to reuse old test setup helpers across paradigms | New test files; new helpers. Old helpers may carry assumptions baked into the dead model. |

#### Test File Operations

| Operation | Pattern |
|---|---|
| Delete a test file | `git rm plugin/src/temporal/migration.test.ts` |
| Delete a test inside a kept file | Delete the `describe`/`it` block; commit with message noting what was removed |
| Rewrite a test file | `git rm` old file, `git add` new file in same commit; message: "rewrite: <file> for signal-driven model" |
| Add a new test file | `git add plugin/src/temporal/messages.signals.test.ts` |

#### Estimated Test Suite Reset

| Category | Files affected | Est. LOC removed |
|---|---|---|
| Tests for deleted source files (one-to-one) | ~10-12 test files | ~2,000-3,000 |
| Tests for restructured source (delete + rewrite) | ~5-8 test files | ~1,500-2,500 net |
| Tests for refactored tools (delete + rewrite) | ~10-15 test files | ~2,000-3,000 net |
| Tests preserved unchanged | ~80-100 test files | 0 |

Net test suite: probably ~150-200 LOC fewer overall (lots removed, some new), but the new tests are tighter (signal handlers are pure functions; queries are pure derivations).

#### Spike Validates the Strategy

The spike (per agreement R3, SC10) validates this approach by:
1. Picking one change workflow as the spike target
2. Doing the bulk-delete → rewrite → test-from-scratch cycle on it
3. Measuring: time to milestone M3, LOC delta, test count
4. Confirming the strategy scales before the full migration

If spike shows "rewrite from scratch" takes >2× the salvage approach, revisit. Otherwise the strategy is locked.

---

### Section 10: Spec Deltas (V6 validator finding — CONFLICT resolution)

The V6 validator pass surfaced 3 spec-law CONFLICTs (`rq-taskRunLedger01`, `rq-TDD007req`, `rq-TDD008path` / `rq-TDD009idem` / `rq-TDD010phase` / `rq-ADVEXEC04.2`) where the design deletes tool surfaces that current specs mandate. The user chose **path B (retire tool surfaces, amend specs)** to align with ADV's refined value vision: single user, single machine, trust the agent, durable trinity. The retired surfaces (`adv_task_run_status`, `adv_task_tdd`, `adv_task_evidence`) no longer fit that vision.

This section catalogs every spec delta. Deltas are applied at archive time (Phase 9 of `/adv-archive`) via direct edits to `.adv/specs/*.yaml` files; the archive activity records the delta set against the change record for audit.

#### Mission Justification

ADV's mission, as locked in the agreement: "ADV gives human orchestrators maximum power over their agentic workflows. Single user, single machine. Specs, wisdom, and brief change summaries are the durable artifacts; everything else is working memory."

The retired tool surfaces all served audit/compliance use cases that don't help the human orchestrator on a single machine:

- `adv_task_run_status` — durable resume ledger. The agent already maintains in-context state for resume; a Temporal ledger duplicates that with no orchestration value.
- `adv_task_tdd` (reclassification) — post-planning intent change with audit trail. The audit trail is for compliance, not orchestration. Set intent at task creation.
- `adv_task_evidence` (fallback) — externally-captured evidence path with idempotency and correction. The verification field on `taskCompletedSignal` carries whatever the agent claims; external evidence is folded into that text. No fallback ceremony.

#### Retired Requirements

Specs to retire entirely (`delete` operation):

| Spec | Requirement | Reason |
|---|---|---|
| `advance-delivery` v1.2 | `rq-taskRunLedger01` (all 6 scenarios) | Durable task-run ledger retired. Task state is a query; resume hints are agent-context, not Temporal-backed. |
| `tdd-contract` v1.5 | `rq-TDD007req` (all 6 scenarios) | TDD intent immutability via `adv_task_reclassify_tdd` retired. `tdd_intent` set at task creation; no post-planning reclassification mechanism. |
| `tdd-contract` v1.5 | `rq-TDD009idem` (all 3 scenarios) | Idempotent fallback evidence writes retired with the fallback path itself. |
| `tdd-contract` v1.5 | `rq-TDD010phase` (both scenarios) | Phase derivation from evidence presence retired. No phase machine; `taskCompletedSignal.verification` is a single field. |

#### Amended Requirements

Specs to amend (`modify` or `delete-scenario` operation):

| Spec | Requirement | Amendment |
|---|---|---|
| `advance-delivery` v1.2 | `rq-ADVEXEC01` | Delete scenario `rq-ADVEXEC01.3` (fallback framing for `adv_task_evidence`). Other scenarios stay. |
| `advance-delivery` v1.2 | `rq-ADVEXEC04` | Delete scenario `rq-ADVEXEC04.2` (`adv_task_evidence` value-gated fallback). `rq-ADVEXEC04.1` (adv_run_test value categories) stays. |
| `advance-delivery` v1.2 | `rq-ADVEXEC04.1` (V7 finding #1) | Modify third `then` clause: replace "It explains task-run ledger continuity value" with "It explains durable workflow-queryable test record value." The retired `rq-taskRunLedger01` no longer provides the original "ledger continuity" value category; the new value is the durable, query-accessible test record on the change workflow. |
| `tdd-contract` v1.5 | `rq-TDD001inl` | Amend `rq-TDD001inl.1` `then` clause to remove the "expected to have tdd_evidence with both red and green phases" language; replace with "the task records inline TDD via adv_run_test calls; final claim recorded in taskCompletedSignal.verification". |
| `tdd-contract` v1.5 | `rq-TDD001inl` body (V7 finding #2) | Modify body: remove the sentence "The task's tdd_phase field tracks progress through none -> red -> green -> refactor -> complete." The phase machine is retired. Replace with "Inline TDD progress is observable via adv_run_test invocations and the final verification claim on taskCompletedSignal." |
| `tdd-contract` v1.5 | `rq-TDD008path` | Delete scenario `rq-TDD008path.2` (`adv_task_evidence` fallback). `rq-TDD008path.1` (primary path uses adv_run_test) and `rq-TDD008path.3` (exit-code semantics) stay. |
| `tdd-contract` v1.5 | `rq-TDD008path.3` `given` (V7 finding #3) | Modify `given` clause: replace "adv_run_test or adv_task_evidence records red or green phase evidence" with "adv_run_test records red or green phase evidence" (the retired `adv_task_evidence` is dropped from the disjunction). The scenario's exit-code-semantics behavior is unchanged. |
| `advance-meta` (current version) | `rq-worktreeRegistry01` (V7 finding #4) | Modify body: replace "must live inside the project workflow state" with "must live inside the change workflow state, with cross-change visibility via the `AdvWorktreeBranches` and `AdvWorktreePaths` Temporal search attributes." Modify scenarios `.1` and `.2`: replace `ProjectWorkflowState.worktree_registry` references with `change-workflow worktree state`; replace `addWorktreeSession workflow update` with `worktreeCreatedSignal`; replace "project workflow" with "change workflow." Observable behaviors (durable state, cross-session visibility, no sidecar DB per scenario `.3`) are preserved. |
| `advance-meta` (current version) | `rq-multiSessionCoordination01` (V7 finding #5) | Modify body: replace "serialized by Temporal workflow updates" with "serialized by Temporal workflow signals." Modify scenario `.1` `then` clause: replace "updates reach the project workflow as Temporal workflow updates" with "signals reach the change workflow as Temporal workflow signals; Temporal's per-workflow signal queue serializes them." Modify scenario `.2`: replace "mutators use monotonic source_version dedup" with "signal queue serialization provides ordering; idempotency is enforced by handler-level state checks where required." The serialization principle is preserved; the implementation mechanism changes from updates to signals. |
| `worktree-lifecycle` v1.0 | `rq-wl-branchRegistry01` body (V7 finding #6) | Modify body: replace "The worktree registry (ProjectWorkflowState.worktree_registry) must store per-entry..." with "The worktree registry (per-change workflow state, with cross-change visibility via `AdvWorktreeBranches` / `AdvWorktreePaths` Temporal search attributes) must store per-entry...". Branch-aware entries, setup readiness, and git-first reconciliation semantics are preserved. |
| `worktree-lifecycle` v1.0 | `rq-worktreeReuse01.1` (V7 finding #7, info) | Modify `then` clause: replace "No project-workflow recovery is required as a precondition for reuse" with "No per-change workflow recovery is required as a precondition for reuse — change-workflow state survives directly via Temporal." Cosmetic cleanup; the original clause becomes vacuous (no project workflow exists) but is otherwise non-blocking. |

#### Preserved Requirements

The following requirements are NOT touched by this change and remain in force:

| Spec | Requirement | Rationale |
|---|---|---|
| `advance-delivery` v1.2 | `rq-ADVEXEC02`, `rq-ADVEXEC03`, `rq-ADVEXEC05` | Asset/regression anchors and runtime guards for inline TDD remain valuable. |
| `advance-delivery` v1.2 | `rq-bulkClose01`, `rq-deltaOps01`, `rq-cc01` through `rq-cc05` | Unrelated to the retired surfaces. |
| `tdd-contract` v1.5 | `rq-TDD001inl.2`, `rq-TDD001inl.3`, `rq-TDD002sep`, `rq-TDD003na`, `rq-TDD004cls`, `rq-TDD005inv`, `rq-TDD006rem` | Inline-TDD-as-default, classifier, inversion detection, and merge-not-reverse remediation all stay. The model still favors inline TDD; only the post-completion ceremony is gone. |

#### Tool-Layer Boundary Enforcement (preserves O5 trust without losing safety)

Retiring the durable ledger does not eliminate every safety check. The tool layer still validates:

- `adv_run_test` exit-code semantics (red phase rejects exit-code 0; green phase rejects non-zero). Preserved per `rq-TDD008path.3`.
- `adv_task_checkpoint` verification, branch, and HEAD guards (`rq-cc01`, `rq-cc02`, `rq-cc03`, `rq-cc04`, `rq-cc05`). Unchanged.
- Inline-TDD bash workarounds blocked (`rq-ADVEXEC03`). Unchanged.
- Cancellation user-approval validation moves from workflow handler to `adv_task_cancel` tool layer (V5 row).

What's gone: durable replay of the red-green-checkpoint sequence. The workflow records the agent's verification claim and moves on. If the agent lies about verification, downstream gates (`/adv-review`, `/adv-harden`, conformance CI) catch the lie in code/tests, not in a Temporal ledger.

#### Acceptance Criterion (added to Part 4)

**SC11** — Spec deltas applied: `rq-taskRunLedger01`, `rq-TDD007req`, `rq-TDD009idem`, `rq-TDD010phase` deleted; `rq-ADVEXEC01.3`, `rq-ADVEXEC04.2`, `rq-TDD008path.2` scenario-deleted; `rq-ADVEXEC04.1`, `rq-TDD001inl` (body + `.1`), `rq-TDD008path.3` `given`, `rq-worktreeRegistry01` (body + `.1`/`.2`), `rq-multiSessionCoordination01` (body + `.1`/`.2`), `rq-wl-branchRegistry01` body, `rq-worktreeReuse01.1` `then` modified. Verified by inspection of `.adv/specs/advance-delivery.yaml`, `.adv/specs/tdd-contract.yaml`, `.adv/specs/advance-meta.yaml`, and `.adv/specs/worktree-lifecycle.yaml` after archive Phase 9.

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
| SC11 | Spec deltas applied per Section 10: 4 retired (`rq-taskRunLedger01`, `rq-TDD007req`, `rq-TDD009idem`, `rq-TDD010phase`); 3 scenario-deletes (`rq-ADVEXEC01.3`, `rq-ADVEXEC04.2`, `rq-TDD008path.2`); 7 modifications (`rq-ADVEXEC04.1`, `rq-TDD001inl` body+`.1`, `rq-TDD008path.3` given, `rq-worktreeRegistry01`, `rq-multiSessionCoordination01`, `rq-wl-branchRegistry01`, `rq-worktreeReuse01.1`) | Inspection of `.adv/specs/advance-delivery.yaml`, `.adv/specs/tdd-contract.yaml`, `.adv/specs/advance-meta.yaml`, `.adv/specs/worktree-lifecycle.yaml` post-archive |

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
