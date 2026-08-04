# Contract Traceability

**Change ID:** fixMultiSessionTemporalRead
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-08-04T16:10:00.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | status-host-cap.test.ts four-view cases + in-loop enrichment case return typed degraded output instead of opaque timeout under delay and corpus pressure. Run tr_mseuouaq_138a5344 exit 0. |
| SC2 | success_criterion | pass | review | Typed SOURCE_DEADLINE_EXCEEDED warnings carry source/budget/omitted IDs (changes.ts:1153-1163); status.ts promotes warning messages into visible recommendations so an operator sees what was unavailable without reading logs. New SOURCE_WORKFLOW_DURABLY_ABSENT warning added during review remediation covers the durable-absence case. |
| AC1 | acceptance_criterion | pass | test | One TemporalReadContext created per adv_status request (status.ts:429) with STATUS_READ_DEADLINE_BUDGET_MS; same absolute deadline threaded into summary, health, changes, hygiene read options and consumed at each view's store path. status-host-cap.test.ts exercises all four views. |
| AC2 | acceptance_criterion | pass | test | All four views assert errorClass !== ToolExecutionTimeout with typed warnings. Orchestrator proved RED at 10136ms against unfixed code for the in-loop case. Durable-absence path now also returns typed warnings + hydrationStats after review blocker 1 remediation (commit 76f943d9). |
| AC3 | acceptance_criterion | pass | test | loadStatusWithBootstrapRetry admission-checks the shared context before every attempt and before each retry delay (status.ts:213-260); no attempt mints a fresh budget. status.test.ts bootstrap recovery and max-attempt degradation cases cover the loop. |
| AC4 | acceptance_criterion | pass | test | Structural discriminator: extractGrpcStatus(error) === GRPC_NOT_FOUND (numeric gRPC code walked from the cause chain, not message text) AND request-scoped projectionState.loaded. Independent of MISSING_WORKFLOW_TEXT_RE. Bootstrap recovery preserved and now request-scoped after review blocker 2 remediation; TMPRL1100 negative test added asserting it is not swallowed. Orchestrator RED-verified both branches. |
| AC5 | acceptance_criterion | pass | test | STATUS_READ_DEADLINE_BUDGET_MS derived as DEFAULT_TOOL_TIMEOUT_MS - TOOL_RESPONSE_HEADROOM_MS (tool-budgets.ts) and wired into createTemporalReadContext at the status handler. tool-budgets.test.ts machine-checks budget + headroom <= cap, headroom > 0, and (added during review) HEALTH_EXECUTION_CUTOFF_MS < STATUS_READ_DEADLINE_BUDGET_MS. |
| AC6 | acceptance_criterion | pass | test | All five required evidence areas have real automated regression coverage: per-view deadline propagation (status-host-cap four-view cases), aggregate-budget enforcement across retries (status.test.ts bootstrap cases), NOT_FOUND retry admission (both branches, status.test.ts), bootstrap-recovery preservation (TMPRL1100 + multi-attempt recovery cases), budget-to-cap headroom invariant (tool-budgets.test.ts). Final sweep tr_mseuouaq_138a5344 exit 0. |
| C1 | constraint | respected | static_check | DEFAULT_TOOL_TIMEOUT_MS remains 10_000; it was relocated from safe-execute.ts to tool-budgets.ts and re-imported. safe-execute.ts:456/532 still use it as the default cap. Value unchanged, pinned by tool-budgets.test.ts. |
| C2 | constraint | respected | static_check | No restart, worker-restart, or session-termination path introduced. Degradation is returned locally from the status read path. |
| C3 | constraint | respected | static_check | Changes are read-path only: deadline threading, admission checks, projection marking, and typed degradation. No Temporal signal, start, update, or mutation added. workflows.ts untouched; worker-bundle static import graph unchanged. |
| C4 | constraint | respected | static_check | Disk/archive projection reads remain authoritative and are read before any capped workflow fallback. Existing SOURCE_DEADLINE_EXCEEDED typed degradation from fixChangeReadTimeouts preserved; new durable-absence warning follows the same typed shape. Full store-temporal suite passes in tr_mseuouaq_138a5344. |
| C5 | constraint | respected | static_check | Health path continues to use the global health facilities via runHealthStatus and shared probe caches. No per-change workflow health probe added. |
| C6 | constraint | respected | static_check | Initially VIOLATED by the D3 implementation — the projection flag was store/session-lifetime, so after any prior projection load every subsequent NOT_FOUND including genuine bootstrap-in-progress skipped retry. Orchestrator confirmed the store is created once in plugin-init.ts:418 and reused session-wide. Remediated in 76f943d9 with a request-scoped DiskProjectionReadState; RED-verified ('expected 2 to be 4') then GREEN. Bootstrap recovery and TMPRL1100 retry now covered by explicit tests. |
| C7 | constraint | respected | static_check | Initially VIOLATED — buildDurableAbsenceStatus returned only a prose emoji recommendation with no warnings or hydrationStats, structurally indistinguishable from a legitimately empty project. Remediated in 76f943d9 with typed SOURCE_WORKFLOW_DURABLY_ABSENT warning code plus hydrationStats; TerminalWarningCode extended in types/responses.ts. RED-verified ('expected undefined to deeply equal ArrayContaining') then GREEN. |
| DONT1 | avoidance | respected | review | Saturation is not treated as root cause. The fix bounds aggregate reads at the store, tool, retry, and constant layers; the change title remains stale but the implemented causal model is the unbounded-read model established in design. |
| DONT2 | avoidance | respected | review | The budget was not lowered as a blanket fix — it was RAISED from the accidental 8000ms default to a derived 9801ms, with the 199ms reserve measured rather than guessed and the completeness/degradation tradeoff documented in tool-budgets.ts. |
| DONT3 | avoidance | respected | review | No second parallel deadline mechanism. STATUS_READ_DEADLINE_BUDGET_MS is a derived budget VALUE fed into the existing createTemporalReadContext / TemporalReadContext; TEMPORAL_READ_DEADLINE_BUDGET_MS remains only the default for callers that supply no budget. |
| DONT4 | avoidance | respected | review | Scope confined to status read bounding, projection marking, NOT_FOUND admission, budget constants, and tests. No worker admission control, orphan-queue reclamation, or worker memory work. Contract-traceability scan reported zero out-of-scope changes. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-9907e3d72b80 |  | AC2, AC6 | C7 |  |
| tk-06a8657b245b | AC1, AC3 |  | C3, C5 |  |
| tk-f9856986e3f2 | AC4 |  | C6, C3 |  |
| tk-a0bf41cad932 | AC5 |  | C1, C2 |  |
| tk-0a6c9ab3707e | AC2 |  | C4, C7 |  |
| tk-4c67f765d92e |  | AC6, SC1, SC2 | C1, C2, C4 |  |
| tk-986501a9fb27 | AC1, AC2 |  | C3, C4, C7 |  |
| tk-0fe1c15a108f | AC1, AC2 |  | C4, C5, C7 |  |
