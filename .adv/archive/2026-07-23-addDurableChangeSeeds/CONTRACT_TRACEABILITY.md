# Contract Traceability

**Change ID:** addDurableChangeSeeds
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-23T17:52:09.866Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | packet stored on shell/backlog records (workflow-free primitives); no Temporal workflow spawned for packet persistence |
| SC2 | success_criterion | pass | review | epic.test.ts promotion injects packet verbatim without re-derivation; 77 pass |
| SC3 | success_criterion | pass | review | adv_status future_work + bin/adv roadmap project backlog items independent of Epic membership |
| AC1 | acceptance_criterion | pass | test | types/epics.ts EpicShellEntrySchema has optional context_packet; future-work.test.ts confirms existing shells parse unchanged |
| AC2 | acceptance_criterion | pass | test | types/backlog.ts BacklogItemSchema has optional context_packet; future-work.test.ts confirms existing items parse unchanged |
| AC3 | acceptance_criterion | pass | test | context-packet-validation.test.ts: assertPacketSize 16KiB + per-field bounds; 12 pass (adv_run_test tr_mrxt15qs) |
| AC4 | acceptance_criterion | pass | test | epic.test.ts promotion injects packet into proposal seed ## Future-Work Context appendix verbatim with provenance; 77 pass (tr_mrxt1p2k) |
| AC5 | acceptance_criterion | pass | test | status.test.ts future_work projection additive in summary/hygiene views; 60 pass (tr_mrxt1f9b) |
| AC6 | acceptance_criterion | pass | test | bin/lib/roadmap.test.ts [ctx] markers + ## Backlog section; bun test bin/ 300 pass (tr_mrxt14sp) |
| AC7 | acceptance_criterion | pass | test | adv_epic_add_shell + adv_backlog_add accept optional context_packet; epic.test.ts + backlog-shell.test.ts 13 pass (tr_mrxt1ozq) |
| AC8 | acceptance_criterion | pass | test | adv_backlog_promote remains pure record op (backlog-store.ts/backlog-shell.ts); packet agent-mediated via adv_change_create on promotion |
| AC9 | acceptance_criterion | pass | test | validation (parsePacket/assertPacketSize) ignores target_path; promotion requires normal target_path confirmation — never auto-authorized |
| C1 | constraint | respected | static_check | assertPacketSize 16384 + assertEpicAggregatePackets 262144 enforced at add_shell/promotion; context-packet-validation.test.ts |
| C2 | constraint | respected | static_check | clean seam — packet content (this change) separate from graph topology (addDependencyAwareResume, already on trunk) |
| C3 | constraint | respected | static_check | additive .optional() Zod field; no migration; existing JSONL/Epic projections parse unchanged (AC1/AC2) |
| C4 | constraint | respected | static_check | replaceRecoveryToolSprawl archived 2026-07-15 (precondition cleared, not re-verified here) |
| DONT1 | avoidance | respected | review | stored cross_project_target.target_path never treated as auth; promotion requires confirmation (AC9) |
| DONT2 | avoidance | respected | review | title/success_hint stay outside packet; packet is a separate field, semantics untouched |
| DONT3 | avoidance | respected | review | no unified entity; backlog JSONL, Epic-shell projection, active Change remain separate stores; packet copied on promotion |
| DONT4 | avoidance | respected | review | Epic membership not mandatory; future_work projects backlog items independent of Epic (SC3) |
| DONT5 | avoidance | respected | review | only context_packet added to existing add/promote tools; no new mutation verbs |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-649815514f74 | AC1, AC2, SC1 |  | C2, C3, DONT2, DONT3 |  |
| tk-c59149a602d5 | AC3 | C1 |  |  |
| tk-947e389cdd48 | AC6 |  |  |  |
| tk-5db2144410df | AC5 | SC3 | DONT4 |  |
| tk-07ff92e24f08 | AC7, SC1 |  | DONT5 |  |
| tk-9172fe42d793 | AC4 | SC2 |  |  |
| tk-f97646415c28 |  | AC8, AC9, SC1, SC2, SC3 | DONT1 |  |
