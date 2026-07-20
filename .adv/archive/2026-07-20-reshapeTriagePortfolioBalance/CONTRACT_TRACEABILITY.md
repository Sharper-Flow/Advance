# Contract Traceability

**Change ID:** reshapeTriagePortfolioBalance
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-20T22:12:00.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | .opencode/command/adv-triage.md:7,182 MUST NOT generate/echo/stage/commit/push ROADMAP.md or .adv/roadmap-snapshot.json. plugin/src/adv-triage-portfolio-assets.test.ts:49-56 asserts absence. Run tr_mrtrx936_ab56b5f4 (15 files/408 tests). |
| AC2 | acceptance_criterion | pass | test | plugin/src/tools/triage/coalesce.ts:64-150 three-tier classifier; adv-triage.md:105-138 Tier B approval gate. triage-coalesce.test.ts:39-116. Run tr_mrtrx936_ab56b5f4. |
| AC3 | acceptance_criterion | pass | test | plugin/src/tools/triage/portfolio-report.ts:73-140 emits exactly three sections; /adv-cleanup ownership preserved. triage-portfolio-report.test.ts:4-109. Run tr_mrtrx936_ab56b5f4. |
| AC4 | acceptance_criterion | pass | test | Post-remediation commit e2d63fa0: rg 'adv_roadmap' across plugin/src, bin, .opencode, skills returns zero matches. Count invariant UNNAMED_CONTRACTED_REMOVALS preserves reintroduction guard. Run tr_mrtrx936_ab56b5f4. |
| AC5 | acceptance_criterion | pass | test | Deltas modify rq-backlogCoord01/02/03/05/07/08 + rq-roadmapCliBridge01 (retirement) + add rq-AwB1gN3w01. AC5 accepts 'modified or removed'. schemas:check tr_mrtpmbgt_7b374c54. Origin rejection tr_mrtpftgy_a8808554. |
| AC6 | acceptance_criterion | pass | test | Phases 1-4 tests in tr_mrtrx936_ab56b5f4. No regression in unchanged phases. |
| AC7 | acceptance_criterion | pass | test | triage-coalesce.test.ts, triage-portfolio-report.test.ts, adv-triage-portfolio-assets.test.ts added. All in tr_mrtrx936_ab56b5f4. |
| AC8 | acceptance_criterion | pass | test | bin/adv no roadmap subcommand (bun test tr_mrtrh1vg_81a57211 16/0). .opencode/command/adv-roadmap.md deleted. cli-bridge-contract.test.ts:29-35 updated. |
| AC9 | acceptance_criterion | pass | test | adv_change_validate at 2026-07-20T22:06:50 returned passed:true, 0 errors, 4 advisory warnings. |
| AC10 | acceptance_criterion | pass | test | bin/oc-test targeted tr_mrtrx936_ab56b5f4: 15 files/408 tests. Bun CLI tr_mrtrh1vg_81a57211: 16 tests. |
| C1 | constraint | respected | static_check | coalesce.ts:99-108 heuristics advisory only; adv-triage.md:127-184 approval grammar. |
| C2 | constraint | respected | static_check | portfolio-report.ts:42-139 Cleanup-needed section emits counts+IDs only; points to /adv-cleanup. |
| C3 | constraint | respected | static_check | Phase 4c bug-priority loop unchanged; priority:* label semantics preserved. |
| C4 | constraint | respected | static_check | GH Projects v2 remains canonical; no field schema changes. |
| C5 | constraint | respected | static_check | adv-triage.md Phases 1-4 unchanged; only Phase 5/6/7 replaced. |
| C6 | constraint | respected | static_check | adv-triage.md:105-138 Tier B batched approval required before any update_issues mutation. |
| C7 | constraint | respected | static_check | All sweeps routed via bin/oc-test targeted; adv_run_test for single-file tight loops. |
| C8 | constraint | respected | static_check | trunk-write-firewall.ts: only ROADMAP.md and .adv/roadmap-snapshot.json removed; CHANGELOG.md entry preserved. |
| C9 | constraint | respected | static_check | types/changes.ts retains 'roadmap' as readable enum; create/repair reject with ORIGIN_KIND_ROADMAP_RETIRED. |
| DONT1 | avoidance | respected | review | portfolio-report.ts:73-140 Open-issues-worth-solving section surfaces unrepresented issues. |
| DONT2 | avoidance | respected | review | portfolio-report.ts:42-139 /adv-triage emits counts+IDs only; closure delegates to /adv-cleanup. |
| DONT3 | avoidance | respected | review | coalesce.ts + adv-triage.md:105-138 every pair requires explicit Tier B approval. |
| DONT4 | avoidance | respected | review | No new GH Project scoring fields; features sortable by issue# and priority labels only. |
| DONT5 | avoidance | respected | review | Explicit design decision: origin_kind 'roadmap' kept as readable enum, rejected on create/repair. |
| DONT6 | avoidance | respected | review | adv-triage.md has no --no-commit flag; no commit step exists. |
| DONT7 | avoidance | respected | review | portfolio-report.ts caps display at 10 rows per section with '(N more not shown)' indicator. |
| OOS1 | out_of_scope | missing | not_applicable |  |
| OOS2 | out_of_scope | missing | not_applicable |  |
| OOS3 | out_of_scope | missing | not_applicable |  |
| OOS4 | out_of_scope | missing | not_applicable |  |
| OOS5 | out_of_scope | missing | not_applicable |  |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-461478a5da3e | AC1, AC2, AC3 |  | C1, C2, C5, C6 |  |
| tk-b706e30aac1b | AC5 |  | C4, C9 |  |
| tk-e9eb77967307 | AC5, AC6 |  | C9 |  |
| tk-6f88d0bc0579 | AC5 |  | C9 |  |
| tk-e1777fef95ee | AC4 |  | C8 |  |
| tk-8c79de8774f9 | AC4, AC8 |  | C8 |  |
| tk-cd25afde9412 | AC4 |  | C9 |  |
| tk-a7a651f030c9 | AC4, AC5, AC6, AC7 |  | C7 |  |
| tk-541561195155 | AC1, AC2, AC3 |  | C1, C6 |  |
| tk-1bffe3fb1e24 | AC2, AC3, AC7 |  | C1, C7 |  |
| tk-f5f47b588b1b | AC10 |  | C7 |  |
| tk-1d0bf5d086c9 | AC9, AC10 | AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8 |  |  |
