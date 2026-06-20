# Contract Traceability

**Change ID:** addOpsFollowUpTraceability
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-06-20T05:18:20.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | adv-reviewer acceptance report verdict READY; adv_change_show/adv_change_list/adv_wip_state expose structural ops follow-up readback; bin/oc-test full passed. |
| SC2 | success_criterion | pass | review | Release/archive handoff tests passed in bin/oc-test full; archive output surfaces open non-blocking obligations. |
| SC3 | success_criterion | pass | review | src/tools/ops-evidence.test.ts and full suite passed; reviewer targeted ops evidence/gate tests passed. |
| SC4 | success_criterion | pass | review | Gate-readiness tests passed; existing required-critical coverage preserved; full suite passed. |
| AC1 | acceptance_criterion | pass | test | Ops follow-up schemas/signals/reducer tests passed; ChangeSchema includes typed source, relationship, status, timestamps. |
| AC2 | acceptance_criterion | pass | test | adv_followup_promote tests and subagent-report promotion paths passed; source identity uses report/agenda/manual structural fields. |
| AC3 | acceptance_criterion | pass | test | adv_ops_evidence_add tests passed; schema supports env, action, batch, status, summary, next_step, completion_signal, recorded_at/id. |
| AC4 | acceptance_criterion | pass | test | Ops evidence/status enum tests passed for partial, failed, rerun_needed, rollback_needed, cleanup_needed, complete. |
| AC5 | acceptance_criterion | pass | test | Archive/release handoff tests passed; change archive output includes open ops obligations. |
| AC6 | acceptance_criterion | pass | test | temporal/gate-readiness and tools/gate.release-enforcement tests passed; full suite passed. |
| AC7 | acceptance_criterion | pass | test | backlog/wip readback tests passed; compact ops annotations derive from structural state/projections. |
| AC8 | acceptance_criterion | pass | test | adv_followup_promote creates child profile and parent/source link with target project/path fields; reviewer verdict READY. |
| AC9 | acceptance_criterion | pass | test | Full suite passed; existing enforceCriticalOpsPlanning/checkCriticalOpsCoverage tests remain green. |
| AC10 | acceptance_criterion | pass | test | Spec asset tests, schemas:check, pnpm run check, pnpm run build, and bin/oc-test full passed. |
| C1 | constraint | respected | static_check | Design/implementation uses normal ADV changes plus lightweight ops profile, not a separate project-management object. |
| C2 | constraint | respected | static_check | Gate-readiness tests distinguish blocks vs follows_release/monitors/cleanup_after. |
| C3 | constraint | respected | static_check | Promotion/readback uses typed source/link/evidence schemas; agenda ID only legacy/fallback provenance. |
| C4 | constraint | respected | static_check | Tools create/update links and evidence structurally; no manual bookkeeping workflow required after promotion/evidence append. |
| C5 | constraint | respected | static_check | OpsFollowupKind covers migration/backfill/deploy_config/monitoring/cleanup/teardown/docs/other-like enablers without product-specific fields. |
| C6 | constraint | respected | static_check | Zod schemas, workflow signals, reducers, and tests own transitions; title matching not used for correctness. |
| C7 | constraint | respected | static_check | No human checkpoint or approval-boundary changes introduced; ADV gates unchanged. |
| C8 | constraint | respected | static_check | Evidence schema is append-only and compact; no heavyweight runbook system introduced. |
| C9 | constraint | respected | static_check | Relationship enum labels are agent-context labels: blocks, follows_release, monitors, cleanup_after. |
| C10 | constraint | respected | static_check | Design evaluated runbook-shaped evidence and chose lightweight evidence entries only. |
| DONT1 | avoidance | respected | review | Readback/promotion paths use typed state and source IDs; no agenda text search authority added. |
| DONT2 | avoidance | respected | review | Duplicate promotion uses structural source identity, not title similarity. |
| DONT3 | avoidance | respected | review | Promotion/evidence tools update authoritative state automatically. |
| DONT4 | avoidance | respected | review | Required follow-ups can become linked ADV changes with ops profile and release handoff. |
| DONT5 | avoidance | respected | review | Gate-readiness tests allow non-blocking release-first links with handoff. |
| DONT6 | avoidance | respected | review | No new KeywordList search attribute introduced; Visibility remains advisory/minimal. |
| DONT7 | avoidance | respected | review | Filterable/collision state remains in workflow/projections/search attributes; Temporal Memo not used for correctness. |
| OOS1 | out_of_scope | respected | not_applicable | No general project-management system added. |
| OOS2 | out_of_scope | respected | not_applicable | No GitHub Issues/Projects or incident/runbook replacement built. |
| OOS3 | out_of_scope | respected | not_applicable | Only promoted/linked ops follow-ups get profile; optional advisory items not all required. |
| OOS4 | out_of_scope | respected | not_applicable | Release logic distinguishes blocking from non-blocking links. |
| OOS5 | out_of_scope | respected | not_applicable | No PokeEdge-specific migration logic present. |
| OOS6 | out_of_scope | respected | not_applicable | No product-specific migrations/backfills designed or run. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-48ee9b22b1c3 | AC10, C6, C9, C10 | AC10 | DONT1, DONT2, DONT3, DONT4, DONT5, DONT6, DONT7, OOS1, OOS2, OOS3, OOS4, OOS5, OOS6 |  |
| tk-3aa2582f3e73 | AC1, AC3, AC4, AC8, SC3, C6 | AC1, AC3, AC4, AC8 | DONT1, DONT2, DONT3, DONT6, DONT7 |  |
| tk-ac8dbac8b723 | AC1, AC2, AC8, SC1, C4, C6 | AC1, AC2, AC8 | DONT1, DONT2, DONT3, DONT4, DONT6 |  |
| tk-9f5e7c78df88 | AC3, AC4, SC3, C8, C10 | AC3, AC4 | DONT1, DONT2, DONT3 |  |
| tk-306e14486da2 | AC7, AC8, SC1, C6 | AC7, AC8, SC1 | DONT1, DONT2, DONT6, DONT7 |  |
| tk-b427160501a4 | AC5, AC6, AC9, SC2, SC4, C2, C7 | AC5, AC6, AC9 | DONT4, DONT5, DONT6, DONT7 |  |
| tk-2d32b4d9b2d4 | AC10 | SC1, SC2, SC3, SC4, AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC9, AC10 | C1, C2, C3, C4, C5, C6, C7, C8, C9, C10, DONT1, DONT2, DONT3, DONT4, DONT5, DONT6, DONT7, OOS1, OOS2, OOS3, OOS4, OOS5, OOS6 |  |
