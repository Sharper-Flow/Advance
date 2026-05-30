# Agreement — removePositionalArtifactApi

## Objectives

1. **Make Temporal workflow state the single source of truth for change artifact content.** Disk artifact files become a derived view materialized only when building the archive bundle for git commit.
2. **Replace the 7-arg positional artifact API with a typed `ArtifactPayload`.** Internal store API change; user-facing MCP tool schemas unchanged.
3. **Unify the triple `ArtifactKind` drift** (`temporal/contracts.ts`, `temporal/activities.ts`, `types/gates.ts`) into a single canonical enum in camelCase at type/signal layers.

## Acceptance Criteria

- **AC1 — Source of truth.** For any active change, `state.documents.{kind}` is the authoritative content for that artifact. `adv_change_show` with `include.{kind}: true` returns Temporal-backed content. Verified by tool test that deletes the on-disk change dir between write and read and confirms content still returns.

- **AC2 — Cross-session isolation.** In a clean process with an empty `$XDG_DATA_HOME` and the change workflow live in Temporal, all six artifacts are retrievable. Verified by integration test.

- **AC3 — Typed payload API.** `Store.changes.create()` accepts `options?: { capability?, artifacts?: ArtifactPayload, initialMetadata? }`. `Store.changes.updateArtifacts()` accepts `(changeId, artifacts: ArtifactPayload)`. Positional content parameters removed. Compile-time `keyof ArtifactPayload === ArtifactKind` lock present.

- **AC4 — Unified `ArtifactKind`.** Single canonical definition in `types/artifacts.ts`. Local definitions in `temporal/contracts.ts` and `temporal/activities.ts` deleted. `types/gates.ts GateArtifactKind` derived from canonical source.

- **AC5 — Six-artifact coverage.** `ArtifactPayload`, `ArtifactKind`, `state.documents`, content signals, and reducers all cover `proposal`, `problemStatement`, `agreement`, `design`, `executiveSummary`, `acceptance`. `continueAsNew` seed and `seedState` accept path preserve all six.

- **AC6 — Signal invariant.** For every defined field on `ArtifactPayload`, exactly one content signal fires with matching `kind`. For undefined fields, zero signals fire. Verified by structural test against a recording signal client.

- **AC7 — Consumer alignment activates.** `gate-readiness.ts agreementExists()` (which already reads `state.documents.agreement`) resolves true based on Temporal content alone, with `state.artifacts.agreement` unset. `archive-summary.ts` (which already reads `state.documents.problemStatement ?? proposal`) renders summary from Temporal content. Verified by targeted tests against both consumers.

- **AC8 — No artifact-content disk writes from temporal store production path.** Verified by grep sweep plus a write-recording test fake that asserts zero disk writes from the artifact write path during a normal change lifecycle. `legacy.changes.create` / `updateArtifacts` may still write `change.json` and non-artifact disk state — those are out of scope.

- **AC9 — Workflow-start hydration for legacy changes.** Starting a workflow for a pre-migration change that has disk artifacts but empty `state.documents` populates `state.documents` from disk exactly once via `seedState`. Hydration runs outside any query handler or read tool. Verified by hydration integration test.

- **AC10 — Archive bundle materialization.** Archiving an active change writes all six artifact files into `.adv/archive/{cid}-{ts}/` with content matching `state.documents`. Bundle layout, filenames, and git commit semantics unchanged. Verified by archive integration test.

- **AC11 — Tool surface parity.** `adv_change_create` and `adv_change_update` MCP tool input schemas accept identical user-facing fields (`proposal`, `problemStatement`, `agreement`, `design`, `executiveSummary`). Schema test verifies parity with pre-change shape.

- **AC12 — Full lifecycle integration.** Real Temporal dev server integration test: create → discover → design → prep → execute → accept → archive with all six artifacts populated, content flowing through Temporal signals, landing in the git archive bundle. `pnpm test`, `pnpm run check`, `pnpm run build` all pass.

## Constraints

- **C1 — Scope to artifact markdown.** Do not change `change.json`, subagent reports, `conformance.json`, `agenda.jsonl`, `wisdom.jsonl`, `worktrees.json`, or `roadmap-snapshot.json`. This change is strictly the six artifact markdown files.

- **C2 — Archive bundle format unchanged.** Bundle files must remain readable by existing release/audit tooling. Materializing markdown into the bundle dir at archive time is acceptable; changing layout is not.

- **C3 — Per-artifact size caps** (research-validated against Temporal 2 MB per-payload limit):
  - Soft warn: **64 KB** per artifact
  - Hard reject: **256 KB** per artifact (signal handler rejects with explicit error)

- **C4 — Aggregate `state.documents` size caps** (research-added; protects `continueAsNew` seed against the 2 MB payload ceiling):
  - Soft warn: **~1 MB** total
  - Hard reject: **~1.8 MB** total
  - Implementation MUST NOT embed unbounded content alongside artifacts (no logs, blobs, transcripts in `documents`).

- **C5 — Deterministic signal ordering.** Within a single `updateArtifacts` call, signals fire in fixed order: proposal → problemStatement → agreement → design → executiveSummary → acceptance. **Tool layer MUST `await` each signal acknowledgement before firing the next** (research-clarified — no `Promise.all`). The corresponding `updateArtifactMetadataSignal` for each kind fires AFTER its content signal so `state.artifacts.{kind}.contentHash` consistently reflects `state.documents.{kind}`.

- **C6 — Backward compatibility for in-flight changes.** Pre-migration changes have content on disk and empty `state.documents`. Workflow-start hydration (AC9) covers them. No breaking change to existing in-flight workflows.

- **C7 — Replay safety.** Additive optional `state.documents` fields and additive signal handlers are replay-safe per Temporal's safe-deployments contract — verified by research. No history poisoning risk. Explicit replay test asserts existing histories without `executiveSummary` / `acceptance` events replay cleanly.

- **C8 — Crash-recovery semantics** (P1.4 evolution):
  - Workflow-start failure → disk scaffold (`change.json`) rolled back, original error re-thrown. Unchanged.
  - Mid-batch content-signal failure → workflow state partially populated with already-applied signals; recoverable via re-issuing `updateArtifacts` with the same payload (signals are idempotent state-replacement).
  - Mid-batch recovery: re-fire failed signal + all subsequent signals.
  - Documented in `docs/temporal-recovery.md` with covering test.

- **C9 — Read latency.** Each `adv_change_show include: { ... }` call requesting content issues **one batched `changeStateQuery`**, not one per kind. Reuse existing `getTemporalChange` / `changeCache` snapshot layers.

- **C10 — Tool surface unchanged.** `adv_change_create` and `adv_change_update` schemas continue to accept identical user-facing fields. `ArtifactPayload` refactor is internal to the store interface.

- **C11 — No new storage abstraction.** Temporal workflow state IS the storage. No content-addressed blob store, no S3 indirection, no separate SQLite. Structural simplicity is the point.

- **C12 — Acceptance recovery path retains disk dependency.** The acceptance gate **recovery** flow (`gate.ts:350-414`, `_recovery-writers.ts`) uses `inspectArtifactActivity` to verify `acceptance.md` and `executive-summary.md` on disk match `state.artifacts.{kind}.contentHash` when the workflow is poisoned and cannot accept signals. This recovery path retains disk writes/reads because Temporal is unavailable by definition in this scenario. **Production write path** is Temporal-first per AC8; **recovery write path** keeps disk fallback. Both must coexist.

- **C13 — Atomic removal.** Positional signature deleted in same change as new options-object signature. Triple `ArtifactKind` local definitions deleted together. No transitional overload.

- **C14 — Worktree isolation (P32).** All implementation runs from the per-change worktree.

- **C15 — Structural correctness (P33).** Size caps enforced as structural validation in signal handlers, not as heuristic checks at write sites.

## Avoidances (Out of Scope)

- **A1 — Subagent report storage.** Different scoping (multiple reports per change, per-task). Separate ticket.
- **A2 — Project-level state migration.** `conformance.json`, `agenda.jsonl`, `wisdom.jsonl`, `worktrees.json`, `roadmap-snapshot.json` remain disk-bound. Different ownership model.
- **A3 — Stale-file cleanup.** Post-migration orphaned disk markdown files. Separate sweep task.
- **A4 — Removing `legacy.changes.create` / `updateArtifacts` entirely.** They still own non-artifact disk scaffolding (`change.json`, directory creation). They lose artifact-content responsibility only.
- **A5 — Per-session XDG wrapper script.** Adjacent motivating need; not part of this delivery.
- **A6 — Workflow retention / archive workflow restart** for reading documents from completed workflows. Bundle-in-git is the durable record.
- **A7 — Batching all 6 content signals into a single signal.** Six separate signals preserve the existing pattern (one signal type per artifact kind), keep individual payloads well below the 2 MB cap, and match the existing reducer architecture.
- **A8 — Migrating the acceptance recovery path.** Per C12, the poisoned-workflow recovery path retains disk dependency by design.

## Validation Strategy

TDD throughout; consumers light up automatically once producers fire (validated finding from `gate-readiness.ts:91-93` and `archive-summary.ts:44-47`).

Verification:

- `pnpm test` — full suite (≈2900 tests)
- `pnpm test -- src/storage/` — storage layer + signal invariant
- `pnpm test -- src/temporal/` — replay safety + size caps + crash-recovery
- `pnpm test -- src/tools/` — read/write integration
- `pnpm run check` — typecheck + lint + format
- `pnpm run build` — webpack worker bundle composes
- Integration: real Temporal dev server full-lifecycle test

## Research Provenance

Temporal SDK + history limits validated by `adv-researcher` report (May 28, 2026):

- Per-payload cap: 2 MB (Cloud non-configurable; self-hosted default 2 MB) — https://docs.temporal.io/cloud/limits
- History hard limits: 51,200 events / 50 MB / 10,000 signals — https://docs.temporal.io/workflow-execution/event
- Temporal staff recommended target: <10K events AND <10 MB (community thread)
- `continueAsNew` seed itself subject to 2 MB payload cap (drives C4 aggregate caps)
- TS SDK preserves server-acceptance order within activation; no `Promise.all` (drives C5 sequential-await requirement)
- Additive optional state fields + additive signal handlers are replay-safe per Temporal safe-deployments — https://docs.temporal.io/develop/safe-deployments
- Default retention: self-hosted 1 day, Cloud up to 90 days; history deleted after TTL (drives A6 / bundle-in-git durability)
- ADV's existing `DEFAULT_CHANGE_HISTORY_THRESHOLD = 5,000` matches docs canonical pattern — no change to history-rollover threshold needed

Report ID: `removePositionalArtifactApi|change:researcher:temporal-signal-payload-history-limits|adv-researcher|1`
