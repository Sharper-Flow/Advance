# Contract Traceability

**Change ID:** hardenTddProofEvidence
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-06-17T01:08:00.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | change-state.test.ts: AC1 test rejects inline task without red run; AC2 test accepts valid red→green; applyTaskCompletedToState throws TASK_ORDERING_VIOLATION |
| SC2 | success_criterion | pass | review | TaskCompletedSignalPayloadSchema has lastRedRunId/lastGreenRunId/lastEvidenceRunId optional fields; ordering check verifies refs against state.testRuns |
| SC3 | success_criterion | pass | review | test-quality.ts: 42 tests pass; AdvRunTestEvidenceSchema extended with assertionDensity/mockSurface/behaviorSurface; test.ts integration verified |
| SC4 | success_criterion | pass | review | docs/adv-run-test-prep.md HIGH finding marked RESOLVED; rq-TDD008path.3/.4 updated; RSTC docs updated in adv-apply.md + ADV_INSTRUCTIONS.md |
| AC1 | acceptance_criterion | pass | test | change-state.test.ts: 'AC1: rejects inline task completion with lastGreenRunId but no prior red run' — passes |
| AC2 | acceptance_criterion | pass | test | change-state.test.ts: 'AC2: accepts inline task completion with valid red→green sequence' — passes |
| AC3 | acceptance_criterion | pass | test | change-state.test.ts: 'AC3: accepts legacy task completion without lastGreenRunId' — passes |
| AC4 | acceptance_criterion | pass | test | TaskCompletedSignalPayloadSchema.verification is z.string().min(1); ordering check requires lastRedRunId when lastGreenRunId present |
| AC5 | acceptance_criterion | pass | test | test.ts integration: quality signals computed via extractTestFilePath + computeQualitySignals; AdvRunTestEvidenceSchema accepts new fields |
| AC6 | acceptance_criterion | pass | test | test-quality.test.ts: 12 mock patterns each with ≥3 fixtures; bare 'mock' token correctly not matched |
| AC7 | acceptance_criterion | pass | test | test-quality.test.ts: classifyBehaviorSurface edge cases tested (large/medium/small) |
| AC8 | acceptance_criterion | pass | test | workflow-bundle-boundary.test.ts passes (4 tests); grep for '../tools' in temporal/*.ts returns 0 matches |
| AC9 | acceptance_criterion | pass | test | Full suite: 3755 tests pass across 271 files including all asset/regression tests |
| AC10 | acceptance_criterion | pass | test | pnpm run check clean; bin/oc-test full: 3755 tests pass |
| C1 | constraint | respected | static_check | AC3 test verifies legacy tasks grandfathered when lastGreenRunId absent |
| C2 | constraint | respected | static_check | Quality signals never referenced in ordering check or gate logic; advisory only |
| C3 | constraint | respected | static_check | change-state.test.ts: 'exempts not_applicable tasks from ordering check' — passes |
| C4 | constraint | respected | static_check | Static parse uses readFileSync on single file; no subprocess; <100ms typical |
| C5 | constraint | respected | static_check | Quality signals depend on file content only; runId computed in tool layer not workflow sandbox; test runs replayed from history |
| C6 | constraint | respected | static_check | Spec changes (rq-TDD009seq, rq-TDD010qual) committed first (tk-1 SHA 9b2712c) before any code changes |
| C7 | constraint | respected | static_check | pnpm run schemas:check passes; AdvRunTestEvidenceSchema + TaskCompletedSignalPayloadSchema extended |
| DONT1 | avoidance | respected | review | No line-coverage metrics introduced |
| DONT2 | avoidance | respected | review | No multi-test-case requirement added |
| DONT3 | avoidance | respected | review | assertionDensity is advisory; never gates task completion |
| DONT4 | avoidance | respected | review | mockSurface surfaced to review only; no auto-reject |
| DONT5 | avoidance | respected | review | phase remains descriptive field; ordering enforced separately |
| DONT6 | avoidance | respected | review | tdd_intent: inline remains default for logic-bearing tasks |
| DONT7 | avoidance | respected | review | task.verification remains free-text string; bound to evidence via refs, not typed |
| OOS1 | out_of_scope | not_applicable | not_applicable | Mutation testing not implemented |
| OOS2 | out_of_scope | not_applicable | not_applicable | Line coverage gate not added |
| OOS3 | out_of_scope | not_applicable | not_applicable | TDD-as-policy not removed |
| OOS4 | out_of_scope | not_applicable | not_applicable | No cross-project store changes |
| OOS5 | out_of_scope | not_applicable | not_applicable | No bin/adv CLI changes |
| OOS6 | out_of_scope | not_applicable | not_applicable | No Vitest JSON reporter wiring |
| OOS7 | out_of_scope | not_applicable | not_applicable | tdd_evidence field not renamed |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-40a731ad7d7e | SC1, SC3, SC4 |  | C6 |  |
| tk-eb0f3ea0bae4 | SC2 |  | C1, C5 |  |
| tk-3c09531bd9a7 | SC3 | AC6, AC7 | C2, C4, C5 |  |
| tk-8d226f102c4a | SC1, SC2 | AC1, AC2, AC3, AC4 | C1, C3, C5 |  |
| tk-2f15f1603eaf | SC3 | AC5 | C2, C4 |  |
| tk-7ffa66b12f0c | SC2 | AC4 | C3 |  |
| tk-9fdca6aab7b1 | SC4 |  | DONT5 |  |
| tk-9e60135b711c |  | AC8, AC9, AC10 | C7 |  |
