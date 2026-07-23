# Contract Traceability

**Change ID:** makeReadsDiskAuthoritative
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-23T19:38:32.724Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | convergent-read-disk-authoritative.test.ts + bounded-read-deadline.test.ts: unresponsive member returns within perMemberCap+ε with workflow_unresponsive advisory. |
| AC2 | acceptance_criterion | pass | test | convergent-read-disk-authoritative.test.ts:203-248: CB trips after K=3 consecutive unresponsive, short-circuits to disk+advisory. |
| AC3 | acceptance_criterion | pass | test | epics.test.ts:152-193: epics.get threads deadline, retired-projection fallback with workflow_unresponsive, <2000ms. epic-list gap (epic-read-1) shipped via addEpicListCircuitBreaker (7de2cd0b). |
| AC4 | acceptance_criterion | pass | test | status-enrich.test.ts: appendResumeProjectionRecommendations uses mapWithConcurrency(8). |
| AC5 | acceptance_criterion | pass | test | status-health.test.ts + health-probe-cache.test.ts: read-timeout returns probe_degraded, not false 'server down'. Inverse concern (health-guard-1) tracked as fixHealthDegradedAlive. |
| AC6 | acceptance_criterion | pass | test | Verified live post-restart 2026-07-23: adv_epic_show/adv_epic_list/adv_change_list/adv_doctor all fast, zero ToolExecutionTimeout. |
| C1 | constraint | respected | static_check | workflow-bundle-boundary.test.ts + imports test enforce workflows.ts cannot reach storage/tools; fix surface tools/+storage only. |
| C2 | constraint | respected | static_check | recovery-classification.ts: workflow_unresponsive in ProjectionRecoveryReason; getTemporalChange path returns disk read-only, never reseedChangeFromDisk. |
| C3 | constraint | respected | static_check | pnpm run check + pnpm run build both green. |
| DONT1 | avoidance | respected | review | Leg B enrichment still enriches when fast (recordResponsiveMember on success); only unresponsive degrades. |
| DONT2 | avoidance | respected | review | index.test.ts listResolvedChanges tests pass; disk-first fast path preserved. |
| DONT3 | avoidance | respected | review | workflow-bundle-boundary.test.ts: changed files unreachable from workflows.ts; bundle graph unchanged. |
| DONT4 | avoidance | respected | review | Change took effect only after build+deploy+OpenCode restart (no hot reload); verified across two restart cycles. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-561f77932cf2 | AC1, AC2, AC4 | AC6 | C1, C2, C3, DONT1, DONT2, DONT3, DONT4 |  |
| tk-56ee82886080 | AC3, AC5 |  |  |  |
| tk-1a2ebb02eb20 |  | AC6 |  |  |
