# Archive Briefing Digest

**Change ID:** reconcileStoreMigrationResidue
**Title:** Reconcile store migration residue
**Status:** archived
**Generated:** 2026-08-08T03:57:07.903Z

## Identity Anchors

- CHANGE
- STATUS
- TERMINAL_GATE_SUMMARY
- Origin: adhoc

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

Showing 100 of 195 durable facts (95 omitted).

- **[report_follow_up]** follow_ups: Confirm the pokeedge 'unmigrated: 9' derivation: verify via computeAutoManagedCensus whether the 9 are failed-migration records (C3 hypothesis) or never-attempted records; determines whether C3's classification step is strictly required.
- **[report_follow_up]** follow_ups: When the agreement is written, mint C1 and C3 as explicit acceptance criteria with contract_refs during adv_contract_mint.
- **[report_follow_up]** follow_ups: If the reconcile pass reuses withArchiveProjectionLock for a non-git target store, add a test for the worktree-local lock fallback path (projection-lock.ts:17-20).
- **[research_citation]** sources: doctor.ts hardcoded scan budget: DOCTOR_PROJECTION_SCAN_BUDGET_MS=1500 hardcoded and passed to findProjectionDivergences; adv_doctor tool args (target_path/target_confirmed/confirmationEvidence) expose NO budget override. (plugin/src/tools/doctor.ts:26,185)
- **[research_citation]** sources: projection-health.ts findProjectionDivergences accepts budget: budgetMs undefined -> Number.POSITIVE_INFINITY (no budget); accepts maxChanges. Returns budgetExceeded/truncated/omitted. Taxonomy: canonical_error, legacy-behind, summary-behind. (plugin/src/storage/projection-health.ts:125-227)
- **[research_citation]** sources: doctor.test.ts budget_exceeded forces consistent=false: projection_scan.status in {complete,partial,budget_exceeded}; budget_exceeded implies canonical_projection_consistent=false; scanned+omitted=65. (plugin/src/tools/doctor.test.ts:129,156-160)
- **[research_citation]** sources.omitted: 7 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Five sourced opportunities identified across the six reconcile components. Two are acceptance-criteria gaps that would leave the change unverifiable or incomplete as currently scoped (C1: validation gate is structurally unsatisfiable on a >budget store because adv_doctor has no budget override and budget_exceeded forces canonical_projection_consistent=false; C3: migration completion is blocked by a failed.length===0 marker gate that re-invocation alone cannot clear). Two are overlooked in-repo proven patterns that reduce risk and effort (C2: historical-repair's seed-validation+readback+lock idempotency shape, critical for a non-git/no-backup target store; C4: convergeEpicMembership as the post-reconstruction verification primitive). One is a reuse opportunity avoiding a parallel census/marker (C5). No candidate duplicates the three prior considerations: C2 is pattern-level reuse of a module the prior-consideration dismissed only on target-grounds (archive-delta/spec vs store envelopes); C4 reuses a verification primitive, not the top-down convergence direction that fixEpicMembershipConvergence owns. All evidence is file:line verified; lgrep symbol indices were stale for projection-health.ts and historical-repair.ts (byte/line mismatch), so all material claims were re-verified via direct read/grep.
- **[unresolved_action]** required_main_agent_actions: Run ADV checkpoint for commit c1b68d8b, then mark tk-9aebec00d9c1 done through orchestration state tools.
- **[archive_only_evidence]** decisions: Extended ProjectPaths with resolved quarantine and reconcile artifact keys. — The scanner must use the storage path resolver and exclude reconcile-owned artifacts without hardcoded store layout paths.
- **[archive_only_evidence]** decisions: Extracted bounded projection counter parsing into projection-counters.ts and routed projection-health.ts through it. — The scan and existing divergence health path must share the exact legacy envelope shape and counter comparison rather than clone readLegacyCounters.
- **[archive_only_evidence]** decisions: Kept computeAutoManagedCensus as the marker classifier and loaded it lazily. — This reuses the existing census definition while avoiding the schema-registry/store-disk import cycle.
- **[archive_only_evidence]** decisions: Sort plan records by residue precedence and hash canonicalized plan JSON. — Normalization actions must structurally precede summary rebuilds, and identical scan input must produce a stable SHA-256 plan_hash.
- **[archive_only_evidence]** verification: pnpm test -- src/storage/store-residue-scan.test.ts src/storage/reconcile-plan.test.ts (0) — Targeted residue-scan and reconcile-plan tests pass, including all residue classes, precedence, fail-closed corruption, action coverage, ordering, purity, and plan-hash stability.
- **[archive_only_evidence]** verification: pnpm run schemas:check (0) — Generated public JSON schemas match the registry; typecheck and format:check were also run successfully in the same final validation cycle.
- **[report_follow_up]** follow_ups: Concrete per-class action executors remain intentionally not registered; later T3a/b/c, T4, T5, and T6 tasks own those implementations.
- **[report_follow_up]** follow_ups: MCP/CLI surfaces and process exit wiring remain later-task scope.
- **[unresolved_action]** required_main_agent_actions: Review commit 30d34985 and checkpoint/mark task completion through the orchestrator; do not add concrete class executors to this task's commit.
- **[archive_only_evidence]** decisions: Defined the exact executor seam as ActionExecutor = (record: ReconcilePlanRecord, action: ReconcileAction, ctx: ActionContext) => Promise<ActionOutcome>; exported ActionOutcome, ActionContext, executeRecordAction, and ACTION_EXECUTORS. — Keeps D2/D12 dispatcher ownership here while later class-specific tasks can replace notImplementedExecutor registry entries without changing guards or receipt semantics.
- **[archive_only_evidence]** decisions: Implemented typed ReconcileRefusalError mappings for target_store_resolution=2, corrupt_input=3, worker_lock_live/reconcile_lock_contention=4, stale_plan=6, plus partial-failure exit mapping=5. — Makes surface-level exit handling deterministic without performing process exits inside storage.
- **[archive_only_evidence]** decisions: Used read-only worker.lock probing, custom acquireFileLock for changes/.reconcile, atomic JSON receipts/progress/report writes, and locked append-only JSONL audit. — Mirrors existing repository primitives and preserves zero-mutation refusal ordering, resumability, and bounded audit behavior.
- **[archive_only_evidence]** decisions: Added saveEpicOptimistic with explicit pre-save version/create-if-absent rechecks and post-save readback verification. — saveActiveEpicProjection has no version check; the dispatcher seam must supply the optimistic-concurrency invariant for later Epic executors.
- **[archive_only_evidence]** decisions: Stored Uint8Array before-state bytes directly and hashed original bytes for receipt/audit binding; executor exceptions become per-record failures and continue. — Preserves byte identity and satisfies crash-safe per-record continuation rather than aborting the whole pass.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/storage/reconcile-apply.test.ts src/storage/reconcile-report.test.ts src/storage/reconcile-audit.test.ts (1) — RED evidence: three new suites failed as expected before implementation; missing modules and one initial fixture syntax defect were diagnosed and corrected.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/storage/reconcile-apply.test.ts src/storage/reconcile-report.test.ts src/storage/reconcile-audit.test.ts src/storage/store-residue-scan.test.ts (0) — GREEN evidence: 4 test files passed, 23 tests passed, covering live worker refusal, stale plan, lock contention, corrupt marker, per-record continuation, resume, receipts/progress, audit, and .reconcile exclusion.
- **[archive_only_evidence]** verification: pnpm run schemas:check && pnpm exec tsc --noEmit (0) — VERIFY evidence: generated schemas are current and TypeScript typecheck passes.
- **[unresolved_action]** required_main_agent_actions: Wire advanceLegacyToCanonicalExecutor and reportOnlyExecutor into ACTION_EXECUTORS from the orchestrator-owned shared wiring; this task intentionally did not edit reconcile-apply.ts or other shared files.
- **[unresolved_action]** required_main_agent_actions: Preserve the report-only skipped/report_only representation when integrating with receipt/report handling.
- **[archive_only_evidence]** decisions: Advance only when compareProjectionCounters reports legacy behind canonical; report-only only accepts newer envelopes. — Keeps C1 directionality structural and reuses the shared counter ordering from projection-counters.ts:13-41.
- **[archive_only_evidence]** decisions: Map canonical JSON into either {state: canonical} or bare canonical JSON based on the existing envelope root. — Preserves the legacy wrapper convention while copying canonical counters exactly.
- **[archive_only_evidence]** decisions: Represent report-only success as skipped plus report_only:true. — ActionOutcome in reconcile-apply.ts:89-95 only permits mutated, skipped, or failed; this avoids invalid receipts while retaining an explicit report-only marker.
- **[archive_only_evidence]** decisions: Use atomicWriteFile for the flat legacy file and re-read canonical bytes before and after the write. — Ensures the executor never writes canonical content and fails closed if canonical bytes change during the action.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/storage/reconcile-action-legacy-envelope.test.ts (1) — Expected RED: executor module was not yet present.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/storage/reconcile-action-legacy-envelope.test.ts (0) — GREEN: 1 test file and 7 tests passed, covering wrapped/bare advancement, report-only zero writes, counter bounds, and canonical byte identity.
- **[archive_only_evidence]** verification: pnpm exec tsc --noEmit (0) — TypeScript compilation passed.
- **[report_follow_up]** follow_ups: Keep plugin/src/storage/reconcile-action-schema-drift.ts and reconcile-action-schema-drift.test.ts with their owning task.
- **[unresolved_action]** required_main_agent_actions: Wire rebuildSummaryShardExecutor and rebuildFromChangesExecutor into ACTION_EXECUTORS in reconcile-apply.ts; shared-file wiring was explicitly out of this task scope.
- **[archive_only_evidence]** decisions: Use publishSummaryForChange for both per-change actions and readCurrentSummaryShard for post-write proof. — These are the existing canonical materializer and consistency reader; avoids cloning summary logic and proves the pointer resolves after mutation.
- **[archive_only_evidence]** decisions: Return canonical_projection_unparseable without attempting normalization. — Planner ordering assigns normalization before summary rebuild; keeping parse repair out of this executor preserves the root-cause/action boundary.
- **[archive_only_evidence]** decisions: Expose rebuildSummaryBatchExecutor and rebuildSummaryIndexBatch as an explicit whole-store option. — Per-change execution remains the default; the optional path delegates once to rebuildSummaryIndex for large batches instead of repeating whole-store work.
- **[unresolved_action]** scope_drift: finish_owned_scope_then_report: Adjacent untracked schema-drift executor files are present in the shared worktree; they were not inspected, modified, staged, or committed by this task.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/storage/reconcile-action-summary.test.ts (0) — 4 summary executor tests pass: missing pointer rebuild, stale pointer refresh, unparseable canonical failure, and missing summary artifact rebuild.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/storage/reconcile-action-summary.test.ts src/storage/change-summary-shard.test.ts (0) — 17 tests pass across summary executors and existing summary-shard machinery.
- **[archive_only_evidence]** verification: pnpm exec tsc --noEmit (0) — TypeScript compilation passes.
- **[archive_only_evidence]** verification: pnpm exec prettier --check src/storage/reconcile-action-summary.ts src/storage/reconcile-action-summary.test.ts (0) — Both new files pass Prettier formatting checks.
- **[unresolved_action]** required_main_agent_actions: Wire normalizeEnumMappingExecutor and quarantineRecordExecutor into the ACTION_EXECUTORS registry; no shared-file wiring was changed per task scope.
- **[unresolved_action]** required_main_agent_actions: Run the orchestrator's dispatcher/integration verification after registry wiring.
- **[archive_only_evidence]** decisions: Map only nested evidence_kind values build_worker and replay_determinism to other. — This is the explicit retired-enum mapping and avoids synthesizing defaults or altering unrelated projection fields.
- **[archive_only_evidence]** decisions: Reuse executeQuarantine from change-projection-quarantine.ts for unmappable records. — It preserves the existing atomic move semantics, .adv/quarantine/changes/<changeId>/<timestamp>/ layout, source bytes, lock, rollback, and change-projection-quarantine-audit.jsonl format.
- **[archive_only_evidence]** decisions: Return documented_residual proof alongside the residual string for quarantine. — The dispatcher surfaces residual strings in the run report while direct executor callers retain typed residual disposition and reason.
- **[archive_only_evidence]** verification: pnpm test -- src/storage/reconcile-action-schema-drift.test.ts (1) — Expected RED: new executor module was not yet present; the new test file could not import it.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/storage/reconcile-action-schema-drift.test.ts --config vitest.config.ts (0) — GREEN: 4 schema-drift executor tests pass, covering both retired enums, before-state bytes and hashes, quarantine layout/audit, residual proof, and DC4 field preservation.
- **[archive_only_evidence]** verification: pnpm exec tsc --noEmit (0) — TypeScript compilation passes.
- **[report_follow_up]** follow_ups: Rerun pnpm exec tsc --noEmit after concurrent peer task files compile.
- **[report_follow_up]** follow_ups: Wire the three executors in the registry and storage barrel.
- **[unresolved_action]** required_main_agent_actions: Register normalize_and_restore -> normalizeAndRestoreExecutor, remain_quarantined_reported -> remainQuarantinedReportedExecutor, and quarantine_to_trash -> quarantineToTrashExecutor.
- **[unresolved_action]** required_main_agent_actions: Rerun full pnpm exec tsc --noEmit after peer task fixes.
- **[archive_only_evidence]** decisions: Restore only when retired evidence values map to a ChangeSchema-valid projection. — C3 forbids synthesizing missing state; unmappable records remain quarantined as documented residuals.
- **[archive_only_evidence]** decisions: Refuse to overwrite an existing active projection during restore. — Preserves readable state and fails closed under duplicate or concurrent residue.
- **[archive_only_evidence]** decisions: Allowlist worker.lock for unknown-store-noise actions. — worker.lock is operational state and must not be moved to trash.
- **[archive_only_evidence]** decisions: Leave registry and barrel wiring to the orchestrator. — The task hard boundary excludes reconcile-apply.ts and index.ts.
- **[unresolved_action]** blockers: Full tsc verification is blocked by a concurrent untracked peer-task implementation.
- **[unresolved_action]** blockers: Full tsc verification also reports errors in a concurrent untracked peer-task implementation.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/storage/reconcile-action-quarantine.test.ts (1) — Red phase: initial focused suite failed before the executor existed; the initial fixture parse error was corrected before green.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/storage/reconcile-action-quarantine.test.ts (0) — Green phase: 5 focused tests passed for normalize+restore, unrecoverable residuals, worker.lock allowlisting, and refusal paths.
- **[archive_only_evidence]** verification: pnpm exec tsc --noEmit (2) — Full typecheck failed in concurrent untracked peer files reconcile-action-artifact-metadata.ts and reconcile-action-epic-recovery.ts; no diagnostics referenced the quarantine files.
- **[report_follow_up]** follow_ups: Resolve the pre-existing Epic recovery type error, then rerun pnpm exec tsc --noEmit.
- **[report_follow_up]** follow_ups: Wire migrate_record, classify_terminal_noop, set_marker_auto, and set_marker_legacy to the exported executors. Keep schema-drift quarantine_record wiring unless a class-aware quarantine dispatcher is added.
- **[report_follow_up]** follow_ups: Add or use a sanctioned metadata-only projection commit mode so worktree_auto_managed normalization does not bump projection revision, as required by D8.
- **[unresolved_action]** required_main_agent_actions: Wire the four exported action executors in reconcile-apply.ts after confirming the metadata-only revision suppression path.
- **[unresolved_action]** required_main_agent_actions: Resolve plugin/src/storage/reconcile-action-epic-recovery.ts:188 and rerun global typecheck.
- **[archive_only_evidence]** decisions: Use the existing coordinated mutation callback for active change projections and atomic write/readback for archived projections. — Preserves C4's sanctioned active-projection commit path while covering archive records, which are outside commitChangeProjection's active changes directory.
- **[archive_only_evidence]** decisions: Derive worktree marker truth from the existing getWorktreeRegistrySnapshot/initStateDb path. — D8 requires existing registry evidence and DONT6 forbids a parallel census/marker definition; missing or unavailable evidence conservatively selects the legacy false marker action.
- **[archive_only_evidence]** decisions: Persist per-run artifact dispositions before attempting the completion marker. — The marker must carry durable per-record dispositions even when an earlier terminal-no-op action runs before another record finishes migration.
- **[unresolved_action]** blockers: Global typecheck is blocked by plugin/src/storage/reconcile-action-epic-recovery.ts:188, which was not touched by this task.
- **[unresolved_action]** blockers: D8 metadata-only projection revision suppression is not available through the current ActionContext seam.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/storage/reconcile-action-artifact-metadata.test.ts (0) — 6 focused artifact-metadata and worktree-marker tests pass.
- **[archive_only_evidence]** verification: pnpm exec prettier --check src/storage/reconcile-action-artifact-metadata.ts src/storage/reconcile-action-artifact-metadata.test.ts (0) — Both touched files satisfy repository Prettier formatting.
- **[archive_only_evidence]** verification: pnpm exec tsc --noEmit (2) — Global typecheck remains blocked only by pre-existing plugin/src/storage/reconcile-action-epic-recovery.ts:188 terminal_summary.completed_at unknown; no type errors remain in the two touched files.
- **[unresolved_action]** required_main_agent_actions: Wire reconcile-proof exports into plugin/src/storage/index.ts and attach the proof artifact to the run report when integrating the apply flow.
- **[archive_only_evidence]** decisions: Completion proof invokes findProjectionDivergences without an options object. — D13 requires both maxChanges and budgetMs to remain unset; passing no options preserves the unbounded seam.
- **[archive_only_evidence]** decisions: Proof returns incomplete for truncation and error for scan exceptions. — A capped or failed proof cannot establish completion; the result retains counts and diagnostic evidence instead of synthesizing success.
- **[archive_only_evidence]** decisions: Whitelisted residuals require a change_id and exact documented reason. — AC10 permits only explicit, auditable benign residuals, while all other divergences remain residual blockers.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/storage/reconcile-proof.test.ts (0) — 4 focused completion-proof tests pass: empty store, clean after apply, residual divergence, and fail-closed scan error.
- **[archive_only_evidence]** verification: pnpm exec tsc --noEmit (0) — TypeScript compilation passes.
- **[report_follow_up]** follow_ups: Follow-on CLI task tk-229fbd8052ea should call storeReconcileTools.adv_store_reconcile or the equivalent shared surface contract and preserve mode, confirm_plan_hash, target trust, resume_from, max_records, and budget_ms semantics.
- **[unresolved_action]** required_main_agent_actions: Use commit 202eb46f on change/reconcileStoreMigrationResidue; it contains the seven intended surface/registry/policy/title/docs files. Do not stage unrelated concurrent changes.
- **[archive_only_evidence]** decisions: Registered adv_store_reconcile as an operator-only host-plugin tool rather than Tier-4 Code Mode MCP. — The surface includes apply mutation, target routing, and approval arguments; mcp-server/security.ts intentionally rejects mutation-shaped arguments. This preserves the read-only Tier-4 boundary while exposing the requested operator MCP/plugin surface and shared CLI seam.
- **[archive_only_evidence]** decisions: Supported plan and dry_run as read-only modes, with apply requiring confirm_plan_hash and fresh-plan verification delegated to runReconcileApply. — This directly preserves C5 dry-run-first approval and the frozen engine's typed stale-plan and lock refusals.
- **[archive_only_evidence]** decisions: Added optional max_records and budget_ms and passed the same bounded scan options into apply re-verification. — A bounded plan must hash the same scan population that apply re-verifies; otherwise valid bounded plans would be rejected as stale.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/tools/store-reconcile.test.ts (1) — Red phase: focused suite failed at missing store-reconcile module as expected.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/tools/store-reconcile.test.ts (0) — Green phase: focused reconcile tool tests pass.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/tools/store-reconcile.test.ts src/tool-role-policy.test.ts src/tool-registry.inventory.test.ts src/tool-registry.surface.test.ts && pnpm exec tsc --noEmit && pnpm run generate:manifests:check && pnpm run schemas:check && pnpm exec prettier --check src/tools/store-reconcile.ts src/tools/store-reconcile.test.ts src/tool-registry.ts src/tool-role-policy.ts src/utils/tool-title.ts (0) — Final verification: 4 test files/67 tests pass; TypeScript, manifest, schema, and formatting checks pass.
- **[unresolved_action]** required_main_agent_actions: Checkpoint the worktree on branch change/reconcileStoreMigrationResidue; no commit was created by this leaf executor.
- **[unresolved_action]** required_main_agent_actions: Run the integration task tk-f15e07ede630 against the emitted CLI surface and review the final diff before task completion.
- **[archive_only_evidence]** decisions: Made bin/adv reconcile a thin dynamic loader for plugin/dist/reconcile-cli.js. — Keeps root CLI free of frozen storage/tool imports while ensuring the standalone surface executes the same canonical handler as MCP.
- **[archive_only_evidence]** decisions: Implemented CLI parsing with both canonical snake_case and shell-friendly kebab-case aliases. — Preserves host argument names while making plan/dry-run/apply and target/resume controls ergonomic without changing engine semantics.
- **[archive_only_evidence]** decisions: Extended the plugin bundle manifest and deploy validation with reconcile-cli.js. — The new runtime artifact must be copied and hash-validated before manifest publication, just like the existing bundles.
- **[archive_only_evidence]** decisions: Kept legacy manifest reads backward-compatible while requiring all three bundles for newly generated manifests. — Existing deployed manifests can still be diagnosed, while production builds cannot publish without the new CLI artifact.
- **[archive_only_evidence]** verification: bun test bin/reconcile-cli.test.ts (0) — 4 parity tests passed: plan, dry_run, approved apply, stale-plan refusal, worker-lock refusal, and usage refusal.

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| SC1 | success_criterion | pass |
| SC2 | success_criterion | pass |
| SC3 | success_criterion | pass |
| SC4 | success_criterion | pass |
| SC5 | success_criterion | pass |
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
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| C4 | constraint | respected |
| C5 | constraint | respected |
| C6 | constraint | respected |
| C7 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |
| DONT4 | avoidance | respected |
| DONT5 | avoidance | respected |
| DONT6 | avoidance | respected |
| OOS1 | out_of_scope | respected |
| OOS2 | out_of_scope | respected |
| OOS3 | out_of_scope | respected |
| OOS4 | out_of_scope | respected |
| OOS5 | out_of_scope | respected |

## Unresolved Actions

- Run ADV checkpoint for commit c1b68d8b, then mark tk-9aebec00d9c1 done through orchestration state tools.
- Review commit 30d34985 and checkpoint/mark task completion through the orchestrator; do not add concrete class executors to this task's commit.
- Wire advanceLegacyToCanonicalExecutor and reportOnlyExecutor into ACTION_EXECUTORS from the orchestrator-owned shared wiring; this task intentionally did not edit reconcile-apply.ts or other shared files.
- Preserve the report-only skipped/report_only representation when integrating with receipt/report handling.
- Wire rebuildSummaryShardExecutor and rebuildFromChangesExecutor into ACTION_EXECUTORS in reconcile-apply.ts; shared-file wiring was explicitly out of this task scope.
- finish_owned_scope_then_report: Adjacent untracked schema-drift executor files are present in the shared worktree; they were not inspected, modified, staged, or committed by this task.
- Wire normalizeEnumMappingExecutor and quarantineRecordExecutor into the ACTION_EXECUTORS registry; no shared-file wiring was changed per task scope.
- Run the orchestrator's dispatcher/integration verification after registry wiring.
- Register normalize_and_restore -> normalizeAndRestoreExecutor, remain_quarantined_reported -> remainQuarantinedReportedExecutor, and quarantine_to_trash -> quarantineToTrashExecutor.
- Rerun full pnpm exec tsc --noEmit after peer task fixes.
- Full tsc verification is blocked by a concurrent untracked peer-task implementation.
- Full tsc verification also reports errors in a concurrent untracked peer-task implementation.
- Wire the four exported action executors in reconcile-apply.ts after confirming the metadata-only revision suppression path.
- Resolve plugin/src/storage/reconcile-action-epic-recovery.ts:188 and rerun global typecheck.
- Global typecheck is blocked by plugin/src/storage/reconcile-action-epic-recovery.ts:188, which was not touched by this task.
- D8 metadata-only projection revision suppression is not available through the current ActionContext seam.
- Wire reconcile-proof exports into plugin/src/storage/index.ts and attach the proof artifact to the run report when integrating the apply flow.
- Use commit 202eb46f on change/reconcileStoreMigrationResidue; it contains the seven intended surface/registry/policy/title/docs files. Do not stage unrelated concurrent changes.
- Checkpoint the worktree on branch change/reconcileStoreMigrationResidue; no commit was created by this leaf executor.
- Run the integration task tk-f15e07ede630 against the emitted CLI surface and review the final diff before task completion.
