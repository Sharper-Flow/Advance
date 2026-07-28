# Archive Briefing Digest

**Change ID:** finishDiskFirstActiveReads
**Title:** Finish disk-first active reads
**Status:** archived
**Generated:** 2026-07-28T00:01:33.892Z

## Identity Anchors

- CHANGE
- STATUS
- TERMINAL_GATE_SUMMARY
- Origin: triage

## Archive Digest

**Status:** archived

| Gate | Status |
| --- | --- |
| proposal | done |
| discovery | done |
| design | done |
| planning | done |
| execution | done |
| acceptance | done |
| release | pending |

## Epic Context

No Epic membership

## Durable Facts

Showing 100 of 159 durable facts (59 omitted).

- **[archive_only_evidence]** decisions: Recorded operation conflicts in the existing bounded signal_rejection channel instead of overwriting the accepted operation_ledger entry — Preserves stable idempotency for later retries of the accepted payload.
- **[archive_only_evidence]** decisions: Computed payload_hash from behavior-changing content only — Retry metadata must not create false payload conflicts.
- **[archive_only_evidence]** decisions: Initialized and preserved state_revision and operation_ledger — Deterministic baseline and Continue-As-New continuity.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/temporal/change-state.operation-ledger.test.ts (0) — 7/7 operation-ledger tests pass
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/temporal/mutation-receipt.test.ts src/temporal/change-state.size-guard.test.ts src/temporal/change-state.crash-recovery.test.ts src/temporal/change-state.ops-follow-up.test.ts (0) — 45/45 nearby reducer tests pass
- **[archive_only_evidence]** verification: pnpm run typecheck && pnpm run lint && pnpm run schemas:check && pnpm run format:check (0) — typecheck, lint, schemas:check, format:check all green
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: oc-test-targeted-operation-ledger
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: oc-test-targeted-reducer-nearby
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: plugin-checks
- **[archive_only_evidence]** decisions: Preserve accepted operation ledger entry on conflicting payload — Later original-payload retry must remain idempotently recoverable; conflict is recorded in bounded signal rejection state.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/temporal/change-state.operation-ledger.test.ts --project unit (0) — 7/7 operation-ledger tests pass after conflict-preservation correction
- **[archive_only_evidence]** verification: pnpm exec vitest run src/temporal/mutation-receipt.test.ts src/temporal/change-state.size-guard.test.ts src/temporal/change-state.crash-recovery.test.ts src/temporal/change-state.ops-follow-up.test.ts --project unit (0) — 45/45 adjacent reducer tests pass
- **[archive_only_evidence]** decisions: Store extends separate ReadStore and CommandStore interfaces — Creates a migration seam without a flag-day implementation rewrite.
- **[archive_only_evidence]** decisions: Moved spec filesystem helpers into neutral storage module while retaining Temporal activity wrappers — Physical Temporal-free boundary with compatibility.
- **[archive_only_evidence]** decisions: Added read-model/diagnostic Tier-4 classifications without full runtime migration — This task establishes types/classification; later tasks own behavior routing.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/storage/store-types.read-store-boundary.test.ts src/storage/temporal-free-filesystem-readers.test.ts src/mcp-server/tools/read-model-tier4-classification.test.ts src/tool-catalog-purity.test.ts (0) — 13/13 structural boundary tests pass
- **[archive_only_evidence]** verification: pnpm run check (0) — schemas, typecheck, manifests, isolation, lockfile, lint, format all pass
- **[report_follow_up]** follow_ups: GREEN phase will implement the actual idempotency/conflict/regression checks and readback proof; coordinator may then need explicit handling for operation_conflict/state_regression/state_revision_conflict instead of the default operator_required.
- **[report_follow_up]** follow_ups: Next task owns per-change summary shards; readback proof will later need to cover snapshot + shard + pointer.
- **[archive_only_evidence]** decisions: Added optional operationId/payloadHash/stateRevision options and new failure outcome kinds to commitChangeProjection types, but kept the successful idempotent result as a flag on the existing committed outcome. — Minimizes downstream changes in the coordinator/dual-write paths while still expressing the approved shape; a separate idempotent kind could be introduced later if the design prefers.
- **[archive_only_evidence]** decisions: Added default case to mapCommitOutcome for the new failure kinds. — Prevents TypeScript non-exhaustive switch errors during the RED phase without implementing GREEN mapping semantics.
- **[archive_only_evidence]** decisions: Added operation_id/payload_hash/state_revision to ProjectionCommitAuditEntrySchema and state_revision to ChangeSchema, then regenerated JSON schemas. — The readback proof must store and validate these fields; schema changes are required for the generated artifacts to stay in sync.
- **[archive_only_evidence]** decisions: Left per-change summary shards untouched. — Task boundary explicitly excludes them; they are owned by the next task.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/storage/change-projection-transaction.test.ts (1) — 16/22 existing tests pass; 6 new RED tests fail as expected (idempotent replay, operation_conflict, state_regression, state_revision_conflict, readback proof of operation identity, readback identity failure). pnpm run check (schemas/typecheck/lint/format) passes.
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: run-tk-5fa3d9082674-red-oc-test
- **[archive_only_evidence]** decisions: Fence projection commits with operation identity, payload hash, and state revision — Prevents duplicate increments, payload conflicts, and stale snapshot regression.
- **[archive_only_evidence]** decisions: Preserve state_revision and operation_ledger in explicit Continue-As-New seed mapping — Generic integration invariant exposed omission; command idempotency must survive run rotation.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/storage/change-projection-transaction.test.ts (0) — 22/22 projection transaction tests pass
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/temporal/workflows.signal-handlers.itest.ts (0) — 32/32 signal-handler integration tests pass; revision/ledger preserved through Continue-As-New
- **[archive_only_evidence]** verification: pnpm run check (0) — schemas, typecheck, manifests, isolation, lockfile, lint, format pass
- **[report_follow_up]** follow_ups: GREEN: implement reducer authorization in closeChangeInChangeState (archived/closed/ineligible rejection, operation-ledger, state_revision, idempotency, approval validation).
- **[report_follow_up]** follow_ups: GREEN: reorder changes.close to persist disk projection only after signal acknowledgement + readback confirmation.
- **[report_follow_up]** follow_ups: Subsequent batch task: replace closeBatch prevalidation-only rejection with reducer-driven authorization per change.
- **[archive_only_evidence]** decisions: Added optional operation_id to ChangeClosure schema as minimal type scaffolding so close signals can carry operation identity. — Required by AC3/AC5 operation-ledger tests without altering reducer behavior; keeps existing callers valid because optional.
- **[archive_only_evidence]** decisions: Wrote RED-only failing tests for reducer and storage close paths before production changes. — Task phase is RED; tests prove the authorized-transition defects described in the prompt and AC5.
- **[archive_only_evidence]** verification: ./bin/oc-test targeted -- src/temporal/change-state.close-reducer.test.ts src/storage/store-temporal/changes.close-storage.test.ts (1) — 12 tests, 10 expected RED failures proving reducer/storage defects, 2 passing coverage/characterization tests; typecheck clean; related regression suite 64 tests pass.
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: red-tk-ac77fd41d2d4-a1
- **[report_follow_up]** follow_ups: Batch coordinator task: replace closeBatch prevalidation-only rejection with per-change reducer-driven authorization while preserving fail-fast semantics.
- **[archive_only_evidence]** decisions: Made closeChangeInChangeState the sole authority for lifecycle eligibility (draft/open only) and added operation-ledger/idempotency handling. — AC5 requires reducer authorization; host preflight is now advisory UX only.
- **[archive_only_evidence]** decisions: Moved the disk projection write in changes.close to after signal acknowledgement + readback confirmation, using persistStateToDiskDurable. — AC2/AC5: success cannot outrun durable projection; pre-signal disk write was the RED defect.
- **[archive_only_evidence]** decisions: Conditioned the close search-attribute upsert on reducer acceptance. — Prevents rejected closes from advertising a terminal status.
- **[archive_only_evidence]** decisions: Added optional operation_id to ChangeClosure and regenerated JSON schemas. — Lets close signals carry stable identity for idempotency without breaking existing callers.
- **[archive_only_evidence]** verification: ./bin/oc-test targeted -- src/temporal/change-state.close-reducer.test.ts src/temporal/change-state.operation-ledger.test.ts src/storage/store-temporal/changes.close-storage.test.ts src/storage/store-temporal/changes.test.ts src/storage/store-temporal/__tests__/signal-integration.itest.ts (0) — 54 tests pass (RED suite now green, signal-handler integration, operation ledger, changes close/bulk).
- **[archive_only_evidence]** verification: pnpm run check (0) — schemas:check, typecheck, manifests:check, test-isolation, lockfile, lint, and format:check all clean.
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: green-tk-ac77fd41d2d4-a2
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: green-tk-ac77fd41d2d4-a2-check
- **[report_follow_up]** follow_ups: Implement commitChangeProjectionWithSummary, readCurrentSummaryShard, rebuildSummaryIndex, listSummaryChanges, and collectObsoleteSummaryShards in GREEN phase
- **[archive_only_evidence]** decisions: Defined per-change summary shard schemas and stub functions in a new storage module — Required so RED tests compile against the approved architecture without implementing behavior
- **[archive_only_evidence]** decisions: Kept production changes to schema/type scaffolding only — PHASE: RED ONLY — no implementation, only failing tests and minimal compile-time surface
- **[archive_only_evidence]** decisions: Used existing temp-dir patterns and commitChangeProjection transaction shape — Matches project conventions and keeps tests isolated from external ADV state
- **[archive_only_evidence]** verification: ../bin/oc-test targeted -- src/storage/change-summary-shard.test.ts (1) — RED phase: 12 tests fail against stubs, 1 passes (GC refuses unsafe when pointer inconsistent)
- **[archive_only_evidence]** verification: pnpm run typecheck (0) — TypeScript --noEmit passes with new scaffold and tests
- **[archive_only_evidence]** verification: pnpm run lint src/storage/change-summary-shard.ts src/storage/change-summary-shard.test.ts && pnpm run format:check src/storage/change-summary-shard.ts src/storage/change-summary-shard.test.ts (0) — ESLint and Prettier checks pass for new files
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: oc-test-summary-shard-red-1
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: typecheck-summary-shard-red-1
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: lint-format-summary-shard-red-1
- **[report_follow_up]** follow_ups: Wire command success paths to use commitChangeProjectionWithSummary so every accepted mutation publishes a durable summary shard
- **[archive_only_evidence]** decisions: Added new test file to the saveChange allow-list — Test fixtures seed raw change.json via saveChange; production writes still route through commitChangeProjectionWithSummary
- **[archive_only_evidence]** decisions: Validated degraded states before requiring a full snapshot for malformed/missing shards — Reader must surface pointer/shard corruption as typed degraded index state even when the snapshot is temporarily unreachable
- **[archive_only_evidence]** verification: pnpm run check (0) — schemas:check, typecheck, manifests:check, test-isolation, lockfile, lint, format:check all green
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: pnpm-check-summary-shard-green-1
- **[archive_only_evidence]** decisions: Use immutable per-change revision shards and atomic per-change current pointer — Avoids shared-manifest cross-change lost updates.
- **[archive_only_evidence]** decisions: Publish snapshot before pointer and require readback proof — Crash can leave summary stale/missing but never ahead of full truth.
- **[archive_only_evidence]** decisions: Rebuild solely from full snapshots — Read-model repair must remain independent of Temporal workflows.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/storage/change-summary-shard.test.ts src/storage/change-projection-transaction.test.ts src/storage/launcher-projection.test.ts (0) — 47 summary/projection/launcher tests pass
- **[archive_only_evidence]** verification: pnpm run check (0) — schemas, typecheck, manifests, isolation, lockfile, lint, format pass
- **[archive_only_evidence]** decisions: Added batch-close signal/reducer types and reservation field as minimal Temporal contract scaffolding — Required for RED tests to compile without implementing GREEN reducer/coordinator logic
- **[archive_only_evidence]** decisions: Introduced a dedicated batch-close-coordinator module with a pure coordinator interface — Keeps fail-all saga logic testable without a running Temporal server and isolates it from the existing closeBatch implementation
- **[archive_only_evidence]** decisions: Kept single-close reducer behavior unchanged — Task scope is batch coordinator; GREEN will extend closeChangeInChangeState to honor active reservations
- **[archive_only_evidence]** decisions: Used unit-only tests; no integration tests added — Prompt requested pure coordinator/reducer tests first and bounded integration only if necessary
- **[archive_only_evidence]** verification: ./bin/oc-test targeted -- src/temporal/change-state.batch-close.test.ts src/storage/store-temporal/batch-close-coordinator.test.ts (1) — 21/21 new RED tests fail as expected against unimplemented prepare/commit/abort stubs
- **[archive_only_evidence]** verification: ./bin/oc-test targeted -- src/temporal/change-state.close-reducer.test.ts src/temporal/change-state.operation-ledger.test.ts src/storage/store-temporal/changes.close-storage.test.ts src/storage/store-temporal/changes.test.ts (0) — 44/44 adjacent close/reducer/operation-ledger tests pass; no regressions
- **[archive_only_evidence]** verification: pnpm run typecheck (0) — TypeScript compiles with new batch-close type scaffolding
- **[archive_only_evidence]** verification: pnpm run lint && pnpm run format:check (0) — ESLint and Prettier pass
- **[archive_only_evidence]** verification: pnpm run schemas:check (0) — JSON schemas remain in sync
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: red-tk-ccfe650451fa-a1-oc-test
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: verify-tk-ccfe650451fa-a1-adjacent
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: verify-tk-ccfe650451fa-a1-typecheck
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: verify-tk-ccfe650451fa-a1-lint-format
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: verify-tk-ccfe650451fa-a1-schemas
- **[report_follow_up]** follow_ups: Wire coordinateBatchClose into storage changes.closeBatch while preserving the existing bulk-close selector validation and fail-all behavior.
- **[archive_only_evidence]** decisions: Preserved storage changes.closeBatch unchanged — Task scope is the reducer/coordinator core; integration wiring is a scoped follow-on once core is green
- **[archive_only_evidence]** decisions: Added batch_close_reservations to continue-as-new seed state — Survives workflow rotation so a resumed coordinator can still commit/abort reservations
- **[archive_only_evidence]** decisions: Added authoritative Zod schemas for BatchCloseOperation, target records, phases, and overall states — Makes durable operation-record validation structural and lets load-time corruption surface as a typed repair_required instead of being mistaken for a missing/new operation
- **[archive_only_evidence]** decisions: Validated the operation record on load with BatchCloseOperationSchema.safeParse and return a corrupt marker from loadBatchCloseOperation — Separates unreadable/malformed records from missing records so closeBatch can return a typed BulkCloseResult schema error without creating a new operation
- **[archive_only_evidence]** decisions: Wrapped each closeBatch invocation in a per-record-path acquireFileLock — Provides cross-process serialization for concurrent retries of the same stable batch_id, preventing one invocation from overwriting per-target progress or regressing overall_state
- **[archive_only_evidence]** decisions: Preloaded the already-validated operation record into the coordinator to avoid a double read while holding the lock — The lock guarantees no concurrent writer between validation and coordinator load, so we can safely pass the validated record to coordinateBatchClose
- **[archive_only_evidence]** decisions: Canonicalized target IDs (sort + dedupe) before batch-id hash and coordinator input — Equivalent selector orders reuse the same batch ID, and duplicate IDs cannot create duplicate per-target phases
- **[archive_only_evidence]** decisions: Switched batch-id hash input to stableStringify(closure) — Hashes are deterministic regardless of key insertion order, preserving approval evidence exactly
- **[archive_only_evidence]** decisions: Updated listChangeDirs to ignore hidden directories — The .batch-operations durable record directory must not be enumerated as a change candidate
- **[archive_only_evidence]** verification: ./bin/oc-test targeted -- src/storage/store-temporal/changes.close-storage.test.ts src/storage/store-temporal/batch-close-coordinator.test.ts src/temporal/change-state.batch-close.test.ts src/temporal/change-state.close-reducer.test.ts src/temporal/change-state.operation-ledger.test.ts src/storage/store-temporal/changes.test.ts src/temporal/messages.test.ts (0) — 79/79 batch/storage/concurrency/message tests pass
- **[archive_only_evidence]** verification: pnpm run check (0) — schemas:check, typecheck, generate:manifests:check, test-isolation, lockfile-policy, lint, format:check all green
- **[archive_only_evidence]** decisions: Use durable prepare/commit/abort coordinator and reducer reservations — Preserves fail-all eligibility and typed convergence across independent workflows.
- **[archive_only_evidence]** decisions: Persist validated batch operation records under cross-process per-batch file lock — Atomic rename alone does not serialize concurrent retry state transitions.
- **[archive_only_evidence]** decisions: Canonicalize sorted/deduplicated target IDs and stable closure hash — Equivalent retries must reuse batch identity and avoid duplicate phases.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- batch/reducer/storage/message suites (0) — 79/79 tests pass including corrupt record, canonical IDs, same-batch concurrency, fail-all coordination
- **[archive_only_evidence]** verification: bin/oc-test targeted -- signal handlers and replay-sensitive suites (0) — 39/39 workflow/replay tests pass
- **[archive_only_evidence]** verification: pnpm run check (0) — schemas, typecheck, manifests, isolation, lockfile, lint, format pass
- **[archive_only_evidence]** decisions: Operation IDs now originate from host ToolContext identity via AsyncLocalStorage. — Session/message/tool/normalized-args identity makes host retries idempotent without deduplicating identical commands from separate user messages.
- **[archive_only_evidence]** decisions: Fallback without host context is a UUID-backed legacy identity. — Direct/internal append callers must not permanently dedupe matching payloads unless they supply an explicit authoritative operation ID.

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| AC1 | acceptance_criterion | pass |
| AC2 | acceptance_criterion | pass |
| AC3 | acceptance_criterion | pass |
| AC4 | acceptance_criterion | pass |
| AC5 | acceptance_criterion | pass |
| AC6 | acceptance_criterion | pass |
| AC7 | acceptance_criterion | pass |
| AC8 | acceptance_criterion | pass |
| AC9 | acceptance_criterion | pass |
| AC10 | acceptance_criterion | pass |
| AC11 | acceptance_criterion | pass |
| AC12 | acceptance_criterion | pass |
| AC13 | acceptance_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| C4 | constraint | respected |
| C5 | constraint | respected |
| C6 | constraint | respected |
| C7 | constraint | respected |
| C8 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |
| DONT4 | avoidance | respected |
| DONT5 | avoidance | respected |
| DONT6 | avoidance | respected |
| DONT7 | avoidance | respected |
| OOS1 | out_of_scope | not_applicable |
| OOS2 | out_of_scope | not_applicable |

## Unresolved Actions

- verification_missing: No durable adv_run_test evidence found for run_id: oc-test-targeted-operation-ledger
- verification_missing: No durable adv_run_test evidence found for run_id: oc-test-targeted-reducer-nearby
- verification_missing: No durable adv_run_test evidence found for run_id: plugin-checks
- verification_missing: No durable adv_run_test evidence found for run_id: run-tk-5fa3d9082674-red-oc-test
- verification_missing: No durable adv_run_test evidence found for run_id: red-tk-ac77fd41d2d4-a1
- verification_missing: No durable adv_run_test evidence found for run_id: green-tk-ac77fd41d2d4-a2
- verification_missing: No durable adv_run_test evidence found for run_id: green-tk-ac77fd41d2d4-a2-check
- verification_missing: No durable adv_run_test evidence found for run_id: oc-test-summary-shard-red-1
- verification_missing: No durable adv_run_test evidence found for run_id: typecheck-summary-shard-red-1
- verification_missing: No durable adv_run_test evidence found for run_id: lint-format-summary-shard-red-1
- verification_missing: No durable adv_run_test evidence found for run_id: pnpm-check-summary-shard-green-1
- verification_missing: No durable adv_run_test evidence found for run_id: red-tk-ccfe650451fa-a1-oc-test
- verification_missing: No durable adv_run_test evidence found for run_id: verify-tk-ccfe650451fa-a1-adjacent
- verification_missing: No durable adv_run_test evidence found for run_id: verify-tk-ccfe650451fa-a1-typecheck
- verification_missing: No durable adv_run_test evidence found for run_id: verify-tk-ccfe650451fa-a1-lint-format
- verification_missing: No durable adv_run_test evidence found for run_id: verify-tk-ccfe650451fa-a1-schemas
