# Archive Briefing Digest

**Change ID:** reshapeTriagePortfolioBalance
**Title:** Reshape triage portfolio balance
**Status:** archived
**Generated:** 2026-07-20T22:15:51.177Z

## Identity Anchors

- CHANGE
- STATUS
- TERMINAL_GATE_SUMMARY

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

Showing 7 of 7 durable facts.

- **[unresolved_action]** required_main_agent_actions: Present AC4 scope drift to user via Tier A inline approval per docs/scope-discovery-protocol.md.
- **[unresolved_action]** required_main_agent_actions: On approve: amend AC4 to exempt tombstone/deletion-test references, then reenter from discovery via adv_change_reenter and resume review; on split: create fast-follow via adv_change_create parent_change_id: reshapeTriagePortfolioBalance; on reject: retain AC4 and remove references only if a non-evasive test strategy is approved.
- **[unresolved_action]** required_main_agent_actions: Correct AC5 through authorized ADV delta mutation: delta-remove rq-backlogCoord05, rq-backlogCoord07, rq-roadmapCliBridge01; then rerun validation.
- **[unresolved_action]** required_main_agent_actions: Reconcile request/agreement matrix cardinality. Tool schema rejected the requested task-scoped report and contract_review_input key; persisted independent change scope is enforced fallback.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] Retirement contracts need an explicit exception for tests/tombstones if a literal no-reference grep is also an acceptance criterion; otherwise the test that proves removal violates the criterion.
- **[unresolved_action]** scope_drift: stop_and_report: AC4's literal prohibition of all plugin/src `adv_roadmap` references conflicts with retained removal/tombstone test evidence. Removing or obfuscating those semantic references would change acceptance meaning rather than safely remediate code.
- **[archive_only_evidence]** verification: tests_run= results=n/a — Static review; no safe repo remediation. Prior packet evidence: tr_mrtrhqnl_a9a008e2 (14 files / 382 Phase 1–4 tests), tr_mrtrh1vg_81a57211 (targeted sweep), adv_change_validate strict passed:true/0 errors/4 advisory warnings. Citations: adv-triage.md:105-138 approval; coalesce.ts:64-112,123-150; portfolio-report.ts:73-140; triage-coalesce.test.ts:39-116; triage-portfolio-report.test.ts:4-109; bin roadmap grep no hits; adv-roadmap.md absent. contract_review_input (serialized because report schema rejects this requested key): {"AC1":"pass: adv-triage.md:7,142-184","AC2":"pass: coalesce.ts:64-150; adv-triage.md:105-138","AC3":"pass: portfolio-report.ts:73-140","AC4":"fail: tool-registry.inventory.test.ts:70-74,292-293; latent-tool-removal.test.ts:18-19,46","AC5":"fail: tk-b706e30aac1b verification vs agreement AC5","AC6":"pass: tool-arg-preflight.ts:718-765,785-819","AC7":"pass: tr_mrtrhqnl_a9a008e2","AC8":"pass: triage-coalesce.test.ts:39-116; triage-portfolio-report.test.ts:4-109","AC9":"pass: cli-bridge-contract.test.ts:29-35; docs/cli-surface-matrix.md:156-169","AC10":"pass: validate evidence","AC11":"pass: tr_mrtrh1vg_81a57211","C1-C10":"respected: adv-triage.md:7,89-184; coalesce.ts:99-108; change.ts:1461-1492","DONT1-DONT9":"respected: adv-triage.md:127-184; portfolio-report.ts:42-139; roadmap-origin-sanitize.ts:85","OOS1-OOS6":"respected: git diff --name-status merge-base(trunk,HEAD); no cleanup/update-issues/backlog/Projects schema scope expansion"}

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
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| C4 | constraint | respected |
| C5 | constraint | respected |
| C6 | constraint | respected |
| C7 | constraint | respected |
| C8 | constraint | respected |
| C9 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |
| DONT4 | avoidance | respected |
| DONT5 | avoidance | respected |
| DONT6 | avoidance | respected |
| DONT7 | avoidance | respected |
| OOS1 | out_of_scope | missing |
| OOS2 | out_of_scope | missing |
| OOS3 | out_of_scope | missing |
| OOS4 | out_of_scope | missing |
| OOS5 | out_of_scope | missing |

## Unresolved Actions

- Present AC4 scope drift to user via Tier A inline approval per docs/scope-discovery-protocol.md.
- On approve: amend AC4 to exempt tombstone/deletion-test references, then reenter from discovery via adv_change_reenter and resume review; on split: create fast-follow via adv_change_create parent_change_id: reshapeTriagePortfolioBalance; on reject: retain AC4 and remove references only if a non-evasive test strategy is approved.
- Correct AC5 through authorized ADV delta mutation: delta-remove rq-backlogCoord05, rq-backlogCoord07, rq-roadmapCliBridge01; then rerun validation.
- Reconcile request/agreement matrix cardinality. Tool schema rejected the requested task-scoped report and contract_review_input key; persisted independent change scope is enforced fallback.
- stop_and_report: AC4's literal prohibition of all plugin/src `adv_roadmap` references conflicts with retained removal/tombstone test evidence. Removing or obfuscating those semantic references would change acceptance meaning rather than safely remediate code.
