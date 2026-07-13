# Contract Traceability

**Change ID:** fixChangeStatusHonesty
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-13T22:35:00.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | change.test.ts phase-projection tests (3/3 GREEN tr_mrjn9nao): never-started→proposal, mid-execution→execution, release-complete-open→released are distinct; archived/closed render themselves; hint-less rows omit phase. Independent reviewer confirmed all 6 projection sites derive currentGate consistently. |
| AC2 | acceptance_criterion | pass | test | change.test.ts: status:"active" and "pending" rejected with actionable hint (Zod superRefine + handler boundary check); draft/in-flight/default return identical open set on warm listSummary + cold Visibility paths. Reviewer confirmed parity retained. |
| AC3 | acceptance_criterion | pass | test | change.test.ts open-scan regression: default/in-flight list surfaces existing open changes (no false empty). The /adv-cleanup footgun (status:"active"→0 rows) is structurally eliminated. |
| AC4 | acceptance_criterion | pass | test | changes.status-enum.test.ts: ChangeStatusSchema.parse("active")/"pending" now throw; enum = draft/archived/closed. json.test.ts: legacy active/pending record loads as draft without ZodError (normalizer at json.ts:143 precedes ChangeSchema.parse at L493). Reviewer confirmed normalizer precedes parse and seeding. |
| AC5 | acceptance_criterion | pass | test | backlog-coordination-regression + visibility-claim-queries + visibility-epic-queries + list-change-workflows all green (tr_mrjsqjta, 261 tests). Reviewer confirmed open scans route through AdvLifecycleState="open" AND ExecutionStatus="Running"; AdvChangeStatus never elevated to authority. |
| C1 | constraint | respected | static_check | Spec delta on advance-workflow/rq-changeLifecycleState01 reaffirms AdvChangeStatus is read-model, never open-claim authority. DEFAULT_STATUSES narrowed to ["draft"] together so open path stays on lifecycle clauses. |
| C2 | constraint | respected | static_check | No new workflow signals or non-deterministic operations; phase derivation is pure over in-heap gate state; AdvChangeStatus stays Keyword (no re-registration). Reviewer confirmed replay-safe. |
| C3 | constraint | respected | static_check | No archive terminal-projection code touched. The wedge (deepScanTemporalWorkflowHot) was unwedged separately via normal archive before this change. |
| C4 | constraint | respected | static_check | in-flight/archived/closed/default callers unchanged; legacy active/pending disk records load via normalizer (json.test.ts). in-flight Set narrowed to ["draft"] (only reachable open status). |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-1b5a4b031bf2 | AC1 |  | C4 |  |
| tk-7675f0a5147b | AC2 | AC3 | C4 |  |
| tk-5cbab8373725 | AC4 |  | C4 |  |
| tk-91ee7c23df13 | AC4 |  | C1, C4 |  |
| tk-9dc9b3d1b06b |  |  | C1 |  |
| tk-bf89de4679f5 |  | AC5 | C1, C2, C3, C4 |  |
