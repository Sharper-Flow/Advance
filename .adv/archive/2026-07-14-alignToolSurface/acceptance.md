# Acceptance

Reviewed at: 2026-07-14T22:45:17.432Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | Every registered tool/action has an intentional runtime, spec, ownership, reachability, and documentation disposition. | pass | Tool ownership matrix (docs/tool-ownership.md) classifies all 80 registered tools; rq-toolOwnership01 spec + 6 asset tests enforce. |
| SC2 | success_criterion | Destructive/recovery operations remain approval-gated, evidence-backed, and bounded. | pass | Archive purge, archive repair, store cleanup, snapshot repair all retain approval/evidence/lock/manifest gates. |
| SC3 | success_criterion | No active workflow authority regresses to Agenda. | pass | Agenda retired from 17 spec/asset/doc files; parse-only compatibility retained; no adv_agenda_* registered. |
| AC1 | acceptance_criterion | `adv_archive_purge` supports archived-only purge, preserves bundles by default, requires separate opt-in bundle deletion, and records audit results. | pass | adv_archive_purge implemented per rq-archivePurge01: default preserves bundle, opt-in deletes, refuses non-archived. 10 tests pass. |
| AC2 | acceptance_criterion | Snapshot-health runtime and `rq-snapshotHealthRepairWhitelist01` name the same closed repair-action set. | pass | rq-snapshotHealthRepairWhitelist01 amended to 4 actions; parity test asserts runtime=spec. |
| AC3 | acceptance_criterion | Snapshot repair exposes bounded recent audit history without exposing unrelated project data or secrets. | pass | audit_history action wired to listSnapshotRepairAudits; 7 tests cover bounding, project-scoping, empty. |
| AC4 | acceptance_criterion | Active specs, commands, agents, skills, docs, schemas, and tests no longer prescribe Agenda as a queue, follow-up sink, audit sink, or conflict authority; parse-only compatibility and cleanup remain explicit exceptions. | pass | rq-subagentReports03/08/14/22, rq-backlogCoord09.5 amended; 17 files updated; 95 tests pass. |
| AC5 | acceptance_criterion | Every `adv_archive_repair` action has one purpose; branch cleanup is separated or moved, and operator guidance distinguishes reconciliation from `adv_change_status_repair`. | pass | cleanup_merged moved to worktree_cleanup mode=archived_branches; archive_repair enum now scan/redrive/reconcile only; decision matrix documented. |
| AC6 | acceptance_criterion | `adv_backlog_state` accurately describes its relationship to `adv_roadmap`. | pass | backlog.ts description fixed; 2 description-guard tests assert accurate text. |
| AC7 | acceptance_criterion | Each registered mutation tool has an explicit ownership/reachability classification: orchestrator, operator-only, or removed. | pass | docs/tool-ownership.md classifies 80 tools as orchestrator/operator-only/dual; rq-toolOwnership01 + 6 asset tests. |
| AC8 | acceptance_criterion | `adv_project_metadata.write` and snapshot-repair audit storage each have an explicit retained purpose plus producer/reader, or the unused mutation surface is removed. | pass | project_metadata.write description names scan-result producers; audit_history reader wired. |
| AC9 | acceptance_criterion | `adv_store_cleanup` returns bounded aggregate counts and paged/delete-only review data while preserving exact-plan hash, approval, lock, manifest, and retry safety. | pass | StoreCleanupPlan has summary block + offset/limit pagination + has_more; hash determinism test proves paged=full. |
| AC10 | acceptance_criterion | Store cleanup/consolidation coupling and indefinite maintenance status are specified and documented. | pass | rq-storeCleanupCoupling01 spec added: mutual serialization, lock refusal, manifest-before-delete, indefinite retention. 5 scenarios. |
| AC11 | acceptance_criterion | Tool catalog, triage schema, setup/project/readme/store-consolidation docs, and stale fixture references match runtime behavior. | pass | Backlog_state, project_metadata, store-consolidation docs, project.md, fixtures corrected; description-guard tests pass. |
| C1 | constraint | Preserve the typed post-Agenda replacement model; do not restore Agenda workflow authority. | respected | No Agenda tools restored; typed replacements preserved. |
| C2 | constraint | Do not add tools solely to satisfy stale prose; prefer retiring invalid laws. | respected | Purge implemented per existing rq-archivePurge01 spec, not invented. |
| C3 | constraint | Do not weaken approval, recovery, cleanup, or release safety boundaries. | respected | All approval/evidence/dry-run/lock/idempotency gates retained. |
| C4 | constraint | Cleanup must remain limited to provably obsolete legacy files and must be reviewable before execution. | respected | Cleanup limited to agenda.jsonl; summary/pagination improves reviewability. |
| C5 | constraint | Maintenance tools remain operator-only; they are discoverable but not routine autonomous agent actions. | respected | Maintenance tools documented as operator-only in ownership matrix. |
| C6 | constraint | Legacy cleanup is retained indefinitely as operator-only maintenance. | respected | rq-storeCleanupCoupling01 documents indefinite operator-only retention. |
| C7 | constraint | Compatibility parsing remains explicit and read-only; new mutation paths reject retired legacy sources. | respected | No new mutation accepts Agenda sources; parse-only retained. |
| C8 | constraint | Conflict detection and validation must fail closed on incomplete inventory. | respected | Conflict detection unchanged; typed inventory preserved. |
| DONT1 | avoidance | Do not introduce a tool merely because a stale spec mentions it. | respected | Purge spec-backed; no tool added solely for stale prose. |
| DONT2 | avoidance | Do not merge distinct recovery paths without preserving their evidence requirements. | respected | Archive repair split preserves each action's evidence gates; no recovery paths merged. |
| DONT3 | avoidance | Do not turn historical docs/archives into active runtime contracts. | respected | Historical archives untouched; only active specs amended. |
| DONT4 | avoidance | Do not delete legacy state beyond approved obsolete `agenda.jsonl` files. | respected | No legacy state deleted beyond approved agenda.jsonl cleanup. |
| DONT5 | avoidance | Do not make maintenance tools routine autonomous agent actions. | respected | Ownership matrix documents operator-only; no autonomous agent routing added. |
| DONT6 | avoidance | Do not expose secrets or unrelated project data through repair-audit reads. | respected | Audit_history project-scoped with bounded limit; no cross-project data. |
| OOS1 | out_of_scope | Restoring a generic Agenda queue or `adv_agenda_*` tools. | not_applicable | No Agenda queue restored. |
| OOS2 | out_of_scope | Changing typed change/task/Epic/ops ownership without contradiction evidence. | not_applicable | No typed ownership semantics changed. |
| OOS3 | out_of_scope | Broad redesign of aligned Temporal, conformance, worktree, or backlog behavior. | not_applicable | No broad Temporal/conformance/worktree/backlog redesign. |

