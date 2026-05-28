# Design — removePositionalArtifactApi

## Architecture Overview

Three layered changes anchored on one seam:

```
┌─────────────────────────────────────────────────────────────────┐
│ Layer 1: Type taxonomy (canonical ArtifactKind + ArtifactPayload) │
└───────────────────────────┬─────────────────────────────────────┘
                            │ feeds
┌───────────────────────────▼─────────────────────────────────────┐
│ Layer 2: Storage interface (options-object create/updateArtifacts) │
└───────────────────────────┬─────────────────────────────────────┘
                            │ implemented by
        ┌───────────────────┴──────────────────┐
        │                                      │
┌───────▼────────────┐               ┌─────────▼──────────────┐
│ store-disk (tests, │               │ store-temporal         │
│  recovery fallback)│               │ (production write path) │
│  writes to disk    │               │  fires content signals  │
└────────────────────┘               │  no disk writes         │
                                     └─────────┬──────────────┘
                                               │
                            ┌──────────────────▼──────────────────┐
                            │ Layer 3: Workflow state (state.documents)│
                            │  6 signals + 6 reducers + handlers      │
                            │  preserved across continueAsNew         │
                            └──────────────────┬──────────────────┘
                                               │ consumed by
                       ┌───────────────────────┴───────────────────────┐
                       │                                               │
            ┌──────────▼──────────┐                       ┌────────────▼─────────┐
            │ readArtifact (new) │                       │ Already-correct       │
            │  Temporal-first    │                       │ consumers light up:   │
            │  archive fallback  │                       │  gate-readiness       │
            │  batched query     │                       │  archive-summary      │
            └─────────────────────┘                       └──────────────────────┘
```

## Key Decisions

### KD-1: Canonical `ArtifactKind` lives in new `plugin/src/types/artifacts.ts`

**Decision:** New dedicated file, not added to `types/index.ts` barrel.

**Rationale:** Clear ownership boundary. `types/index.ts` is a re-export barrel; adding the canonical definition there mixes definition with re-export concerns. New file mirrors the existing pattern for `types/gates.ts`.

**Alternative considered:** Inline in `types/index.ts`. Rejected — barrel-vs-definition role confusion.

### KD-2: `ArtifactPayload` as Zod schema with TS inference

**Decision:** Define `ArtifactPayloadSchema` (Zod) with `ArtifactPayload = z.infer<typeof ArtifactPayloadSchema>`.

```ts
export const ArtifactPayloadSchema = z.object({
  proposal: z.string().optional(),
  problemStatement: z.string().optional(),
  agreement: z.string().optional(),
  design: z.string().optional(),
  executiveSummary: z.string().optional(),
  acceptance: z.string().optional(),
});
export type ArtifactPayload = z.infer<typeof ArtifactPayloadSchema>;
```

**Rationale:** Mirrors existing `DocumentUpdateBaseSchema` (`types/signals.ts:27`) pattern. Allows runtime validation at MCP tool boundary if needed (defense in depth even though current tools validate before reaching the store). Plain interface gives no runtime safety; Zod gives both.

**Alternative considered:** Plain TS interface. Rejected — pattern inconsistency with neighboring signal schemas.

### KD-3: Signal fan-out via explicit ordered array

**Decision:** Hard-code the ordered list of `[field, signal]` pairs in `store-temporal/changes.ts` rather than iterating `Object.entries(artifacts)`.

```ts
const ARTIFACT_SIGNAL_ORDER: ReadonlyArray<
  [keyof ArtifactPayload, ContentSignal]
> = [
  ["proposal", proposalUpdatedSignal],
  ["problemStatement", problemStatementUpdatedSignal],
  ["agreement", agreementUpdatedSignal],
  ["design", designUpdatedSignal],
  ["executiveSummary", executiveSummaryUpdatedSignal],
  ["acceptance", acceptanceUpdatedSignal],
];
```

**Rationale:** C5 mandates deterministic order. While modern JS engines preserve insertion order for string keys, **explicit is structural** (P33) — readers see ordering as the explicit contract it is, not as an emergent property of object iteration. Type system catches drift between `keyof ArtifactPayload` and the array via the type annotation. Compile-time guarantee: every payload key has exactly one entry.

**Alternative considered:** `Object.entries(artifacts)` with documented ordering assumption. Rejected — implicit contract.

### KD-4: Tool-layer fan-out with sequential await

**Decision:** Tool layer fires signals in a `for` loop with `await`. No `Promise.all`. No `Promise.allSettled`.

```ts
for (const [field, signal] of ARTIFACT_SIGNAL_ORDER) {
  const content = artifacts[field];
  if (content === undefined) continue;
  validatePerArtifactSize(field, content); // KD-8
  await handle.signal(signal, { text: content, updatedAt });
}
```

**Rationale:** C5 + research finding (TS SDK preserves server-acceptance order within an activation; concurrent firing reorders).

**Mid-batch failure handling:** If `handle.signal` throws on signal N, the loop exits with the error. Signals 1..N-1 have already been server-accepted and applied. The caller catches, logs which artifact failed, and may retry by calling `updateArtifacts` again with the same payload. Signal semantics are state-replacement (not delta), so re-applying signals 1..N-1 with identical content is a no-op (idempotent overwrite). C8 documents this.

### KD-5: Workflow-start hydration via `seedState.documents`

**Decision:** Extend `ensureChangeWorkflowStarted` (`storage/store-temporal/index.ts` or wherever it lives) to read disk artifacts and include them in `seedState.documents` ONLY when:

1. Workflow is being newly started (not warm-resumed via continueAsNew — continueAsNew preserves state.documents already, line 1271).
2. `seedState.documents` is not already populated by the caller.
3. Disk has at least one artifact file for the change.

**Detection of "newly started":** `ensureChangeWorkflowStarted` already distinguishes start from resume internally (it handles `WorkflowExecutionAlreadyStarted` for warm path). The hydration step runs in the cold-start branch only.

**Implementation sketch:**

```ts
// Inside ensureChangeWorkflowStarted, cold-start branch:
if (!input.seedState?.documents) {
  const diskDocuments = await readDiskArtifactsForHydration(
    input.changesDir,
    input.changeId,
  );
  if (diskDocuments && Object.keys(diskDocuments).length > 0) {
    input.seedState = { ...input.seedState, documents: diskDocuments };
  }
}
```

`readDiskArtifactsForHydration` reads each of the 6 known filenames via `inspectArtifactActivity` (already exists, `activities.ts:114-145`); returns `{ proposal?, problemStatement?, ... }` populated with whatever exists on disk.

**Partial-write robustness:** A disk crash could leave artifacts in a partial state (e.g., `proposal.md` written but `agreement.md` truncated). `inspectArtifactActivity` already returns `nonWhitespaceChars` and `contentHash`. Hydration:

1. Skips files with `nonWhitespaceChars < MIN_HYDRATABLE_CHARS` (defaulting to 1) — empty/truncated files do not hydrate.
2. If `state.artifacts.{kind}.contentHash` exists from a prior partial signal and `inspectArtifactActivity.contentHash !== state.artifacts.{kind}.contentHash`, the disk file is stale relative to a prior partial Temporal write — skip hydration for that kind, leave `state.documents.{kind}` empty, and log a hydration-skip event for observability.
3. Successfully-hydrated kinds are seeded; skipped kinds remain `undefined` in `state.documents` and follow the standard "no content yet" read path until next `updateArtifacts` overwrites.

**setHandler registration ordering:** The workflow body MUST apply `seedState.documents` to `state.documents` BEFORE registering content-signal handlers with `wf.setHandler`. Otherwise, a buffered signal could arrive at handler registration with `state.documents` still undefined and a race condition could overwrite hydrated content. Current workflow code at `workflows.ts:515-545` already applies seedState before `setHandler` registration (lines 893+) — preserve this ordering.

**Rationale:** Hydration deterministic, idempotent, runs once per change-workflow lifetime, outside any query handler. AC9 satisfied. Partial-write robustness via contentHash gating. setHandler-ordering invariant locked.

**Alternative considered:** Lazy hydration on first read. Rejected during proposal — mixes writes into query handlers, fragile.

### KD-6: Unified `readArtifact` replaces `loadProposalWithFallback` + `readArtifactWithArchiveFallback`

**Decision:** New `readArtifact(changeId, kind: ArtifactKind): Promise<string | null>` in `tools/change.ts`. Replaces both existing functions.

**Read precedence:**

1. **Active workflow:** Query `state.documents[kind]` via cached `changeStateQuery` (reuses `getTemporalChange` + `changeCache`). If non-empty, return.
2. **Archived change:** Workflow may have terminated. Locate the latest archive bundle in `.adv/archive/{cid}-*/`. Read `{filename}.md`. If present, return.
3. **Pre-migration legacy:** Active workflow returned undefined. Hydration step (KD-5) only runs at workflow start. For workflows already running with empty `state.documents`, return null. Next `updateArtifacts` call hydrates naturally; meanwhile reads gracefully return null (caller handles).

**Batched read for multi-include:**

```ts
export async function readArtifacts(
  changeId: string,
  kinds: ArtifactKind[],
): Promise<Partial<Record<ArtifactKind, string>>> {
  const snapshot = await getTemporalChange(changeId); // single query
  const docs = snapshot.state.documents ?? {};
  const result: Partial<Record<ArtifactKind, string>> = {};
  for (const kind of kinds) {
    const content = docs[kind];
    if (content !== undefined) result[kind] = content;
  }
  return result;
}
```

**Rationale:** C9 batched-query requirement. Single query covers all kinds; per-kind extraction is in-memory.

### KD-7: Read callsite migration

15 callsites migrate:

| File | Lines | Current call | New call |
|---|---|---|---|
| `tools/change.ts` | 554, 874, 1466, 1919, 2073, 2436 | `loadProposalWithFallback` | `readArtifact(id, "proposal")` |
| `tools/change.ts` | 2084, 2093, 2102, 2111 | `readArtifactWithArchiveFallback` | `readArtifact(id, kind)` (kind varies) |
| `tools/change.ts` show-handler block (~2070-2120) | — | per-kind reads | `readArtifacts(id, [requested-kinds])` (batched) |
| `tools/status.ts` | 603 | `loadProposalWithFallback` | `readArtifact(id, "proposal")` |
| `tools/gate.ts` | 573, 662 | `loadProposalWithFallback` | `readArtifact(id, "proposal")` |
| `storage/context-snapshot-fetch.ts` | 22 | `loadProposalWithFallback` | `readArtifact(id, "proposal")` |

After migration, `loadProposalWithFallback` and `readArtifactWithArchiveFallback` are unreferenced — delete them.

### KD-8: Size cap enforcement — defense in depth

**Decision:** Two-layer enforcement.

**Layer 1 — tool layer pre-check** (fail fast, before any signal fires):

```ts
function validatePerArtifactSize(field: ArtifactKind, content: string): void {
  const size = Buffer.byteLength(content, "utf-8");
  if (size > ARTIFACT_HARD_CAP) {
    throw new Error(
      `Artifact '${field}' (${size} bytes) exceeds hard cap (${ARTIFACT_HARD_CAP}). Reduce size.`,
    );
  }
  if (size > ARTIFACT_SOFT_CAP) logger.warn(...);
}

function validateAggregateSize(artifacts: ArtifactPayload, existing: Documents): void {
  const total = computeProjectedTotal(artifacts, existing);
  if (total > AGGREGATE_HARD_CAP) {
    throw new Error(`Aggregate documents size (${total}) exceeds hard cap (${AGGREGATE_HARD_CAP}). Reduce content.`);
  }
  if (total > AGGREGATE_SOFT_CAP) logger.warn(...);
}
```

**Layer 2 — signal handler validation** (structural, P33; enforces even when tool layer bypassed):

Signal handlers MUST NOT throw. Per Temporal docs (https://docs.temporal.io/handling-messages#exceptions), throwing `ApplicationFailure` in a signal handler fails the ENTIRE workflow; other exceptions cause Workflow Task Failure → stuck workflow. The canonical ADV pattern is **state-mutation rejection** (see `workflows.ts:722-732, 1098` `applyGateStuckToState`): record the rejection in workflow state, do NOT mutate `state.documents[kind]`, do NOT throw.

```ts
function applyProposalUpdatedToStateWithSizeGuard(state, payload) {
  const size = Buffer.byteLength(payload.text, "utf-8");
  if (size > ARTIFACT_HARD_CAP) {
    // State-mutation rejection — workflow continues, signal effectively no-op
    state.artifacts.proposal = {
      ...state.artifacts.proposal,
      rejection: {
        reason: "ARTIFACT_OVERSIZED",
        attempted_size: size,
        cap: ARTIFACT_HARD_CAP,
        rejected_at: payload.updatedAt,
      },
    };
    setLastSignalAt(state, payload.updatedAt);
    return state; // state.documents.proposal unchanged
  }
  if (size > ARTIFACT_SOFT_CAP) {
    state.artifacts.proposal = {
      ...state.artifacts.proposal,
      sizeWarning: { size, soft_cap: ARTIFACT_SOFT_CAP, at: payload.updatedAt },
    };
  }
  return applyProposalUpdatedToState(state, payload);
}

wf.setHandler(
  proposalUpdatedSignal,
  signalMutation("proposalUpdated", (payload) =>
    applyProposalUpdatedToStateWithSizeGuard(state, payload),
  ),
);
```

The rejection metadata is queryable via `changeStateQuery` so the tool layer (which performs Layer 1 pre-check and should normally prevent this) can verify acceptance after a signal fires. Layer 1 remains the primary user-error surface; Layer 2 is structural defense against tool-layer bypass (test fixtures, future code paths, manual signal injection during recovery).

**Aggregate cap** (C4) similarly uses state-mutation rejection — if a content signal would push aggregate over `AGGREGATE_HARD_CAP`, the handler records `state.documents_rejected_aggregate` and returns state unchanged.

**Constants:**

```ts
export const ARTIFACT_SOFT_CAP = 64 * 1024;      // 64 KB
export const ARTIFACT_HARD_CAP = 256 * 1024;     // 256 KB
export const AGGREGATE_SOFT_CAP = 1024 * 1024;   // 1 MB
export const AGGREGATE_HARD_CAP = 1.8 * 1024 * 1024; // 1.8 MB
```

**Rationale:** C3, C4, C15. Tool layer fails fast on user error. Signal handler structural defense in case tool-layer bypass (tests, future code paths, recovery flows).

### KD-9: Disk store retained with options-object API; production routes through temporal store

**Decision:** Both stores adopt `(summary, options?)` / `(changeId, artifacts)` signatures. Disk store still writes artifacts to disk (that's its contract). Production code path uses temporal store, which does NOT write artifacts to disk.

**Rationale:** C12 acceptance recovery path uses disk-store-like behavior (`inspectArtifactActivity` reads from disk). The disk store's "write to disk" semantics serve:
- Test fixtures (existing pattern)
- Recovery flows that need to materialize on disk because Temporal is unavailable

The temporal store's "write to Temporal, no disk" is the production path. The two stores share signature shape (interface conformance) but diverge in artifact-content persistence target.

### KD-10: Migration phase ordering

**Decision:** Write path → Read path → Disk-write removal → Positional signature deletion.

**Phase boundaries:**

1. **Phase 1-2 (taxonomy + schema):** Canonical types + new signals. No behavior change.
2. **Phase 3 (API surface):** Options-object signature added; positional signature retained as overload. Both work. No behavior change.
3. **Phase 4 (write path):** Temporal store fires content signals. Still writes to disk via `legacy.changes`. Consumers (`gate-readiness`, `archive-summary`) light up immediately because they already read `state.documents` first.
4. **Phase 5 (read path):** `readArtifact` Temporal-first. Disk fallback retained for pre-migration changes that haven't been hydrated yet.
5. **Phase 6 (hydration):** Workflow-start hydration extends `ensureChangeWorkflowStarted`. Pre-migration changes hydrate on next workflow restart.
6. **Phase 7-9 (acceptance convergence + cross-session smoke + bundle materialization):** Specialized tests.
7. **Phase 10 (size invariant):** KD-8 layer 1 + 2 added.
8. **Phase 11 (crash-recovery):** AC15 covered, docs updated.
9. **Phase 12 (tool surface parity):** AC11 covered.
10. **Phase 13-15 (production call sites + test fixtures + sweep):** Mechanical migration.
11. **Phase 16 (disk-write removal):** `legacy.changes.create/updateArtifacts` calls for artifact content removed from temporal store. AC8 satisfied.
12. **Phase 17 (positional signature deletion + build verification):** AC17 + AC12.

**Rationale:** Writes first means consumers activate before reads change. Reads next means UX validation before disk decommission. Disk-write removal late ensures all tests pass at each intermediate state. Each phase passes the full suite.

### KD-11: Contract-compromise audit

Walk every constraint against the design decisions:

| Constraint | Design satisfies? | Mechanism |
|---|---|---|
| C1 scope | Yes | KD-1..10 touch only artifact markdown; `change.json` etc. unchanged |
| C2 archive bundle format | Yes | Bundle layout unchanged; only producer source changes (disk → state.documents) |
| C3 per-artifact size caps | Yes | KD-8 two-layer enforcement |
| C4 aggregate size caps | Yes | KD-8 tool layer aggregate check |
| C5 sequential ordering | Yes | KD-3 ordered array + KD-4 sequential await |
| C6 backward compat | Yes | KD-5 workflow-start hydration |
| C7 replay safety | Yes | All schema/handler additions are additive optional |
| C8 crash-recovery | Yes | KD-4 idempotent overwrite semantics + AC15 docs |
| C9 batched read | Yes | KD-6 `readArtifacts` single query |
| C10 tool surface unchanged | Yes | KD-2 internal store API only; MCP tool schemas untouched |
| C11 no new storage | Yes | KD-1..10 use Temporal state directly |
| C12 acceptance recovery | Yes | KD-9 disk store retained; recovery path unaffected |
| C13 atomic removal | Yes | KD-10 phase 17 deletes positional + triple-drift together |
| C14 worktree isolation | Yes | Process-level (P32); all phases run from per-change worktree |
| C15 structural correctness | Yes | KD-8 signal-handler validation is structural via **state-mutation rejection** (not throw — per Temporal docs, throwing in signal handlers fails the workflow). Records `state.artifacts.{kind}.rejection` and leaves `state.documents.{kind}` unchanged. |

**No contract compromises identified.** Proceeding without user re-confirmation per gate rules.

### KD-12: Test architecture

**Compile-time invariants:**

```ts
type _PayloadKeysMatchArtifactKind =
  keyof ArtifactPayload extends ArtifactKind
    ? ArtifactKind extends keyof ArtifactPayload
      ? true
      : never
    : never;
const _check: _PayloadKeysMatchArtifactKind = true;
```

Plus assertion in `ARTIFACT_SIGNAL_ORDER` array type: missing or extra entries fail to compile.

**Runtime invariants:**

- `artifact-payload-signal-invariant.test.ts` — recording signal client verifies one-signal-per-defined-field (AC6).
- `temporal-source-of-truth.itest.ts` — AC1, AC2 via state query + disk-deletion sanity check.
- `workflow-start-hydration.itest.ts` — AC9 via disk fixture → workflow start → state query.
- `crash-recovery-mid-batch.test.ts` — AC15 via signal-failure injection + re-issue.
- `full-lifecycle.itest.ts` — AC12 via real Temporal dev server.
- `archive-bundle-from-documents.itest.ts` — AC10 via archive activity reading state.documents.
- `gate-readiness-from-documents.test.ts` + `archive-summary-from-documents.test.ts` — AC7 (consumer alignment).

## Module Surface

### New files

| Path | Purpose |
|---|---|
| `plugin/src/types/artifacts.ts` | `ArtifactKindSchema`, `ArtifactKind`, `ArtifactPayloadSchema`, `ArtifactPayload`, size cap constants |
| `plugin/src/storage/artifact-payload-signal-invariant.test.ts` | AC6 |
| `plugin/src/temporal/__tests__/temporal-source-of-truth.itest.ts` | AC1, AC2 |
| `plugin/src/temporal/__tests__/workflow-start-hydration.itest.ts` | AC9 |
| `plugin/src/temporal/__tests__/crash-recovery-mid-batch.test.ts` | AC15 |
| `plugin/src/temporal/__tests__/full-lifecycle.itest.ts` | AC12 |
| `plugin/src/temporal/__tests__/archive-bundle-from-documents.itest.ts` | AC10 |
| `plugin/src/temporal/__tests__/replay-safety.test.ts` | C7 |

### Modified files

(See Affected Code list in agreement; design does not expand scope.)

### Deleted

- `loadProposalWithFallback` from `storage/json.ts` (after KD-7 migration complete)
- `readArtifactWithArchiveFallback` from `tools/change.ts` (after KD-7 migration complete)
- Local `ArtifactKind` definitions in `temporal/contracts.ts:126` and `temporal/activities.ts:42`

## Interaction Sequence — `updateArtifacts` Happy Path

```
Tool layer (adv_change_update)
   │
   ▼
store-temporal.changes.updateArtifacts(id, artifacts: ArtifactPayload)
   │
   ├─ validateAggregateSize(artifacts, existing-state.documents)
   │
   ├─ for [field, signal] of ARTIFACT_SIGNAL_ORDER:
   │     if (artifacts[field] === undefined) continue
   │     validatePerArtifactSize(field, content)
   │     await handle.signal(signal, { text, updatedAt })   ← server-accepted, ordered
   │     await handle.signal(updateArtifactMetadataSignal, { kind, metadata }) ← after content
   │
   ▼
Workflow handler chain (one per signal, replay-safe):
   apply*UpdatedToState(state, payload)
      state.documents = { ...state.documents, [field]: text }
      state.lastSignalAt = updatedAt
   → state.artifacts[kind].contentHash = sha256(text)
```

## Interaction Sequence — `adv_change_show` Read Path

```
adv_change_show changeId include: { proposal: true, design: true }
   │
   ▼
readArtifacts(id, ["proposal", "design"])
   │
   ├─ getTemporalChange(id)                ← single cached query
   │
   ├─ docs = snapshot.state.documents
   ├─ result = { proposal: docs.proposal, design: docs.design }
   │
   ▼
return result                              ← byte-identical to old behavior post-hydration
```

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Workflow history bloat under repeated `updateArtifacts` for the same artifact | Existing `continueAsNew` threshold (5,000 events) rotates history; state.documents is rebuilt at each rotation; no unbounded accumulation |
| `continueAsNew` seed approaching 2 MB ceiling | KD-8 aggregate hard cap 1.8 MB; soft warn 1 MB |
| Mid-batch signal failure leaves partial state | KD-4 idempotent state-replacement; AC15 covering test |
| Test fixtures bypass tool layer pre-check | KD-8 layer 2 signal handler validation catches |
| Existing histories without `executiveSummary`/`acceptance` events | C7 additive-only is replay-safe per Temporal safe-deployments |
| Workflow-start hydration races with concurrent writes | Hydration runs only on cold-start branch of `ensureChangeWorkflowStarted`; concurrent writes can't reach signals before workflow exists |

### KD-13: Archive bundle materialization activity

**Decision:** Extend the existing archive activity in `plugin/src/temporal/activities.ts` (writes alongside `writeArtifactActivity`) with a new `materializeBundleArtifactsActivity` that reads `state.documents` from the workflow at archive time and writes the six markdown files into `.adv/archive/{cid}-{ts}/`.

```ts
export interface MaterializeBundleArtifactsInput {
  bundleDir: string;
  documents: ChangeWorkflowState["documents"];
}
export async function materializeBundleArtifactsActivity(
  input: MaterializeBundleArtifactsInput,
): Promise<{ written: ArtifactKind[] }> {
  const written: ArtifactKind[] = [];
  for (const kind of ArtifactKindSchema.options) {
    const content = input.documents?.[kind];
    if (content === undefined) continue;
    const filename = ARTIFACT_FILENAME[kind];
    await atomicWriteFile(join(input.bundleDir, filename), content);
    written.push(kind);
  }
  return { written };
}
```

Called from the archive workflow path (where `archiveRequestedSignal` is currently handled — `workflows.ts` archive branch). Bundle dir layout, filenames, and git commit semantics unchanged (C2).

**Rationale:** AC10 mapped to a single specific activity. `state.documents` is the source. Disk write at bundle materialization is the ONE production write path that survives (consistent with AC8 — "no artifact-content disk writes from the temporal store production path"; the archive activity is a separate path that runs as part of the archive workflow, not the store path).

## Validator Resolution

Independent validator (adv-researcher) returned **CAUTION** on initial draft with one required fix and three recommended improvements — all addressed inline:

| Finding | Resolution |
|---|---|
| KD-8 Layer 2 `throw` is incorrect — Temporal docs confirm throwing in signal handlers fails the workflow | Rewrote KD-8 Layer 2 to state-mutation rejection pattern matching ADV's existing `applyGateStuckToState` LBP at `workflows.ts:722-732, 1098`. KD-11 audit row updated. |
| AC10 should map to a specific archive activity | Added KD-13 `materializeBundleArtifactsActivity` with explicit interface. |
| Partial-write robustness in KD-5 hydration | Added contentHash gating + `nonWhitespaceChars` minimum + skip-and-log behavior. |
| setHandler registration ordering invariant for hydration | Documented explicitly in KD-5; current code already conforms. |

Validator confirmed:
- KD-3 explicit ordered array is correct and idiomatic for TS SDK (no batched-signal primitive exists).
- KD-10 migration phase ordering is sound — additive optional state + additive signal handlers are replay-safe per Temporal safe-deployments.
- KD-4 sequential await is required for per-activation ordering.
- Cold/warm detection in `ensureChangeWorkflowStarted` already exception-driven via `WorkflowExecutionAlreadyStarted`; server `WorkflowIdReusePolicy` guarantees no concurrent-start race.

Report ID: `removePositionalArtifactApi|change:researcher:design-validation|adv-researcher|1`
