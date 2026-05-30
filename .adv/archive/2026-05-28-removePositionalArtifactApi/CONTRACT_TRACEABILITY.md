# Contract Traceability

**Change ID:** removePositionalArtifactApi
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-05-28T06:35:30.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | readArtifact Temporal-first (tools/change.read-artifact.test.ts: 'returns content from Temporal even when disk has been deleted'). Verified by deleting disk file mid-test. |
| AC2 | acceptance_criterion | pass | test | change.read-artifact.test.ts XDG-independence smoke + storage/temporal-source-of-truth.test.ts consumer alignment integration. |
| AC3 | acceptance_criterion | pass | test | store-types.test.ts options-object compile-time anchors. Positional signature deleted in T20 (commit 42deeb5). Grep sweep returns zero positional callers. |
| AC4 | acceptance_criterion | pass | test | types/artifacts.test.ts canonical kind exports + 17 invariant tests. types/gates.ts compile-time _gateArtifactKindCheck lock. Local definitions in temporal/contracts.ts and temporal/activities.ts deleted (commit a97d247). |
| AC5 | acceptance_criterion | pass | test | ArtifactKindSchema enumerates 6 kinds (types/artifacts.ts:23-30). ChangeWorkflowState.documents extended to 6 fields. workflows.signal-handlers.test.ts populates all 6 via signals. continueAsNew preserves state.documents (workflows.ts:1271). |
| AC6 | acceptance_criterion | pass | test | storage/artifact-payload-signal-invariant.test.ts — 6 tests verify exactly-one-signal-per-defined-field + zero-for-undefined + canonical ordering. |
| AC7 | acceptance_criterion | pass | test | storage/temporal-source-of-truth.test.ts — 4 tests verify renderBriefSummary fallback chain consumes state.documents.problemStatement → proposal → title. |
| AC8 | acceptance_criterion | pass | test | storage/store-temporal/no-disk-writes-invariant.test.ts — 3 structural tests inspect source code to verify no artifact-content disk writes from temporal store production path. |
| AC9 | acceptance_criterion | pass | test | storage/store-temporal/hydrate-documents.test.ts — 6 tests verify cold-start hydration with partial-write robustness + idempotency. |
| AC10 | acceptance_criterion | pass | test | temporal/activities.test.ts materializeBundleArtifactsActivity — 4 tests verify bundle file writes match state.documents content and kebab-case filenames. |
| AC11 | acceptance_criterion | pass | test | adv_change_create + adv_change_update MCP tool input schemas unchanged in tools/change.ts. Internal Store interface change only; tool surface schemas identical. |
| AC12 | acceptance_criterion | pass | test | AC12 lifecycle coverage achieved via composition: workflows.signal-handlers.test.ts + e2e-tool-calls.itest.ts + change.read-artifact.test.ts + activities.test.ts + change-state.crash-recovery.test.ts + change-state.size-guard.test.ts. Full suite: 245 files / 3322 tests pass. |
| C1 | constraint | respected | static_check | This change touched only artifact markdown surfaces. change.json, subagent reports, conformance.json, agenda.jsonl, wisdom.jsonl, worktrees.json, and roadmap-snapshot.json unchanged. |
| C2 | constraint | respected | static_check | materializeBundleArtifactsActivity writes to bundle dir using existing ARTIFACT_FILENAME map. Bundle layout, filenames, and git commit semantics unchanged. |
| C3 | constraint | respected | static_check | types/artifacts.ts ARTIFACT_HARD_CAP=256KB / ARTIFACT_SOFT_CAP=64KB. Layer 1 + Layer 2 enforcement via change-state.size-guard.test.ts (12 tests pass). |
| C4 | constraint | respected | static_check | AGGREGATE_HARD_CAP=1.8MB / AGGREGATE_SOFT_CAP=1MB. change-state.size-guard.test.ts 'rejects content that would push aggregate over hard cap' verifies projection logic. |
| C5 | constraint | respected | static_check | store-temporal/changes.ts ARTIFACT_SIGNAL_ORDER constant + fireContentSignalsSequentially uses sequential for-await loop (no Promise.all). artifact-payload-signal-invariant.test.ts verifies canonical order. |
| C6 | constraint | respected | static_check | hydrate-documents.test.ts verifies pre-migration changes hydrate from disk on workflow cold-start without breaking changes. |
| C7 | constraint | respected | static_check | Additive optional fields in state.documents schema (Temporal replay-safe per safe-deployments). workflow-bundle-boundary.test.ts passes. Researcher validation confirmed. |
| C8 | constraint | respected | static_check | change-state.crash-recovery.test.ts — 4 tests verify idempotent state-replacement: double-apply produces identical state, mid-batch failure recoverable via re-issue. docs/temporal-recovery.md updated. |
| C9 | constraint | respected | static_check | readArtifacts in tools/change.ts uses single store.changes.get() call; change.read-artifact.test.ts 'issues exactly ONE store.changes.get() call regardless of kinds count' verifies. |
| C10 | constraint | respected | static_check | adv_change_create + adv_change_update MCP tool input schemas unchanged. Internal Store interface change only (AC11 evidence). |
| C11 | constraint | respected | static_check | No new storage abstraction introduced. Temporal workflow state.documents IS the storage. No blob store, no S3 indirection, no separate SQLite. |
| C12 | constraint | respected | static_check | gate.ts:344-414 recovery path retains writeArtifactActivity disk writes. Production path (workflows.ts:780) populates state.documents in addition. Both coexist per design. |
| C13 | constraint | respected | static_check | Positional Store interface signatures deleted in T20 (commit 42deeb5). store-types.ts shows only options-object API. Grep sweep returns zero positional callers. |
| C14 | constraint | respected | static_check | All 22 task commits made from /home/jon/.local/share/opencode/worktree/.../change/removePositionalArtifactApi worktree. |
| C15 | constraint | respected | static_check | Layer 2 size-guard in signal handlers uses state-mutation rejection (NOT throw) — change-state.size-guard.test.ts asserts rejection never throws and workflow continues. |
| C16 | constraint | not_applicable | static_check | Subagent report storage — explicit OOS in agreement. |
| C17 | constraint | not_applicable | static_check | Project-level state migration — explicit OOS in agreement. |
| C18 | constraint | not_applicable | static_check | Stale-file cleanup for migrated changes — explicit OOS in agreement. |
| C19 | constraint | not_applicable | static_check | Removing legacy.changes.* entirely — explicit OOS in agreement; non-artifact disk scaffolding remains. |
| C20 | constraint | not_applicable | static_check | Per-session XDG wrapper script — explicit OOS in agreement. |
| C21 | constraint | not_applicable | static_check | Workflow retention / archive workflow restart — explicit OOS in agreement. |
| C22 | constraint | not_applicable | static_check | Batching all 6 content signals into one — explicit OOS in agreement (6 separate signals match existing pattern). |
| C23 | constraint | not_applicable | static_check | Migrating acceptance recovery path — explicit OOS in agreement (C12 preserves disk dependency by design). |
| C24 | constraint | respected | static_check | Catch-all constraint compliance verified by full suite passing + grep sweeps + structural invariant tests. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-2a6b3e43dd93 | AC1, AC4, AC5 |  | C15 |  |
| tk-5476a6f2d870 | AC4 |  | C13 |  |
| tk-e5187f7c4046 | AC5 | C7 | C7 |  |
| tk-675e7724ff8e | AC3 |  | C10, C13 |  |
| tk-4297ed707270 | AC3, AC5 |  | C7 |  |
| tk-b85811e70f30 | AC3 |  | C10 |  |
| tk-8c20df43fe72 | AC6 | C5 | C3, C4, C5 |  |
| tk-159c3bc15ff6 |  | C3, C4 | C3, C4, C15 |  |
| tk-b68ceee065ba | AC1, AC2 | C9 | C9 |  |
| tk-a9950d284d5a | AC1 |  | C9 |  |
| tk-4cb55b43952e | AC9 | C6 | C6, C7 |  |
| tk-2b66bb0495ab | AC5 |  | C12 |  |
| tk-260ebc52e38a | AC10 | C2 | C2 |  |
| tk-3c6bfd0128d9 |  | C8 | C8, C12 |  |
| tk-da2984c57d8c | AC8 | C1 | C1 |  |
| tk-853777da9ee6 | AC2, AC7 |  |  |  |
| tk-7ebb94f6e36e | AC11 | C10 | C10 |  |
| tk-3a2d1fd3a76e |  |  | C13 | Mechanical test fixture migration — no production behavior change; verifies via existing test semantics |
| tk-97e6660aa7b4 | AC6 | C5, C7 | C5, C7 |  |
| tk-b0deb8594baa | AC3 | C13 | C13 |  |
| tk-1c7601764edc | AC12 |  |  |  |
| tk-0fd90720818e |  | C1, C2, C3, C4, C5, C6, C7, C8, C9, C10, C12, C13, C15 |  | Verification-only task; no logic-bearing change. Confirms structural invariants pass after all implementation tasks land. |
