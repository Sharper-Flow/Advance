# Remove Positional Artifact API & Make Temporal Source of Truth for Artifact Content

## Why

Three intertwined problems share the same architectural seam — the artifact write/read path:

### Problem 1: Positional API bug magnet

`Store["changes"].create()` and `Store["changes"].updateArtifacts()` use a 7-arg positional optional parameter API. Silent slot-shift bugs; arity bumps for every new artifact; ~30 call sites lock the pattern in.

### Problem 2: Triple `ArtifactKind` drift

Three independent enums for "what artifacts exist":

| Definition | Kinds | Naming |
|---|---|---|
| `temporal/contracts.ts:126` | proposal, problemStatement, agreement, design, executiveSummary | camelCase, no acceptance |
| `temporal/activities.ts:42` | proposal, problem-statement, agreement, design, acceptance, executive-summary | kebab-case, has acceptance |
| `types/gates.ts:75 GateArtifactKind` | proposal, agreement, design, acceptance | gate-backing subset |

### Problem 3: Disk is the last cross-session dependency

Every other authoritative state surface is Temporal-backed:

| Surface | Source of truth |
|---|---|
| Change enumeration | Temporal Visibility |
| Gate state, tasks, contract, review matrix | Temporal workflow state |
| Worktree paths | Search attribute `AdvWorktreePaths` |
| **Artifact content** | **Disk only** (`$XDG_DATA_HOME/.../changes/{cid}/*.md`) |

Infrastructure for content-in-Temporal already exists but is **dormant in production**:

- `temporal/contracts.ts:221-226` defines `ChangeWorkflowState.documents` (proposal, problemStatement, agreement, design — 4 of 6).
- `types/signals.ts:27-52` defines `DocumentUpdateBaseSchema` with `text: string`.
- `temporal/messages.ts:121-132` defines four document signals.
- `temporal/change-state.ts:172-209` defines four `apply*UpdatedToState` reducers.
- `temporal/workflows.ts:893-916` registers four handlers.
- `temporal/workflows.ts:1271` preserves `documents` across `continueAsNew`.
- `temporal/workflows.ts:524` accepts `documents` via `seedState`.

**Production never fires these signals.** Only tests do. Production writes route through `legacy.changes.create()` / `updateArtifacts()` (disk-only), then `updateArtifactMetadataSignal` carries only metadata (path, hash, timestamp) — proven by `temporal/contracts.ts:134-138` `ArtifactMetadata = { path, updatedAt, contentHash? }` (no content field). Reads (`loadProposalWithFallback`, `readArtifactWithArchiveFallback`) always hit disk; `state.documents` is never queried by writers.

**Critical consumer alignment finding:** Two production consumers already read `state.documents` correctly and just always fall through to fallback today because production never populates it:
- `temporal/gate-readiness.ts:91-93` `agreementExists()` reads `state.documents.agreement` first.
- `utils/archive-summary.ts:44-47` reads `state.documents.problemStatement ?? state.documents.proposal ?? state.title`.

Wiring producers lights these consumers up immediately with zero consumer-side change.

`executiveSummary` and `acceptance` are absent from `documents` entirely.

### Why fix all three together

The positional API change touches every artifact write site. The triple-drift unification touches the kind taxonomy. The content-in-Temporal migration changes who owns artifact content. **The seam is the same seam.** Two churn cycles → one. Dormant signal infrastructure stops being dormant.

### Motivation context — per-session XDG isolation

The downstream win is per-session `XDG_DATA_HOME` isolation for OpenCode. Multiple OpenCode sessions on the same machine currently share `~/.local/share/opencode/opencode.db`, causing silent SQLite WAL contention hangs (upstream `anomalyco/opencode` issues #21215, #22429, #20935, #24785). The practical workaround is per-project or per-session `XDG_DATA_HOME`. Both depend on Temporal being the source of truth for ADV change content — otherwise sessions sharing a project see only the artifacts they personally wrote.

Per-project XDG works today with the current schema. Per-session XDG unlocks fuller isolation but breaks artifact visibility across sessions of the same project until this ticket lands.

## Goal

Make Temporal `state.documents` the **single source of truth** for change artifact content. Disk artifacts become a derived view materialized only when building the archive bundle for git commit. Unify `ArtifactKind`. Replace positional API with typed payload.

## What Changes

### 1. Single canonical `ArtifactKind` + `ArtifactPayload`

New `plugin/src/types/artifacts.ts`:

```ts
export const ArtifactKindSchema = z.enum([
  "proposal",
  "problemStatement",
  "agreement",
  "design",
  "executiveSummary",
  "acceptance",
]);
export type ArtifactKind = z.infer<typeof ArtifactKindSchema>;

export interface ArtifactPayload {
  proposal?: string;
  problemStatement?: string;
  agreement?: string;
  design?: string;
  executiveSummary?: string;
  acceptance?: string;
}

// Compile-time invariant lock
type _PayloadKeysMatchArtifactKind =
  keyof ArtifactPayload extends ArtifactKind
    ? ArtifactKind extends keyof ArtifactPayload
      ? true
      : never
    : never;
const _check: _PayloadKeysMatchArtifactKind = true;
```

- Delete local `ArtifactKind` in `temporal/contracts.ts:126` and `temporal/activities.ts:42`.
- `types/gates.ts GateArtifactKind` derived from canonical `ArtifactKind`.
- Naming standard: **camelCase at type/payload/signal layers**; kebab-case lives only in the `ARTIFACT_FILENAME` map.

### 2. `ChangeWorkflowState.documents` schema extension

`temporal/contracts.ts`:

```ts
documents?: {
  proposal?: string;
  problemStatement?: string;
  agreement?: string;
  design?: string;
  executiveSummary?: string;
  acceptance?: string;
};
```

Additive optional fields — workflow replay safe.

### 3. Two new content signals

`temporal/messages.ts` + `types/signals.ts`:

- `executiveSummaryUpdatedSignal` (`DocumentUpdateBaseSchema`)
- `acceptanceUpdatedSignal` (`DocumentUpdateBaseSchema`)

`temporal/change-state.ts`:

- `applyExecutiveSummaryUpdatedToState`
- `applyAcceptanceUpdatedToState`

`temporal/workflows.ts`:

- Register both handlers (alongside lines 893-916).
- Preserve in `continueAsNew` seed (line 1271).
- Accept in `seedState` (line 524).

### 4. Options-object Store API

`storage/store-types.ts`:

```ts
interface ChangeStore {
  create(
    summary: string,
    options?: {
      capability?: string;
      artifacts?: ArtifactPayload;
      initialMetadata?: ChangeCreateOptions["initialMetadata"];
    },
  ): Promise<CreateResult>;
  updateArtifacts(
    changeId: string,
    artifacts: ArtifactPayload,
  ): Promise<UpdateResult>;
}
```

Positional signatures deleted atomically.

### 5. Write path: Temporal-first

`storage/store-temporal/changes.ts`:

- `create()`: after `ensureChangeWorkflowStarted`, fire one `*UpdatedSignal` per defined field on `options.artifacts` in deterministic order (proposal → problemStatement → agreement → design → executiveSummary → acceptance). The corresponding `updateArtifactMetadataSignal` fires **after** its content signal so `state.artifacts.{kind}.contentHash` stays consistent with `state.documents.{kind}`. **Undefined fields fire no signal.**
- `updateArtifacts()`: same fan-out for defined fields only.
- **No artifact-content disk writes from the temporal store production path.** `legacy.changes.create` and `legacy.changes.updateArtifacts` are no longer called for artifact content. They remain callable for non-artifact disk scaffolding (`change.json`, etc.) — out of scope.

`storage/store-disk.ts`:

- Options-object signature; continues to write to disk (disk store is used in tests and rare disk-only fallback; its contract is "store on disk"). The temporal store is the production path that breaks the disk dependency.

### 6. Read path: Temporal-first with archive-bundle fallback

`tools/change.ts`:

- New `readArtifact(changeId, kind): Promise<string | null>`:
  1. Active workflow: query `state.documents[kind]` via cached `changeStateQuery` (reuse `getTemporalChange` / `changeCache`).
  2. Archived change: workflow may have terminated → read from archive bundle (`.adv/archive/{cid}-{ts}/{filename}.md`) — committed to git, durable.
  3. Hydration fallback: see § 7.
- Batched reads: when `adv_change_show` requests multiple `include.*` fields, **one workflow query** returns all of `state.documents`, not one query per kind.
- Migrate all current callers (12 sites): `tools/change.ts:554, 874, 1466, 1919, 2073, 2084, 2093, 2102, 2111, 2436`, `tools/status.ts:603`, `tools/gate.ts:573, 662`, `storage/context-snapshot-fetch.ts:22`.

### 7. Legacy change hydration: workflow-start, not lazy-read

**Refinement from the source proposal.** Lazy hydration on first read would mix writes into query handlers — fragile. Instead:

- `ensureChangeWorkflowStarted` gains an idempotent hydration step:
  1. If the workflow is newly started AND disk has artifact files for this change AND `seedState.documents` is empty, the start path reads disk artifacts into `seedState.documents`.
  2. The existing `seedState` accept path (line 524) projects them into `state.documents`.
- Hydration happens deterministically once per change on workflow start, outside any query or read path.
- For changes whose workflow is already running, content signals will hydrate naturally on next `updateArtifacts` call. Optional manual migration tool not required for AC pass.
- For archived changes, the bundle dir is canonical; no migration needed.

### 8. Archive bundle materialization

`utils/archive-summary.ts` and the archive activity:

- The archive activity reads `state.documents` from the workflow and writes markdown files into `.adv/archive/{cid}-{ts}/` for the git commit.
- **This is the only point where artifact content touches disk in the production path.**
- Bundle commit captures content authoritatively in git. Bundle layout, file names, and git commit semantics unchanged (C2).

### 9. Crash-recovery semantics (P1.4 evolution)

Current P1.4 transactional guard (`store-temporal/changes.ts:99-114`): if workflow start fails, disk scaffold is rolled back.

New shape preserves and strengthens:
- **Workflow-start failure** → disk scaffold (change.json) rolled back, original error re-thrown. Unchanged.
- **Content-signal failure mid-batch** (e.g. signal 3 of 6 fails) → workflow state is partially populated with signals 1-2 already applied. Recoverable: re-issuing `updateArtifacts` with the same payload completes the batch idempotently because each content signal is a full-content overwrite, not a delta.
- Explicit test simulates signal failure between two artifact updates and verifies re-issue completes correctly.
- Documented in `docs/temporal-recovery.md`.

### 10. Acceptance write convergence

Currently `gate.ts:360, 399` writes `acceptance.md` via the gate-completion path with explicit `artifactKind: "acceptance"` and `compatibilityReason`. After this change:

- `gate.ts` acceptance writes route through `store.changes.updateArtifacts(changeId, { acceptance: content })`.
- `acceptanceUpdatedSignal` carries content; gate-readiness consumer reads same signal-projected state.
- Compatibility-reason path preserved as an alternate evidence shape on the same signal contract.

### 11. Size invariant

Workflow history bounded by Temporal limits: per-payload 2 MB cap, per-workflow history default 50 MB cap. Six artifacts × multiple updates × continue-as-new boundaries must stay well under 50 MB.

Enforced structurally:
- Per-artifact soft cap: **64 KB** → warn in signal handler.
- Per-artifact hard cap: **256 KB** → reject signal with explicit error.
- Total `state.documents` size logged on `continueAsNew` for observability.
- **Must not embed unbounded content alongside artifacts** (no test logs, binary blobs, transcript dumps in `documents`).

### 12. Tool surface unchanged

`adv_change_create` and `adv_change_update` MCP tool schemas continue to accept identical user-facing fields (`proposal`, `problemStatement`, `agreement`, `design`, `executiveSummary`). The `ArtifactPayload` refactor is internal to the store interface. Tool input shape does not change.

## Acceptance Criteria

- **AC1.** `ArtifactPayload` type in `types/artifacts.ts`. Compile-time `satisfies` lock: `keyof ArtifactPayload === ArtifactKind`. All call sites use `ArtifactPayload`; positional content parameters removed from `Store` interface.
- **AC2.** `ChangeWorkflowState.documents` includes all six fields. `continueAsNew` seed preserves them. `seedState` accepts them.
- **AC3.** Two new signals (`executiveSummaryUpdatedSignal`, `acceptanceUpdatedSignal`) defined, payloads use `DocumentUpdateBaseSchema`, handlers registered, apply content to `state.documents`.
- **AC4.** After any `create()` or `updateArtifacts()` call with `artifacts.X` defined, querying `state.documents.X` returns the input content. Workflow integration test creates a change with all six artifacts populated and queries `state.documents` back.
- **AC5.** `adv_change_show` with all six `include.*` flags returns Temporal-backed content for an active change without reading disk. Tool test deletes on-disk change dir between write and read; content still returns.
- **AC6.** Cross-session smoke: clean process, empty `$XDG_DATA_HOME`, active-change content retrievable from Temporal. Integration test.
- **AC7.** Triple `ArtifactKind` drift eliminated. Single canonical definition in `types/artifacts.ts`. Local definitions deleted.
- **AC8.** Invariant test: for every defined field on `ArtifactPayload`, exactly one content signal fires with matching `kind`; for undefined fields, zero signals fire.
- **AC9.** Gate readiness `agreementExists()` (`gate-readiness.ts:91-93`) now resolves through populated `state.documents.agreement` rather than always falling through to artifact metadata fallback. Test asserts `agreementExists` returns true based on `state.documents.agreement` alone, with `state.artifacts.agreement` unset.
- **AC10.** Archive summary fallback chain (`archive-summary.ts:44-47`) now resolves to Temporal content. Archive-summary test asserts the summary contains content from `state.documents.problemStatement`, not just the change title.
- **AC11.** No production code path writes artifact markdown to disk via `legacy.changes.create` or `legacy.changes.updateArtifacts`. Verified by grep + test fake that asserts zero disk writes from the artifact write path during a normal change lifecycle. (`legacy.changes.*` may still write `change.json` and other non-artifact disk state — out of scope.)
- **AC12.** `pnpm run check` + targeted vitest suites pass. ADV integration test (real Temporal dev server) confirms full lifecycle: create → discover → design → prep → execute → accept → archive with content flowing through Temporal and landing in the git archive bundle.
- **AC13.** Workflow-start hydration: starting a workflow for a change with disk artifacts but no `documents` state populates `state.documents` from disk exactly once.
- **AC14.** Size invariant: artifact > 256 KB rejected at signal handler; 64-256 KB logged as warning.
- **AC15.** Crash-recovery: simulated content-signal failure mid-batch leaves workflow recoverable via `updateArtifacts` re-issue with same payload. Documented in `docs/temporal-recovery.md`.
- **AC16.** Tool surface unchanged: `adv_change_create` and `adv_change_update` accept identical user-facing fields. Schema test verifies parity with pre-change shape.
- **AC17.** Zero callers of old positional API remain. `rg "changes\\.create\\(.*,.*,.*,.*," plugin/src` and `rg "updateArtifacts\\(.*,.*,.*," plugin/src` return zero hits.

## Constraints

- **C1.** Do not change `change.json` or other non-artifact disk state. This ticket is scoped strictly to the six artifact markdown files. Subagent reports, `conformance.json`, `agenda.jsonl`, `wisdom.jsonl`, `worktrees.json`, `roadmap-snapshot.json` are out of scope.
- **C2.** Do not change archive bundle format or git commit semantics. Bundle files must remain readable by existing release/audit tooling. Materializing markdown into the bundle dir at archive time is acceptable; changing layout is not.
- **C3.** Workflow history size: document signal payloads carry full markdown. Per-payload Temporal limit 2 MB, per-workflow history default cap 50 MB. Typical artifacts <50 KB. Implementation MUST NOT embed unbounded content alongside (no logs, blobs, transcripts).
- **C4.** Signal ordering within a single `updateArtifacts` call MUST be deterministic for clean history diffs: proposal → problemStatement → agreement → design → executiveSummary → acceptance. The corresponding `updateArtifactMetadataSignal` for each kind fires AFTER its content signal.
- **C5.** Backward compatibility: changes created before this ticket have content on disk and empty `state.documents`. Workflow-start hydration (§ 7) covers them transparently. No breaking change to existing in-flight workflows.
- **C6.** P1.4 transactional guard preserved or strengthened (§ 9). Workflow-start failure → disk rollback unchanged. Content-signal failure mid-batch → state partially populated but recoverable via re-issue. Crash-recovery semantics documented and tested.
- **C7.** Read latency: every `adv_change_show include: { ... }` call requesting content issues one batched `changeStateQuery`, not one per kind. Reuse existing `getTemporalChange` / `changeCache` snapshot layers.
- **C8.** Tool surface contract: `adv_change_create` and `adv_change_update` schemas continue to accept identical user-facing fields. `ArtifactPayload` refactor is internal to the store interface.
- **C9.** Do not introduce a separate "content storage" abstraction. Temporal workflow state IS the storage. No content-addressed blob store, no S3 indirection, no separate SQLite. The point is structural simplicity.
- **C10.** Atomic positional removal — no transitional overload. Atomic `ArtifactKind` unification — all three local definitions deleted together. Camel-case at type/signal layers; kebab-case isolated to `ARTIFACT_FILENAME` map. Signal contract additive only.
- **C11.** Worktree isolation (P32). All implementation runs from the per-change worktree.
- **C12.** Size invariant enforced structurally (signal handler validation), not heuristically (P33).

## Out of Scope

- **OOS1.** Subagent report storage. Currently disk under `subagent-reports/`. Same migration could apply but has different scoping (multiple reports per change, per-task) and warrants its own ticket.
- **OOS2.** `conformance.json`, `agenda.jsonl`, `wisdom.jsonl`, `worktrees.json`, `roadmap-snapshot.json` — project-level state, different ownership model.
- **OOS3.** Cleaning up stale on-disk artifact files for migrated changes. Disk markdown becomes orphaned but harmless. Separate sweep task.
- **OOS4.** Removing `legacy.changes.create` / `updateArtifacts` entirely. They still own non-artifact disk scaffolding. They no longer write artifact content; the methods stay.
- **OOS5.** Per-session-XDG wrapper script for OpenCode launches. Adjacent motivating need; not part of this delivery.
- **OOS6.** Workflow retention / archive workflow restart for reading documents from completed workflows. Bundle-in-git is the durable record.

## Affected Code

### New
- `plugin/src/types/artifacts.ts` — canonical `ArtifactKind`, `ArtifactPayload`, compile-time invariant lock
- `plugin/src/storage/artifact-payload-signal-invariant.test.ts` — AC8
- `plugin/src/temporal/__tests__/temporal-source-of-truth.itest.ts` — AC4/AC5/AC6
- `plugin/src/temporal/__tests__/workflow-start-hydration.itest.ts` — AC13
- `plugin/src/temporal/__tests__/crash-recovery-mid-batch.test.ts` — AC15
- `plugin/src/temporal/__tests__/full-lifecycle.itest.ts` — AC12

### Modified
- `plugin/src/types/gates.ts` — `GateArtifactKind` derived from canonical
- `plugin/src/types/signals.ts` — add `ExecutiveSummaryUpdatedSignalPayloadSchema`, `AcceptanceUpdatedSignalPayloadSchema`
- `plugin/src/temporal/contracts.ts` — extend `documents` to 6; remove local `ArtifactKind`
- `plugin/src/temporal/messages.ts` — define 2 new content signals
- `plugin/src/temporal/change-state.ts` — add 2 reducers
- `plugin/src/temporal/workflows.ts` — register 2 handlers; extend `continueAsNew` seed and `seedState` accept
- `plugin/src/temporal/activities.ts` — remove local `ArtifactKind`; `ARTIFACT_FILENAME` map keys camelCase
- `plugin/src/temporal/gate-readiness.ts` — derived `GateArtifactKind`
- `plugin/src/storage/store-types.ts` — options-object API; positional deleted
- `plugin/src/storage/store-disk.ts` — options-object impl
- `plugin/src/storage/store-temporal/changes.ts` — options-object impl; signal-fan-out via `Object.entries(artifacts)`; no artifact-content disk writes
- `plugin/src/storage/store-temporal/index.ts` — `ensureChangeWorkflowStarted` hydration
- `plugin/src/storage/json.ts` — `ArtifactPayload` for disk store path
- `plugin/src/tools/change.ts` — `readArtifact` Temporal-first; batched queries; ~15 callsites
- `plugin/src/tools/gate.ts` — acceptance writes via `updateArtifacts`; 2 read sites use `readArtifact`
- `plugin/src/tools/status.ts` — 1 read site uses `readArtifact`
- `plugin/src/storage/context-snapshot-fetch.ts` — 1 read site uses `readArtifact`
- `plugin/src/tools/_recovery-writers.ts:132` — poisoned-history path uses new signal shape
- `plugin/src/utils/archive-summary.ts` + archive activity — bundle materialization reads `state.documents`
- `docs/temporal-recovery.md` — crash-recovery semantics documented

### Tests
- `plugin/src/storage/json.test.ts` (22 sites)
- `plugin/src/storage/store-disk.judgment-calls-removal.test.ts` (2 sites)
- `plugin/src/__tests__/compaction.test.ts` (3 sites)
- `plugin/src/tools/investment.test.ts` (2 sites)
- `plugin/src/storage/store-temporal/changes.test.ts` (fixture shape)
- `plugin/src/temporal/__tests__/alias-wire-mismatch.test.ts` (signal exports)
- `plugin/src/temporal/gate-readiness.test.ts` (AC9 — agreement from documents)
- `plugin/src/utils/archive-summary.test.ts` (AC10 — fallback resolves to documents)
- `plugin/src/tools/gate.test.ts` (acceptance write path)

## Impact

- **Cross-session correctness.** ADV becomes XDG-independent for active-change content. Multiple OpenCode sessions no longer require shared `$XDG_DATA_HOME`.
- **Storage simplification.** Disk artifact files cease being authoritative; transient byproduct (legacy migration) + archive-bundle materialization target.
- **Internal-only API change.** `Store` is not a public plugin API.
- **Workflow history size** grows by `state.documents` (typical <100 KB total per change). Bounded by hard cap (AC14).
- **Recovery-mode preserved.** Poisoned-history exec-summary path and compatibility-reason acceptance path both route via new signal contract.
- **Tool surface unchanged** (C8). No agent-facing change.
- **Consumer alignment.** Two consumers (`gate-readiness.ts`, `archive-summary.ts`) already read `state.documents` correctly — they activate as soon as producers fire signals.

## Risks

- **Workflow history size from large artifacts.** Mitigated by AC14 size invariant.
- **Workflow replay regression.** Mitigated by additive-only signal contract; `workflow-bundle-boundary.test.ts` + `workflows.signal-handlers.test.ts` cover replay.
- **Read latency.** Mitigated by batched `changeStateQuery` (C7) + existing cache layers.
- **Legacy migration window.** Mitigated by deterministic workflow-start hydration (§ 7).
- **Crash mid-batch.** Mitigated by C6 idempotent re-issue + explicit test.
- **Test churn (~30 sites).** Mitigated by incremental migration with full suite per phase.

## Validation Plan

TDD throughout; full suite at each phase.

### Phase 1: Canonical `ArtifactKind`
1. **Red:** test asserts single canonical `ArtifactKind` export. Fails.
2. **Green:** define `ArtifactKind` + `ArtifactPayload` + compile-time lock.
3. Replace local defs; update `ARTIFACT_FILENAME` keys to camelCase.
4. `pnpm run typecheck`.

### Phase 2: Schema + new signals
5. **Red:** integration test asserts `state.documents.executiveSummary` / `state.documents.acceptance` accept content via signal. Fails.
6. **Green:** extend `documents` schema; add 2 signals, 2 reducers, 2 handlers; extend `continueAsNew` + `seedState`. Test passes.

### Phase 3: Options-object API
7-8. **Red/Green:** `Store["changes"].create({summary, options: {artifacts: {proposal: "x"}}})`.
9-10. **Red/Green:** `Store["changes"].updateArtifacts(id, {executiveSummary: "x"})`.

### Phase 4: Temporal-first writes (AC11)
11. **Red:** integration test asserts `updateArtifacts(id, {proposal: "x"})` populates `state.documents.proposal` with zero disk writes. Fails.
12. **Green:** migrate `store-temporal/changes.ts` to fire content signals; remove artifact-content disk-write call. Test passes.

### Phase 5: Read path (AC5)
13. **Red:** AC5 test deletes on-disk change dir between write and `adv_change_show` read. Fails.
14. **Green:** `readArtifact` Temporal-first; batched query; migrate read callsites. Test passes.

### Phase 6: Workflow-start hydration (AC13)
15. **Red:** AC13 test. Fails.
16. **Green:** extend `ensureChangeWorkflowStarted`. Test passes.

### Phase 7: Acceptance convergence
17-18. **Red/Green:** `gate.ts` acceptance write via `updateArtifacts`. Verify `gate-readiness.ts:267` still passes.

### Phase 8: Consumer alignment (AC9, AC10)
19. **Red:** AC9 — `agreementExists` returns true based on `state.documents.agreement` alone, with `state.artifacts.agreement` unset. Fails today (no producer) → passes after Phase 4.
20. **Red:** AC10 — archive summary contains content from `state.documents.problemStatement`. Fails today → passes after Phase 4.

### Phase 9: Cross-session smoke (AC6)
21. **Red/Green:** clean process, empty XDG, content retrievable.

### Phase 10: Archive bundle materialization (AC12)
22-23. **Red/Green:** archive activity reads `state.documents` into bundle; full-lifecycle integration test.

### Phase 11: Size invariant (AC14)
24-25. **Red/Green:** 300 KB artifact rejected.

### Phase 12: Crash-recovery (AC15)
26-27. **Red/Green:** mid-batch signal failure recovers via re-issue. Document semantics in `docs/temporal-recovery.md`.

### Phase 13: Tool surface parity (AC16)
28. **Red/Green:** schema test asserts `adv_change_create` / `adv_change_update` input shape unchanged.

### Phase 14: Production call-site migration
29. Migrate `tools/change.ts:664, 2401, 2674` + read sites. Recovery-mode check at line 2685.

### Phase 15: Test fixture migration
30. Rewrite ~30 test sites. Full suite.

### Phase 16: Sweep + delete (AC17)
31. Grep sweeps return zero.
32. Delete positional signatures.
33. Full suite.

### Phase 17: Build + final invariants
34. `pnpm run check`.
35. `pnpm run build`.
36. AC8 invariant lock final run.

Verification commands:
- `pnpm test` — full suite (≈2900 tests, ~55s)
- `pnpm test -- src/storage/`
- `pnpm test -- src/temporal/`
- `pnpm test -- src/tools/`
- `pnpm run check`
- `pnpm run build`

## Evidence Pointers

- Schema: `plugin/src/temporal/contracts.ts:221-226`
- Signals: `plugin/src/types/signals.ts:27-52`, `plugin/src/temporal/messages.ts:121-132`
- Handlers: `plugin/src/temporal/change-state.ts:172-209`, `plugin/src/temporal/workflows.ts:893-916`
- `continueAsNew` seed: `plugin/src/temporal/workflows.ts:1271`
- `seedState` accept: `plugin/src/temporal/workflows.ts:524`
- Disk-bound write path: `plugin/src/storage/store-temporal/changes.ts:40-58, 473-538`
- Disk-bound read path: `plugin/src/tools/change.ts:81-108` and `loadProposalWithFallback` callsites
- Archive summary fallback chain: `plugin/src/utils/archive-summary.ts:44-47`
- Gate-readiness agreement consumer: `plugin/src/temporal/gate-readiness.ts:91-93`
- Metadata-only signal payload proves no content reaches Temporal today: `plugin/src/temporal/contracts.ts:134-138` (`ArtifactMetadata = { path, updatedAt, contentHash? }`)
- Upstream OpenCode SQLite WAL contention: anomalyco/opencode #21215, #22429, #20935, #24785
