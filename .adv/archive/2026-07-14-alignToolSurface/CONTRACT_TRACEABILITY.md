# Contract Traceability

**Change ID:** alignToolSurface
**Contract Version:** 1
**Rigor:** strict
**Reviewed:** 2026-07-14T22:45:17.432Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Tool ownership matrix (docs/tool-ownership.md) classifies all 80 registered tools; rq-toolOwnership01 spec + 6 asset tests enforce. |
| SC2 | success_criterion | pass | review | Archive purge, archive repair, store cleanup, snapshot repair all retain approval/evidence/lock/manifest gates. |
| SC3 | success_criterion | pass | review | Agenda retired from 17 spec/asset/doc files; parse-only compatibility retained; no adv_agenda_* registered. |
| AC1 | acceptance_criterion | pass | test | adv_archive_purge implemented per rq-archivePurge01: default preserves bundle, opt-in deletes, refuses non-archived. 10 tests pass. |
| AC2 | acceptance_criterion | pass | test | rq-snapshotHealthRepairWhitelist01 amended to 4 actions; parity test asserts runtime=spec. |
| AC3 | acceptance_criterion | pass | test | audit_history action wired to listSnapshotRepairAudits; 7 tests cover bounding, project-scoping, empty. |
| AC4 | acceptance_criterion | pass | test | rq-subagentReports03/08/14/22, rq-backlogCoord09.5 amended; 17 files updated; 95 tests pass. |
| AC5 | acceptance_criterion | pass | test | cleanup_merged moved to worktree_cleanup mode=archived_branches; archive_repair enum now scan/redrive/reconcile only; decision matrix documented. |
| AC6 | acceptance_criterion | pass | test | backlog.ts description fixed; 2 description-guard tests assert accurate text. |
| AC7 | acceptance_criterion | pass | test | docs/tool-ownership.md classifies 80 tools as orchestrator/operator-only/dual; rq-toolOwnership01 + 6 asset tests. |
| AC8 | acceptance_criterion | pass | test | project_metadata.write description names scan-result producers; audit_history reader wired. |
| AC9 | acceptance_criterion | pass | test | StoreCleanupPlan has summary block + offset/limit pagination + has_more; hash determinism test proves paged=full. |
| AC10 | acceptance_criterion | pass | test | rq-storeCleanupCoupling01 spec added: mutual serialization, lock refusal, manifest-before-delete, indefinite retention. 5 scenarios. |
| AC11 | acceptance_criterion | pass | test | Backlog_state, project_metadata, store-consolidation docs, project.md, fixtures corrected; description-guard tests pass. |
| C1 | constraint | respected | static_check | No Agenda tools restored; typed replacements preserved. |
| C2 | constraint | respected | static_check | Purge implemented per existing rq-archivePurge01 spec, not invented. |
| C3 | constraint | respected | static_check | All approval/evidence/dry-run/lock/idempotency gates retained. |
| C4 | constraint | respected | static_check | Cleanup limited to agenda.jsonl; summary/pagination improves reviewability. |
| C5 | constraint | respected | static_check | Maintenance tools documented as operator-only in ownership matrix. |
| C6 | constraint | respected | static_check | rq-storeCleanupCoupling01 documents indefinite operator-only retention. |
| C7 | constraint | respected | static_check | No new mutation accepts Agenda sources; parse-only retained. |
| C8 | constraint | respected | static_check | Conflict detection unchanged; typed inventory preserved. |
| DONT1 | avoidance | respected | review | Purge spec-backed; no tool added solely for stale prose. |
| DONT2 | avoidance | respected | review | Archive repair split preserves each action's evidence gates; no recovery paths merged. |
| DONT3 | avoidance | respected | review | Historical archives untouched; only active specs amended. |
| DONT4 | avoidance | respected | review | No legacy state deleted beyond approved agenda.jsonl cleanup. |
| DONT5 | avoidance | respected | review | Ownership matrix documents operator-only; no autonomous agent routing added. |
| DONT6 | avoidance | respected | review | Audit_history project-scoped with bounded limit; no cross-project data. |
| OOS1 | out_of_scope | not_applicable | not_applicable | No Agenda queue restored. |
| OOS2 | out_of_scope | not_applicable | not_applicable | No typed ownership semantics changed. |
| OOS3 | out_of_scope | not_applicable | not_applicable | No broad Temporal/conformance/worktree/backlog redesign. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-f4f897b8d9da | AC2, AC3, AC8 |  | C3, DONT6 |  |
| tk-cc01f7ee43f2 | AC5 |  | C3, DONT2 |  |
| tk-587cd262c227 | AC4 |  | C1, C7, DONT3 |  |
| tk-bd29c569a061 | AC1 |  | C2, C3, DONT1 |  |
| tk-8931b16b656c | AC6, AC8, AC11 |  | C5 |  |
| tk-936177b08749 | AC7 |  | C5 |  |
| tk-5901a0f44af3 | AC9, AC10 |  | C4, C6 |  |
| tk-783c59dbf8f7 |  | AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC9, AC10, AC11, SC1, SC2, SC3 | C1, C2, C3, C4, C5, C6, C7, C8, DONT1, DONT2, DONT3, DONT4, DONT5, DONT6 |  |
