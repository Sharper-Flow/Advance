# Archive Briefing Digest

**Change ID:** retireAgendaWorkflow
**Title:** Retire agenda workflow
**Status:** archived
**Generated:** 2026-07-14T02:31:26.018Z

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

Showing 100 of 194 durable facts (94 omitted).

- **[archive_only_evidence]** decisions: Created separate adv_report_followup_promote tool instead of extending adv_followup_promote — Keeps ops path (adv_followup_promote) unchanged per scope requirement 'ops work continues existing typed path'; new tool has no Agenda source args, implicitly rejecting Agenda source per 'new mutations reject Agenda source'
- **[archive_only_evidence]** decisions: Read-side deterministic ID normalization instead of ingest-time ID assignment — Legacy reports with plain string follow_ups derive stable IDs from immutable report_key + kind + index at read/promotion boundaries; avoids schema migration and keeps report input shape unchanged
- **[archive_only_evidence]** decisions: Added followup_ref as optional typed field on TaskSchema and FastFollowOfSchema — Structural ref is authority over text matching; TaskSchema.passthrough() and FastFollowOfSchema backward compat ensure legacy records parse without the field
- **[archive_only_evidence]** decisions: Pre-planning task metadata stores JSON-serialized followup_ref alongside typed field — Enables agent-driven filtering via adv_task_list metadata queries while the typed field provides structural validation
- **[archive_only_evidence]** verification: pnpm exec vitest run src/tools/report-followup.test.ts src/types/subagent-reports.test.ts src/types/tasks.test.ts src/types/changes.test.ts src/types/changes.ops-follow-up.test.ts src/tools/followup.test.ts src/tools/subagent-report.test.ts src/tool-registry.test.ts src/cli-surface-matrix.test.ts src/cli-bridge-contract.test.ts (0) — 185 tests pass across 8 test files covering typed ID determinism, legacy normalization, pre-planning task creation with followup_ref, post-planning fast-follow child creation with followup_ref, Agenda source rejection, backward compat, tool registration, CLI surface matrix, and frozen snapshot
- **[archive_only_evidence]** verification: pnpm run check (0) — schemas:check, typecheck, test isolation, lockfile policy, lint, and format:check all pass
- **[archive_only_evidence]** verification: pnpm run build (0) — Plugin and Temporal worker bundles build successfully
- **[archive_only_evidence]** verification: pnpm test (0) — Full test suite: 340 files, 5073 tests pass
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/tools/report-followup.test.ts src/types/subagent-reports.test.ts src/types/tasks.test.ts src/types/changes.test.ts src/types/changes.ops-follow-up.test.ts src/tools/followup.test.ts src/tools/subagent-report.test.ts src/tool-registry.test.ts src/cli-surface-matrix.test.ts src/cli-bridge-contract.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run build
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm test
- **[archive_only_evidence]** decisions: Reject target_path in validateArgs instead of silently ignoring it — Contract scope says 'same-project fast-follow child' (C1). Explicit rejection surfaces caller error and prevents silent mis-routing.
- **[archive_only_evidence]** decisions: Removed targetArgs and withTargetPathStore entirely from report-followup.ts — No cross-project routing is needed for report follow-ups; removing dead code reduces surface area and prevents accidental future use.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/tools/report-followup.test.ts -t "rejects target_path" (1) — RED: test fails with TypeError because tool crashes when target_path is provided (routes through withTargetPathStore instead of rejecting)
- **[archive_only_evidence]** verification: pnpm exec vitest run src/tools/report-followup.test.ts -t "rejects target_path" (0) — GREEN: test passes after removing target_path support and adding validation rejection
- **[archive_only_evidence]** verification: pnpm exec vitest run src/tools/report-followup.test.ts (0) — GREEN: all 27 tests pass with no regressions
- **[archive_only_evidence]** verification: pnpm run check (0) — VERIFY: schemas, typecheck, isolation, lockfile, lint, and format all pass
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/tools/report-followup.test.ts -t "rejects target_path"
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/tools/report-followup.test.ts -t "rejects target_path"
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/tools/report-followup.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- **[agenda]** follow_ups: Consumer verification_missing warnings persist for all reported commands despite exact adv_run_test command-string matches. Evidence runIds recorded: tr_mrjqz6m2_50f310a6 (red), tr_mrjr2zv5_e123ab2b (green targeted), tr_mrjr380n_e1956175 (green full), tr_mrjr42yh_12f88328 (verify). Investigate adv_run_test evidence-store association for sub-agent contexts.
- **[archive_only_evidence]** decisions: Reject target_path in validateArgs instead of silently ignoring it — Contract scope says 'same-project fast-follow child' (C1). Explicit rejection surfaces caller error and prevents silent mis-routing.
- **[archive_only_evidence]** decisions: Removed targetArgs and withTargetPathStore entirely from report-followup.ts — No cross-project routing is needed for report follow-ups; removing dead code reduces surface area and prevents accidental future use.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/tools/report-followup.test.ts -t "rejects target_path" (1) — RED [runId: tr_mrjqz6m2_50f310a6]: test fails with TypeError because tool crashes when target_path is provided (routes through withTargetPathStore instead of rejecting)
- **[archive_only_evidence]** verification: pnpm exec vitest run src/tools/report-followup.test.ts -t "rejects target_path" (0) — GREEN [runId: tr_mrjr2zv5_e123ab2b]: test passes after removing target_path support and adding validation rejection
- **[archive_only_evidence]** verification: pnpm exec vitest run src/tools/report-followup.test.ts (0) — GREEN [runId: tr_mrjr380n_e1956175]: all 27 tests pass with no regressions
- **[archive_only_evidence]** verification: pnpm run check (0) — VERIFY [runId: tr_mrjr42yh_12f88328]: schemas, typecheck, isolation, lockfile, lint, and format all pass
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/tools/report-followup.test.ts -t "rejects target_path"
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/tools/report-followup.test.ts -t "rejects target_path"
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/tools/report-followup.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- **[archive_only_evidence]** decisions: Used typed ConflictInventory interface instead of raw activeChanges array — Provides explicit completeness state (complete/degraded/blocked), Epic membership context, and structured warnings — prevents clean no-conflict results when inventory is incomplete or degraded
- **[archive_only_evidence]** decisions: Kept legacy activeChanges path for backward compatibility — Existing callers and tests still work; migration is incremental, not breaking
- **[archive_only_evidence]** decisions: Archived changes are skipped in conflict detection (related context only) — Active changes and Epic members are authoritative; archived changes are prior work that may inform but should not block
- **[archive_only_evidence]** decisions: Blocked inventory emits error; degraded emits warning; each warning emitted as distinct validation warning — Ensures no clean no-conflict result is possible when there are omissions, warnings, deadline issues, or source failures
- **[archive_only_evidence]** verification: npx vitest run src/validator/conflict-inventory.test.ts (0) — All 10 new conflict-inventory tests pass (RED → GREEN)
- **[archive_only_evidence]** verification: pnpm run check (0) — Full check suite passes: schemas, typecheck, isolation, lockfile, lint, format
- **[archive_only_evidence]** verification: npx vitest run src/validator/ src/tools/change.test.ts src/tools/change/create-clarify.test.ts src/tools/change/archive-gate.test.ts (0) — 355 tests pass across 18 test files including validator, change tools, and archive gate
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: npx vitest run src/validator/conflict-inventory.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: npx vitest run src/validator/ src/tools/change.test.ts src/tools/change/create-clarify.test.ts src/tools/change/archive-gate.test.ts
- **[archive_only_evidence]** decisions: Used typed ConflictInventory interface instead of raw activeChanges array — Provides explicit completeness state (complete/degraded/blocked), Epic membership context, and structured warnings — prevents clean no-conflict results when inventory is incomplete or degraded
- **[archive_only_evidence]** decisions: Kept legacy activeChanges path for backward compatibility — Existing callers and tests still work; migration is incremental, not breaking
- **[archive_only_evidence]** decisions: Archived changes are skipped in conflict detection (related context only) — Active changes and Epic members are authoritative; archived changes are prior work that may inform but should not block
- **[archive_only_evidence]** decisions: Blocked inventory emits error; degraded emits warning; each warning emitted as distinct validation warning — Ensures no clean no-conflict result is possible when there are omissions, warnings, deadline issues, or source failures
- **[archive_only_evidence]** decisions: Added inventory source to OVERLAPPING_CAPABILITY conflict details — Blocked/degraded/warning issues already included source; omitting it from overlap conflicts broke auditability and made it impossible to trace which inventory source produced the conflict
- **[archive_only_evidence]** verification: npx vitest run src/validator/conflict-inventory.test.ts --reporter=verbose (1) — RED (runId tr_mrjqw1uy_f9625b71): new test 'includes inventory source in overlapping-capability conflict details' fails — source undefined in OVERLAPPING_CAPABILITY details
- **[archive_only_evidence]** verification: npx vitest run src/validator/conflict-inventory.test.ts --reporter=verbose (0) — GREEN (runId tr_mrjqwqvg_bc2329dd): all 11 conflict-inventory tests pass after adding source to OVERLAPPING_CAPABILITY details
- **[archive_only_evidence]** verification: pnpm run check (0) — Full check suite passes: schemas, typecheck, isolation, lockfile, lint, format
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: npx vitest run src/validator/conflict-inventory.test.ts --reporter=verbose
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: npx vitest run src/validator/conflict-inventory.test.ts --reporter=verbose
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- **[agenda]** follow_ups: Consider exporting extractSourceTaskIdFromReportKey as a shared util alongside subagentReportKey if future surfaces (e.g., adv_change_list enrichment, briefing packet renderer) need the same task-id derivation; kept file-local for now per scope.
- **[archive_only_evidence]** decisions: Classification is a constant 'non_blocking_advisory' string instead of a derived enum — fast_follow_of is reserved for non-operational advisory children per retireAgendaWorkflow design; operational work continues through ops_followup_links (parent-side) and is not in scope here. Keeping the field a constant prevents drift into a dependency enum (DONT4) while still surfacing the classification AC6 requires.
- **[archive_only_evidence]** decisions: Post-render additive enrichment helper (enrichEpicRenderWithFastFollowLineage) instead of making formatEpic/formatEpicCompact async — formatEpic/formatEpicCompact have many call sites (adv_epic_create, adv_epic_list, adv_epic_update, adv_epic_retire, adv_epic_merge). Enriching only in adv_epic_show keeps the projection bounded to the requested surface, preserves sync renderers for other tools, and avoids touching unrelated Epic surfaces (scope lock).
- **[archive_only_evidence]** decisions: Per-render Map<changeId, lineage|null> cache in buildFastFollowLineageMap — Multiple Epic entries can reference the same child change; caching by change_id bounds store reads to the number of unique children, satisfying the 'bounded by Epic entry count' constraint and avoiding duplicate Temporal reads during a single render.
- **[archive_only_evidence]** decisions: extractSourceTaskIdFromReportKey handles both legacy taskId and task:<id> report-key shapes — subagentReportKey emits changeId|taskId|agent|attempt for legacy taskId-present reports and changeId|task:<id>|agent|attempt for task-scope reports. Parsing both keeps source_task_id populated for both shapes; change-scope and unknown-scope keys return null as required.
- **[archive_only_evidence]** decisions: Best-effort load with silent omission on child change load failure — Advisory projection must not break adv_epic_show when a child change is unreachable (e.g., target_unreachable, workflow wedge). Load failures simply omit fast_follow_lineage for that entry, preserving the read and matching the fail-soft pattern of member_status.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/tools/epic.test.ts -t "fast-follow lineage" (1) — RED [runId: tr_mrjseyzi_295b3a35]: 4 of 7 new tests fail with fast_follow_lineage undefined; 3 omission tests pass trivially pre-implementation. Confirms test genuinely fails before implementation.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/tools/epic.test.ts -t "fast-follow lineage" (0) — GREEN [runId: tr_mrjsmha2_44f35ea5]: all 7 fast-follow lineage tests pass after implementing enrichEpicRenderWithFastFollowLineage.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/tools/epic.test.ts src/advance-epics-assets.test.ts src/types/epics.test.ts src/types/changes.test.ts (0) — GREEN [runId: tr_mrjsmswr_100396aa]: 208 tests pass across Epic tool, Epics assets, and related type suites; no regressions.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/advance-epics-assets.test.ts src/tools/epic.test.ts src/tools/spec.test.ts (0) — VERIFY [runId: tr_mrjspmas_b91f4aa9]: 190 tests pass after spec/doc mirror updates including new rq-epicFastFollowLineage01 anchor.
- **[archive_only_evidence]** verification: pnpm run check (0) — VERIFY [runId: tr_mrjss93p_159968ee]: schemas:check, typecheck, test isolation, lockfile policy, lint, and format:check all pass after prettier fix to epic.test.ts.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/tools/epic.test.ts src/advance-epics-assets.test.ts src/tools/spec.test.ts src/tools/change.test.ts (0) — VERIFY [runId: tr_mrjssnqs_62f3d75d]: 298 tests pass across Epic tool, assets, spec, and change suites.
- **[archive_only_evidence]** verification: pnpm run build (0) — VERIFY [runId: tr_mrjst7sb_8ba8ad75]: plugin + Temporal worker bundles build successfully.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/tools/epic.test.ts -t "fast-follow lineage"
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/tools/epic.test.ts -t "fast-follow lineage"
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/tools/epic.test.ts src/advance-epics-assets.test.ts src/types/epics.test.ts src/types/changes.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/advance-epics-assets.test.ts src/tools/epic.test.ts src/tools/spec.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/tools/epic.test.ts src/advance-epics-assets.test.ts src/tools/spec.test.ts src/tools/change.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run build
- **[archive_only_evidence]** decisions: Named the tool adv_store_cleanup (outside adv_agenda_* namespace) — Design requires maintenance-only cleanup outside the agenda namespace; adv_store_cleanup is extensible for future legacy cleanup targets
- **[archive_only_evidence]** decisions: Reused walkStoreDirs, defaultDataHomeRoot, and CONSOLIDATION_LEDGER_FILENAME from store-consolidate — Design requires reusing consolidation primitives for store discovery, ledger-aware safety, and idempotency
- **[archive_only_evidence]** decisions: Manifest written before delete, one row per store outcome — AC7/SC3/C4 require audit-manifest evidence before deletion; append-only JSONL prevents append/delete races and supports retry
- **[archive_only_evidence]** decisions: Execute requires matching dry_run_plan_hash — DONT5 requires approved dry-run evidence; hash match prevents TOCTOU races between dry_run and execute
- **[archive_only_evidence]** decisions: Refuse cleanup when worker.lock is live or consolidation ledger has agenda_row entries — Design requires mutual exclusion with consolidation; ledger agenda_rows indicate consolidation explicitly preserved agenda data
- **[archive_only_evidence]** decisions: Retained stores get manifest rows with outcome=retained — C3 requires unsafe stores to be reported, retained, and retryable; manifest rows provide the retry audit trail
- **[archive_only_evidence]** decisions: Regenerated change.schema.json and task.schema.json — Pre-existing type changes in the worktree made schemas stale; smoke test requires schemas:check to pass
- **[archive_only_evidence]** verification: ./bin/oc-test targeted -- src/tools/store-cleanup.test.ts (0) — 15 tests pass: scan, dry_run, execute, idempotency, manifest, tool-level
- **[archive_only_evidence]** verification: ./bin/oc-test targeted -- src/tools/store-cleanup.test.ts src/tools/store-consolidate.test.ts (0) — 57 tests pass: store-cleanup + store-consolidate regression
- **[archive_only_evidence]** verification: ./bin/oc-test targeted -- src/tools/ (0) — 1499 tests pass across all tools
- **[archive_only_evidence]** verification: ./bin/oc-test smoke (0) — schemas:check, typecheck, lint, format:check, 62 tests pass
- **[archive_only_evidence]** verification: ./bin/oc-test full (0) — 5073 tests pass across all suites
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: ./bin/oc-test targeted -- src/tools/store-cleanup.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: ./bin/oc-test targeted -- src/tools/store-cleanup.test.ts src/tools/store-consolidate.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: ./bin/oc-test targeted -- src/tools/
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: ./bin/oc-test smoke
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: ./bin/oc-test full
- **[agenda]** follow_ups: Consumer verification_missing warnings may persist for adv_run_test commands despite exact command-string matches; evidence runIds recorded in verification summaries for manual verification.
- **[archive_only_evidence]** decisions: Created purpose-specific storage module snapshot-repair-audit.ts instead of extending Agenda or wisdom stores — Design requires a purpose-specific durable audit record outside planning/gates/backlog/Epic state; mirrors project-wisdom.ts append-only JSONL pattern with file-lock serialization
- **[archive_only_evidence]** decisions: Added snapshotRepairAudit field to ProjectPaths in json.ts — Consistent with existing path resolution for wisdom/agenda/reflections/projectMetadata; supports both external and legacy .adv layouts
- **[archive_only_evidence]** decisions: Used finding metadata lock_path/object_path for audit target_path when available — RepairActionRecord.target_path stores the bare-repo path; audit entries should record the specific artifact path (lock/object file) for accurate before/after traceability
- **[archive_only_evidence]** decisions: Only successful repairs produce audit entries; dryRun and failed/skipped repairs do not — AC4/DDC5 require durable audit records for successful remediation only; dryRun previews and failed repairs are ephemeral
- **[archive_only_evidence]** decisions: Replaced spec rq-snapshotHealthAuditTrail01 body rather than adding a new requirement — Same rq- ID preserves spec continuity and validator test references; body updated to reflect purpose-specific audit log instead of Agenda
- **[archive_only_evidence]** verification: pnpm exec vitest run src/storage/snapshot-repair-audit.test.ts src/tools/snapshot.test.ts (1) — RED (runId tr_mrjrgug1_c12bcc8b): tests fail with Cannot find module './snapshot-repair-audit' because audit store does not exist yet
- **[archive_only_evidence]** verification: pnpm exec vitest run src/storage/snapshot-repair-audit.test.ts src/tools/snapshot.test.ts src/storage/json.test.ts (0) — GREEN (runId tr_mrjrlkbe_b7e222e3): 92 tests pass after implementing snapshot-repair-audit store, ProjectPaths extension, and snapshot.ts audit replacement
- **[archive_only_evidence]** verification: pnpm exec vitest run src/validator/snapshot-health-spec.test.ts src/storage/snapshot-repair-audit.test.ts src/tools/snapshot.test.ts src/storage/json.test.ts (0) — VERIFY (runId tr_mrjroic5_6f944274): 102 tests pass including updated spec test asserting purpose-specific audit log with pattern/target_path/before_summary/after_summary/outcome/recorded_at and no Agenda references

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| SC1 | success_criterion | pass |
| SC2 | success_criterion | pass |
| SC3 | success_criterion | pass |
| SC4 | success_criterion | pass |
| AC1 | acceptance_criterion | pass |
| AC2 | acceptance_criterion | pass |
| AC3 | acceptance_criterion | pass |
| AC4 | acceptance_criterion | pass |
| AC5 | acceptance_criterion | pass |
| AC6 | acceptance_criterion | pass |
| AC7 | acceptance_criterion | pass |
| AC8 | acceptance_criterion | pass |
| AC9 | acceptance_criterion | pass |
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
| OOS1 | out_of_scope | not_applicable |
| OOS2 | out_of_scope | not_applicable |
| OOS3 | out_of_scope | not_applicable |

## Unresolved Actions

- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/tools/report-followup.test.ts src/types/subagent-reports.test.ts src/types/tasks.test.ts src/types/changes.test.ts src/types/changes.ops-follow-up.test.ts src/tools/followup.test.ts src/tools/subagent-report.test.ts src/tool-registry.test.ts src/cli-surface-matrix.test.ts src/cli-bridge-contract.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- verification_missing: No adv_run_test evidence found for reported command: pnpm run build
- verification_missing: No adv_run_test evidence found for reported command: pnpm test
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/tools/report-followup.test.ts -t "rejects target_path"
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/tools/report-followup.test.ts -t "rejects target_path"
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/tools/report-followup.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/tools/report-followup.test.ts -t "rejects target_path"
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/tools/report-followup.test.ts -t "rejects target_path"
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/tools/report-followup.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- verification_missing: No adv_run_test evidence found for reported command: npx vitest run src/validator/conflict-inventory.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- verification_missing: No adv_run_test evidence found for reported command: npx vitest run src/validator/ src/tools/change.test.ts src/tools/change/create-clarify.test.ts src/tools/change/archive-gate.test.ts
- verification_missing: No adv_run_test evidence found for reported command: npx vitest run src/validator/conflict-inventory.test.ts --reporter=verbose
- verification_missing: No adv_run_test evidence found for reported command: npx vitest run src/validator/conflict-inventory.test.ts --reporter=verbose
- verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/tools/epic.test.ts -t "fast-follow lineage"
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/tools/epic.test.ts -t "fast-follow lineage"
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/tools/epic.test.ts src/advance-epics-assets.test.ts src/types/epics.test.ts src/types/changes.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/advance-epics-assets.test.ts src/tools/epic.test.ts src/tools/spec.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/tools/epic.test.ts src/advance-epics-assets.test.ts src/tools/spec.test.ts src/tools/change.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm run build
- verification_missing: No adv_run_test evidence found for reported command: ./bin/oc-test targeted -- src/tools/store-cleanup.test.ts
- verification_missing: No adv_run_test evidence found for reported command: ./bin/oc-test targeted -- src/tools/store-cleanup.test.ts src/tools/store-consolidate.test.ts
- verification_missing: No adv_run_test evidence found for reported command: ./bin/oc-test targeted -- src/tools/
- verification_missing: No adv_run_test evidence found for reported command: ./bin/oc-test smoke
- verification_missing: No adv_run_test evidence found for reported command: ./bin/oc-test full
