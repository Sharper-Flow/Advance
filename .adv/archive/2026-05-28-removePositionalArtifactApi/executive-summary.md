# Executive Summary — removePositionalArtifactApi

## Outcome

Three intertwined architectural problems resolved in a single coherent migration:

1. **Positional artifact API removed.** `Store.changes.create()` and `Store.changes.updateArtifacts()` now use a typed options-object API (`ArtifactPayload`). Zero positional callers remain in the codebase (verified by grep sweep).
2. **`ArtifactKind` unified.** Single canonical definition in `types/artifacts.ts` with compile-time invariant lock (`keyof ArtifactPayload === ArtifactKind`). Local definitions in `temporal/contracts.ts` and `temporal/activities.ts` deleted.
3. **Temporal `state.documents` is now the source of truth for artifact content.** Production write path fires content signals; production read path queries Temporal first with archive-bundle fallback. Disk artifact files become a derived view materialized only when building the archive bundle for git commit.

## What Was Built

### Type taxonomy (new canonical layer)
- `plugin/src/types/artifacts.ts` — `ArtifactKindSchema` (6 kinds), `ArtifactPayload`, size caps (per-artifact 64K/256K soft/hard; aggregate 1MB/1.8MB protecting continueAsNew seed).
- Compile-time `_check: _PayloadKeysMatchArtifactKind = true` lock ensures payload keys and kind union stay aligned.

### Workflow state extension
- `ChangeWorkflowState.documents` extended from 4 → 6 fields (`executiveSummary` + `acceptance` added).
- Additive optional fields — Temporal replay-safe per safe-deployments contract.

### Two new content signals
- `executiveSummaryUpdatedSignal` + `acceptanceUpdatedSignal` with reducers and handlers.
- `continueAsNew` seed and `seedState` accept path extended to preserve all 6 fields.

### Store interface (options-object API)
- `Store["changes"].create(summary, options?: { capability?, artifacts?, initialMetadata? })`
- `Store["changes"].updateArtifacts(changeId, artifacts: ArtifactPayload)`
- Positional 7-arg signatures **atomically deleted**.

### Temporal-first write path
- `ARTIFACT_SIGNAL_ORDER` constant in `store-temporal/changes.ts` (deterministic 6-element ordering).
- `fireContentSignalsSequentially` — sequential `await` fan-out (C5; no `Promise.all` per Temporal TS SDK ordering semantics).
- Layer 1 size validation (tool-layer pre-check) + Layer 2 state-mutation rejection (signal handlers never throw — per Temporal docs throwing fails workflow; canonical ADV pattern `applyGateStuckToState` at `workflows.ts:722` adopted).
- **No artifact-content disk writes** from temporal store production path (AC8 verified by structural invariant test).

### Read path (Temporal-first)
- `readArtifact(store, changeId, kind)` — Temporal → disk → archive bundle.
- `readArtifacts(store, changeId, kinds[])` — single batched query (C9).
- 15 callsites migrated; `loadProposalWithFallback` and `readArtifactWithArchiveFallback` deprecated/removed.

### Workflow-start hydration (legacy backward compat)
- `readDiskArtifactsForHydration` — reads disk artifacts and seeds `state.documents` on cold-start workflow.
- Skips empty/truncated files (partial-write robustness).
- Runs outside any query handler (KD-5).

### Archive bundle materialization
- `materializeBundleArtifactsActivity` — reads `state.documents` and writes 6 markdown files to `.adv/archive/{cid}-{ts}/`.
- The ONE production point where artifact content touches disk.
- Bundle layout, filenames, and git commit semantics unchanged (C2).

### Crash recovery
- Content signals are idempotent state-replacement (not delta).
- Mid-batch failure recoverable via re-issue of full payload.
- Documented in `docs/temporal-recovery.md § Mid-batch content-signal failure recovery`.

## Acceptance Criteria Coverage

| AC | Status | Evidence |
|---|---|---|
| AC1 — Source of truth | ✓ | `readArtifact` Temporal-first; tests verify deleting disk between write and read still returns content |
| AC2 — Cross-session isolation | ✓ | `change.read-artifact.test.ts` XDG-independence smoke + `temporal-source-of-truth.test.ts` |
| AC3 — Typed payload API | ✓ | Options-object signatures locked in `Store` interface; positional deleted (T20); grep returns zero positional callers |
| AC4 — Unified `ArtifactKind` | ✓ | Single canonical in `types/artifacts.ts`; local definitions deleted; compile-time lock |
| AC5 — Six-artifact coverage | ✓ | `ArtifactPayload` + `state.documents` + signals + reducers all cover 6 kinds |
| AC6 — Signal invariant | ✓ | `artifact-payload-signal-invariant.test.ts` — 6 tests verifying defined→one-signal, undefined→zero-signals, deterministic order |
| AC7 — Consumer alignment | ✓ | `gate-readiness agreementExists` and `archive-summary renderBriefSummary` activate automatically with Temporal-backed content |
| AC8 — No disk writes | ✓ | `no-disk-writes-invariant.test.ts` structural assertion against source |
| AC9 — Workflow-start hydration | ✓ | `hydrate-documents.test.ts` — 6 tests covering partial coverage, truncated files, idempotency |
| AC10 — Archive bundle materialization | ✓ | `materializeBundleArtifactsActivity` + 4 tests |
| AC11 — Tool surface parity | ✓ | `adv_change_create` / `adv_change_update` MCP schemas unchanged; internal store API change only |
| AC12 — Full lifecycle | ✓ | Composition of existing integration tests (signal-handlers + e2e-tool-calls + read-artifact + archive activity + crash-recovery + size-guard) |

## Verification

- **`pnpm run check`** — typecheck + eslint + prettier all pass clean
- **`pnpm run build`** — Temporal workflow bundle composes (`workflows.js` 63.24 KB)
- **Full test suite** — 245 test files / 3322 tests pass
- **Grep sweep** — zero positional callers remain (`changes.create(arg, arg, arg, arg, ...)` and `updateArtifacts(arg, arg, arg, ...)` return empty)
- **Workflow bundle boundary** — `workflow-bundle-boundary.test.ts` passes (no forbidden imports from workflow code)

## Impact

- **Cross-session correctness.** ADV is now XDG-independent for active-change artifact content. Multiple OpenCode sessions in different worktrees no longer require shared `$XDG_DATA_HOME` for artifact visibility.
- **Tool surface unchanged.** No agent-facing change. `adv_change_create` and `adv_change_update` accept identical user-facing fields.
- **Workflow history bounded.** Per-artifact 256 KB hard cap × 6 = max 1.5 MB; aggregate cap 1.8 MB protects continueAsNew seed against the Temporal 2 MB payload ceiling.
- **Recovery preserved.** Poisoned-history acceptance recovery path (C12) retains disk dependency by design — Temporal-first production path coexists with disk-fallback recovery path.

## Notable Design Decisions

- **KD-8 Layer 2 state-mutation rejection** (not `throw`): rewritten after researcher validator caught the Temporal docs requirement — throwing in signal handlers fails the entire workflow. Adopted ADV's canonical pattern from `applyGateStuckToState`.
- **KD-3 explicit ordered array** for signal fan-out (not Object.entries): determinism is structural, not emergent from JS engine behavior.
- **KD-5 workflow-start hydration** (not lazy first-read): query handlers stay pure; hydration is deterministic and idempotent.
- **KD-13 single archive activity** reads `state.documents` at bundle time — the ONE production disk-write site for artifact content.

## Out of Scope (deferred to follow-up changes)

- Subagent report storage migration (different ownership model)
- `conformance.json`, `agenda.jsonl`, `wisdom.jsonl`, `worktrees.json`, `roadmap-snapshot.json` project-level state (different scoping)
- Stale-file cleanup of orphaned disk markdown for migrated changes (separate sweep task)
- Per-session XDG wrapper script for OpenCode launches (adjacent motivating need; not part of this delivery)

## Research Provenance

Temporal SDK + history limits validated by `adv-researcher` design-validation report (May 28, 2026): per-payload 2 MB cap, history 51,200 events / 50 MB / 10,000 signals; additive optional state fields + additive signal handlers replay-safe per safe-deployments; TS SDK preserves server-acceptance order within an activation. Report IDs:
- `removePositionalArtifactApi|change:researcher:temporal-signal-payload-history-limits|adv-researcher|1`
- `removePositionalArtifactApi|change:researcher:design-validation|adv-researcher|1`
