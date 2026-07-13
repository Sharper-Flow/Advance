# Acceptance

Reviewed at: 2026-07-11T00:58:09.205Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | **SC1:** Agents receive one directive containing phase, permitted next action, approval/recovery state, blockers, and required evidence. | pass | WorkflowDirective interface in workflow-directive.ts:80-90 contains phase, action (kind/gateId/command/checkpoint), approvalPending, recovery, blockers, canArchive, bucket. All 18 directive tests verify. |
| SC2 | success_criterion | **SC2:** Status and gate surfaces derive next action from the same directive. | pass | gate.ts:1032 and status-enrich.ts:148 both call deriveWorkflowDirective; getDirectiveQuery in workflows.ts:700 returns same. Dual derivation consolidated. |
| SC3 | success_criterion | **SC3:** Legacy and recovery changes obtain directives without chat-history inference. | pass | Recovery derived from durable state (signal_rejections, stuck_reason, recovery_audit, terminated). Legacy state produces safe recovery/blocked directive. Test covers unknown recovery. |
| AC1 | acceptance_criterion | **AC1:** Directive derivation is deterministic, workflow-safe, and schema-validated. | pass | Referential transparency test (workflow-directive.test.ts:213-220). Workflow-safe imports only. wf.defineQuery<WorkflowDirective> at boundary. TypeScript shape-validated. |
| AC2 | acceptance_criterion | **AC2:** Tests cover seven gates, approval checkpoints, recovery reasons, blockers, `canArchive`, and re-derivation from current state. | pass | 18 tests: all 7 gates via it.each, approval checkpoint, 3 recovery reasons (poisoned/missing/unknown), 2+ blocker types, GATE_STUCK, canArchive, never_started, archived, referential re-derivation. |
| AC3 | acceptance_criterion | **AC3:** Existing dual next-action derivations are consolidated. | pass | getRecommendationForGate removed; replaced by buildNextGateRecommendationFromDirective. gate.ts nextGate/canArchive derive from directive. No dual derivation remains. |
| AC4 | acceptance_criterion | **AC4:** No `defineUpdate`, persisted duplicate directive truth, or unsupported host-enforcement claim is introduced. | pass | No wf.defineUpdate. No persisted directive field. No outgoing-message host enforcement. Workflow-bundle-boundary test green. |
| AC5 | acceptance_criterion | **AC5:** Agent packets include the directive; user-facing handoff rendering consumes it. | pass | After remediation: gate.ts, status-enrich.ts, change.ts (show+create), gate completion, recovery handoff, and compaction-context all derive+pass directive. Context snapshot renders Next: line. 8 compaction-context tests include 2 Next:-line tests. |
| C1 | constraint | **C1:** Preserve signal/query-only Temporal workflow surface and deterministic replay. | respected | Only defineQuery+setHandler added. Workflow-bundle-boundary test confirms no defineUpdate/storage/tools imports. |
| C2 | constraint | **C2:** Derive directives from durable state at read/query time; do not cache-and-trust a duplicate persisted directive. | respected | deriveWorkflowDirective(state, epoch) is pure; no persistence, no cache. Same pattern as deriveBucket. |
| C3 | constraint | **C3:** Preserve manifest ownership and human approval/release boundaries. | respected | GATE_COMMAND mirrors manifest getCommandsByGate mapping. Release maps to adv-archive. Human approval boundaries unchanged. |
| C4 | constraint | **C4:** Agent packet plus deterministic tests is the required enforcement target; host UI rendering is optional and must use a supported boundary. | respected | Directive in agent packets + tests. No outgoing-message interception. No host enforcement claim. |
| DONT1 | avoidance | **DONT1:** Do not infer authoritative phase or next action from chat history or LLM judgment. | respected | No LLM calls, no chat-history reads. Recovery derived from durable state fields only. |
| DONT2 | avoidance | **DONT2:** Do not use `defineUpdate`. | respected | No wf.defineUpdate anywhere in new code. |
| DONT3 | avoidance | **DONT3:** Do not claim outgoing-message host enforcement without a supported OpenCode hook. | respected | No host enforcement claim. Directive is shape-only; rendering is agent-side. |
| OOS1 | out_of_scope | **OOS1:** Replacing Temporal or the seven-gate lifecycle. | not_applicable | Temporal and 7-gate lifecycle preserved. |
| OOS2 | out_of_scope | **OOS2:** Broad OpenCode UI redesign. | not_applicable | No UI changes. |
| OOS3 | out_of_scope | **OOS3:** Unrelated adapter/detector/performance refactors. | not_applicable | No adapter/detector/performance refactors. |

