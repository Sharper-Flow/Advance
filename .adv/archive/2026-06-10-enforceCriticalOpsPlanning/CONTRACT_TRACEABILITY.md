# Contract Traceability

**Change ID:** enforceCriticalOpsPlanning
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-06-10T00:41:00.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | checkCriticalOpsCoverage blocks planning when requiredCritical items lack coverage; checkRequiredObligationRouting blocks release for silently deferred items. 31 regression tests verify. |
| SC2 | success_criterion | pass | review | requiredCritical field on ContractItemSchema provides explicit typed marker. Review matrix rows track requiredCritical items separately. Gate readiness blockers surface obligation status. |
| SC3 | success_criterion | pass | review | checkRequiredObligationRouting emits REQUIRED_OBLIGATION_NOT_ROUTED blocker with remediation: 'Route via adv_change_reenter or fast-follow split'. Tests verify. |
| AC1 | acceptance_criterion | pass | test | ContractItemSchema.requiredCritical: z.boolean().optional() in types/changes.ts. RequiredFollowUpSchema with obligation_class enum in subagent-reports.ts. Schema tests pass. |
| AC2 | acceptance_criterion | pass | test | checkCriticalOpsCoverage in prep-readiness.ts emits CRITICAL_OPS_UNCOVERED error when requiredCritical items lack task coverage. Registered in runPrepReadinessChecks. 8 tests pass. |
| AC3 | acceptance_criterion | pass | test | consumeRequiredFollowUps in subagent-report.ts preserves obligation_class and severity. Required follow-ups get category 'required-obligation' with mapped priority. 4 tests pass. |
| AC4 | acceptance_criterion | pass | test | checkRequiredObligationReleaseBlockers in gate-readiness.ts blocks release when requiredCritical items have failing review status. 7 gate-readiness tests pass. |
| AC5 | acceptance_criterion | pass | test | checkRequiredObligationRouting blocks release for requiredCritical items with no task coverage and no review matrix row. Remediation directs to reenter/split. Tests pass. |
| AC6 | acceptance_criterion | pass | test | Specs updated: prep-readiness rq-PR007coc, subagent-reports rq-subagentReports14, advance-workflow rq-requiredObligation01/02. 31 regression tests in required-obligation-regression.test.ts. Full suite 3664 tests pass. |
| C1 | constraint | respected | static_check | All new fields optional (requiredCritical, required_follow_ups). Existing contracts without requiredCritical parse unchanged. Backward compat tests pass. |
| C2 | constraint | respected | static_check | All enforcement uses Zod schemas and typed fields (requiredCritical boolean, RequiredFollowUpSchema). No title/priority heuristics used for classification. |
| C3 | constraint | respected | static_check | No new human checkpoints added. Machine checks (prep readiness, gate readiness) integrate into existing gate completion flow. Approval boundaries unchanged. |
| C4 | constraint | respected | static_check | Only items with requiredCritical: true trigger blockers. Non-requiredCritical items with failing status are not affected by new checks. Tests verify isolation. |
| DONT1 | avoidance | respected | review | required_follow_ups is a separate typed channel from follow_ups. Only explicitly typed required items get elevated treatment. Advisory follow_ups remain medium priority. |
| DONT2 | avoidance | respected | review | Release blocking uses structural gate-readiness blocker path (REQUIRED_OBLIGATION_UNRESOLVED, REQUIRED_OBLIGATION_NOT_ROUTED), not advisory gate-criteria surfaces. |
| DONT3 | avoidance | respected | review | REQUIRED_OBLIGATION_UNRESOLVED blockers require actual resolution (pass review status), not just rationale. notRequiredReason serves as alternate route only for routing check, not for failing reviews. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-cd137739b371 | AC1 |  | C1, C2, C4, DONT1 |  |
| tk-0c8dfac2255e | AC2 | AC6 | C2, C3 |  |
| tk-196ae616f512 | AC3 | AC6 | C1, C2, DONT1 |  |
| tk-8cfe07800fdd | AC4, AC5 | AC6 | C3, DONT2, DONT3 |  |
| tk-4ed335cfcedf | AC6 |  | C2, C3, C4 | Spec artifact authoring task; executable verification handled by downstream validation and schema/spec checks. |
| tk-702cbe14b00a |  | AC1, AC2, AC3, AC4, AC5, AC6 | C1, C2, DONT2, DONT3 |  |
| tk-6d1645b80eb4 |  | SC1, SC2, SC3, AC1, AC2, AC3, AC4, AC5, AC6 | C1, C2, C3, C4 | Cross-cutting verification/signoff task; verifies entire contract matrix rather than implementing a single item. |
