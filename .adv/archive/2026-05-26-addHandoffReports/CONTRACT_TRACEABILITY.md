# Contract Traceability

**Change ID:** addHandoffReports
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-05-26T00:56:00.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | subagent-report + schema tests cover strict researcher/tron/scanner-bundle variants. |
| AC2 | acceptance_criterion | pass | test | schema/report/reviewer asset tests passed; task-scoped aliases and legacy behavior retained. |
| AC3 | acceptance_criterion | pass | test | change/checkpoint tests passed; include.subagentReports sidecar readback merges scoped/legacy reports with metadata. |
| AC4 | acceptance_criterion | pass | test | optimized-handoff asset test passed; review/harden define orchestrator SCANNER_BUNDLE_REPORT and scanners do not submit reports. |
| AC5 | acceptance_criterion | pass | test | subagent-report tests passed; follow_ups capped and source-tagged as subagent-followup agenda items. |
| AC6 | acceptance_criterion | pass | test | optimized-handoff asset test passed; adv-harden has Report-Created Agenda Audit with fix/rationale handling. |
| AC7 | acceptance_criterion | pass | test | stale-enforcement asset test passed; no live enforceTaskPolicy/runtime-enforced refs outside tests. |
| AC8 | acceptance_criterion | pass | test | optimized-handoff, spec asset, schema, and tool tests passed; packet anchors and malformed-report rejection covered. |
| C1 | constraint | respected | static_check | Strict Zod schemas and INVALID_REPORT path remain in subagent-report tool. |
| C2 | constraint | respected | static_check | SupportedSubagentReportSchema remains task-scoped and allows legacy string scope. |
| C3 | constraint | respected | static_check | Agents only submit own reports; adv-tron blocks change/task/gate mutations; orchestrator owns bundles/gates. |
| C4 | constraint | respected | static_check | Live docs now say agent-self-enforced/no runtime guard; stale-enforcement test guards it. |
| C5 | constraint | respected | static_check | Optimized report schemas persist compact sources/evidence/findings/summary; readback is opt-in. |
| C6 | constraint | respected | static_check | consumeFollowUps caps to MAX_REPORT_FOLLOW_UPS and writes Source metadata. |
| C7 | constraint | respected | static_check | adv-harden Report-Created Agenda Audit requires safe+adjacent+campsite/touched-scope to fix; otherwise rationale/drift stop. |
| DONT1 | avoidance | respected | review | Reviewer verdict READY; strict tool-call transport required. |
| DONT2 | avoidance | respected | review | Reviewer verdict READY; sub-agents do not complete gates/create changes/own decisions. |
| DONT3 | avoidance | respected | review | False runtime-enforcement claims removed and guarded by tests. |
| DONT4 | avoidance | respected | review | Scanner persistence is aggregate bundle with bounded payload skeleton. |
| DONT5 | avoidance | respected | review | follow_ups capped and source-tagged; tests cover agenda creation. |
| DONT6 | avoidance | respected | review | adv-harden explicitly does not require non-adjacent/unrelated agenda fixes; rationale path required. |
| DONT7 | avoidance | respected | review | Touched scope limited to report schemas/persistence/readback/tooling/prompts/specs/tests and harden agenda handling. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-30dfe03f4a67 | AC1, AC4, AC5, AC6, AC8 | AC1, AC4, AC5, AC6, AC8 | C1, C3, C5, C6, C7, DONT1, DONT2, DONT4, DONT5, DONT6 |  |
| tk-55c41642dc32 | AC1, AC2, AC3, AC4, AC5 | AC1, AC2, AC3, AC4, AC5 | C1, C2, C3, C5, C6, DONT1, DONT2, DONT4, DONT5 |  |
| tk-20ddc8088280 | AC1, AC2, AC3 | AC1, AC2, AC3 | C1, C2, C3, DONT1, DONT2, DONT3 |  |
| tk-05b836f81a4d | AC1, AC2, AC5 | AC1, AC2, AC5 | C1, C2, C3, C6, DONT1, DONT2, DONT5 |  |
| tk-4f3e0b969175 | AC2, AC3 | AC2, AC3 | C2, C5, DONT4 |  |
| tk-dd329f936148 | AC1, AC4, AC6, AC8 | AC1, AC4, AC6, AC8 | C3, C5, C7, DONT1, DONT2, DONT4, DONT6 |  |
| tk-a80e6d5351cc | AC7, AC8 | AC7, AC8 | C3, C4, DONT2, DONT3 |  |
| tk-17fcf367e943 |  | AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8 | C1, C2, C3, C4, C5, C6, C7, DONT1, DONT2, DONT3, DONT4, DONT5, DONT6, DONT7 |  |
