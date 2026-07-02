# Contract Traceability

**Change ID:** addOpsRunbooks
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-02T19:23:19.753Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | OpsRun schemas, workflow signals/reducers, adv_ops_run_upsert, adv_ops_run_evidence_add, and command contracts implement plan→approval→evidence→health→rollback/cleanup path. Verified by ops-evidence, change-state, workflow, gate-readiness, asset tests; smoke/full/build pass. |
| SC2 | success_criterion | pass | review | Runbook state persists in ops_followup.runs and compact readbacks expose bounded run summaries. Verified by backlog/change readback tests and full suite. |
| SC3 | success_criterion | pass | review | Release/readback/archive surfaces use status_source/completion_proof/resolution and getOpenOpsFollowupObligations. Verified by gate-readiness, backlog, change, archive phase9, review/harden/archive command asset tests. |
| SC4 | success_criterion | pass | review | Existing ops_followup evidence remains default-readable; runs defaults to [] and legacy compact evidence remains supported. Verified by schema/legacy tests and smoke/full suite. |
| SC5 | success_criterion | pass | review | Tool preflight rejects unapproved prod execute evidence and secret-like material in summary/artifact/completion fields; no raw log field exists in schemas. Verified by ops-evidence tests and reviewer hardening tests. |
| AC1 | acceptance_criterion | pass | test | adv_ops_run_upsert requires env, action, bounds, evidence_policy, rollback_or_cleanup_plan, steps with approval_policy. Tests cover run creation/upsert and readbacks. |
| AC2 | acceptance_criterion | pass | test | Prod execute evidence without matching approval evidence is rejected unless bounded autonomous policy is present. Verified by ops-evidence tests. |
| AC3 | acceptance_criterion | pass | test | bounded_low_risk_autonomous policy requires rationale and bounds; unclassified prod execute defaults to approval_required. Verified by schemas/tool preflight and ops-evidence tests. |
| AC4 | acceptance_criterion | pass | test | adv_ops_run_evidence_add records step kind, env, run/batch, status, bounded summary, artifact pointer/rationale, next_status and appends evidence. Verified by reducer/workflow/tool tests. |
| AC5 | acceptance_criterion | pass | test | Complete proof requires completion_signal, health_verification, rollback_or_cleanup_disposition through resolution/readiness helpers. Verified by gate-readiness and archive/readback tests. |
| AC6 | acceptance_criterion | pass | test | Compact link readbacks and open obligations expose status_source/completion_proof; release blockers reject stale parent complete without child proof. Verified by gate-readiness, backlog, change list, archive tests. |
| AC7 | acceptance_criterion | pass | test | Legacy ops follow-up profiles/evidence remain readable; adv_followup_promote seeds runs: [] and adv_ops_evidence_add path retained. Verified by legacy schema, followup, ops evidence, full suite. |
| AC8 | acceptance_criterion | pass | test | Secret-like evidence in summary, artifact URI/summary/rationale, completion signal, health verification, and disposition is rejected; schemas accept pointers/rationales only. Verified by ops-evidence hardening test. |
| C1 | constraint | respected | static_check | Approval/evidence/run status/release authority implemented via Zod schemas, tool preflight, Temporal reducers, and readiness checks; heuristics not used as authority. |
| C2 | constraint | respected | static_check | No PM ownership/sprint/board workflow added. Work stays under existing ADV changes/tasks/ops_followup tools and command contracts. |
| C3 | constraint | respected | static_check | Seven-gate flow preserved; new tools integrate with existing ops_followup/task/review/harden/archive flow. Gate/status tests and full suite pass. |
| C4 | constraint | respected | static_check | Bounded evidence enforced structurally by schema/tool preflight and secret-like rejection tests; raw log field absent. |
| C5 | constraint | respected | static_check | Existing profiles/evidence/links remain readable with optional defaulted runs and optional resolution. Legacy tests pass. |
| C6 | constraint | respected | static_check | Design chose extending ops_followup with nested runs and verified-at-read resolution before implementation; implementation follows that design. |
| DONT1 | avoidance | respected | review | Approval/completion proof lives in workflow state, tools, run evidence, and resolution fields; command docs forbid chat transcript source of truth. |
| DONT2 | avoidance | respected | review | Unapproved production-impacting execute evidence is rejected by ops run tool preflight; tests pass. |
| DONT3 | avoidance | respected | review | Readiness/open obligations use resolution/status_source/completion_proof; stale parent status alone blocks/unverified. Tests pass. |
| DONT4 | avoidance | respected | review | No raw-log field added; unsafe secret-like evidence rejected in tool tests. |
| DONT5 | avoidance | respected | review | No separate PM workflow added; no owners/sprints/boards introduced. |
| OOS1 | out_of_scope | not_applicable | not_applicable | No PokeEdge or PokeEdge-Web production infrastructure changed. |
| OOS2 | out_of_scope | not_applicable | not_applicable | No ownership, sprint, board, or assignment workflows added. |
| OOS3 | out_of_scope | not_applicable | not_applicable | Implementation files/tasks were chosen after design/prep gates, not before. |
| OOS4 | out_of_scope | not_applicable | not_applicable | Temporal and seven-gate workflow retained; no replacement attempted. |
| OOS5 | out_of_scope | not_applicable | not_applicable | No deep external market research performed; work stayed internal workflow capability. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-46e32931df8f | SC1, SC2, SC3, SC4, SC5, AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8 | C1, C3 | C2, C4, C5, C6, DONT1, DONT2, DONT3, DONT4, DONT5, OOS1, OOS2, OOS4 |  |
| tk-1201b447122c | SC1, SC2, SC4, SC5, AC1, AC3, AC4, AC5, AC7, AC8 | AC7, AC8 | C1, C3, C4, C5, DONT1, DONT4, OOS2, OOS4 |  |
| tk-a42fc719ff64 | SC1, SC2, SC4, SC5, AC1, AC2, AC3, AC4, AC5, AC7 | AC2, AC4, AC5, AC7 | C1, C3, C4, C5, DONT1, DONT2, DONT4, OOS4 |  |
| tk-f9a9fe6c0258 | SC1, SC2, SC5, AC1, AC2, AC3, AC4, AC5, AC8 | AC1, AC2, AC3, AC4, AC8 | C1, C3, C4, DONT1, DONT2, DONT4, DONT5 |  |
| tk-103432774e43 | SC3, SC5, AC5, AC6 | AC5, AC6 | C1, C3, C5, DONT2, DONT3, DONT5 |  |
| tk-64ae1951ca1a | SC2, SC3, SC4, AC5, AC6, AC7 | AC6, AC7 | C1, C4, C5, DONT1, DONT3, DONT4 |  |
| tk-35f75fd86f9f | SC1, SC2, SC3, SC5, AC1, AC2, AC3, AC4, AC5, AC6, AC8 | C2, C4 | C1, C2, C3, C4, DONT1, DONT2, DONT4, DONT5, OOS2 |  |
| tk-18658992f914 |  | SC1, SC2, SC3, SC4, SC5, AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8 | C1, C2, C3, C4, C5, C6, DONT1, DONT2, DONT3, DONT4, DONT5, OOS1, OOS2, OOS3, OOS4, OOS5 |  |
