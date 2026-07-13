# Contract Traceability

**Change ID:** addWorkflowDirectives
**Contract Version:** 1
**Rigor:** strict
**Reviewed:** 2026-07-11T00:58:09.205Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | WorkflowDirective interface in workflow-directive.ts:80-90 contains phase, action (kind/gateId/command/checkpoint), approvalPending, recovery, blockers, canArchive, bucket. All 18 directive tests verify. |
| SC2 | success_criterion | pass | review | gate.ts:1032 and status-enrich.ts:148 both call deriveWorkflowDirective; getDirectiveQuery in workflows.ts:700 returns same. Dual derivation consolidated. |
| SC3 | success_criterion | pass | review | Recovery derived from durable state (signal_rejections, stuck_reason, recovery_audit, terminated). Legacy state produces safe recovery/blocked directive. Test covers unknown recovery. |
| AC1 | acceptance_criterion | pass | test | Referential transparency test (workflow-directive.test.ts:213-220). Workflow-safe imports only. wf.defineQuery<WorkflowDirective> at boundary. TypeScript shape-validated. |
| AC2 | acceptance_criterion | pass | test | 18 tests: all 7 gates via it.each, approval checkpoint, 3 recovery reasons (poisoned/missing/unknown), 2+ blocker types, GATE_STUCK, canArchive, never_started, archived, referential re-derivation. |
| AC3 | acceptance_criterion | pass | test | getRecommendationForGate removed; replaced by buildNextGateRecommendationFromDirective. gate.ts nextGate/canArchive derive from directive. No dual derivation remains. |
| AC4 | acceptance_criterion | pass | test | No wf.defineUpdate. No persisted directive field. No outgoing-message host enforcement. Workflow-bundle-boundary test green. |
| AC5 | acceptance_criterion | pass | test | After remediation: gate.ts, status-enrich.ts, change.ts (show+create), gate completion, recovery handoff, and compaction-context all derive+pass directive. Context snapshot renders Next: line. 8 compaction-context tests include 2 Next:-line tests. |
| C1 | constraint | respected | static_check | Only defineQuery+setHandler added. Workflow-bundle-boundary test confirms no defineUpdate/storage/tools imports. |
| C2 | constraint | respected | static_check | deriveWorkflowDirective(state, epoch) is pure; no persistence, no cache. Same pattern as deriveBucket. |
| C3 | constraint | respected | static_check | GATE_COMMAND mirrors manifest getCommandsByGate mapping. Release maps to adv-archive. Human approval boundaries unchanged. |
| C4 | constraint | respected | static_check | Directive in agent packets + tests. No outgoing-message interception. No host enforcement claim. |
| DONT1 | avoidance | respected | review | No LLM calls, no chat-history reads. Recovery derived from durable state fields only. |
| DONT2 | avoidance | respected | review | No wf.defineUpdate anywhere in new code. |
| DONT3 | avoidance | respected | review | No host enforcement claim. Directive is shape-only; rendering is agent-side. |
| OOS1 | out_of_scope | not_applicable | not_applicable | Temporal and 7-gate lifecycle preserved. |
| OOS2 | out_of_scope | not_applicable | not_applicable | No UI changes. |
| OOS3 | out_of_scope | not_applicable | not_applicable | No adapter/detector/performance refactors. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-83fcef53f7c2 | SC1, SC3, AC1, AC4 |  | C1, C2, C3, C4, DONT1, DONT2, DONT3, OOS1, OOS2, OOS3 |  |
| tk-5c08afc4431a | SC2, AC3, AC5 | SC1, SC2, SC3, AC5 | C1, C2, C3, C4, DONT1, DONT2, DONT3 |  |
| tk-89ef733809f8 |  | AC1, AC2, AC3, AC4, AC5, SC1, SC2, SC3 | C1, C2, C3, C4, DONT1, DONT2, DONT3 |  |
