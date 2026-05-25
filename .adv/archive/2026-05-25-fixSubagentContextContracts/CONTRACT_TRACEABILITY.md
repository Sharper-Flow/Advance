# Contract Traceability

**Change ID:** fixSubagentContextContracts
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-05-24T23:20:00.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | Passed: src/adv-reviewer-asset.test.ts verifies Review/Harden Reviewer Remediation Packet anchors include WORKING DIRECTORY, CHANGE, TASK, PHASE, ATTEMPT. |
| AC2 | acceptance_criterion | pass | test | Passed: src/adv-engineer-assets.test.ts and src/adv-reviewer-asset.test.ts verify adv-engineer worker packets include WORKING DIRECTORY, CHANGE, TASK, ATTEMPT. |
| AC3 | acceptance_criterion | pass | test | Passed: src/adv-reviewer-asset.test.ts scanner negative tests verify review/harden scanner packets do not mention adv_subagent_report_submit, ENGINEER_REPORT, or REVIEWER_REPORT. |
| AC4 | acceptance_criterion | pass | test | Passed: src/types/subagent-reports.test.ts plus asset tests. Task RED evidence showed tests fail when required packet/spec anchors are missing. |
| AC5 | acceptance_criterion | pass | test | Passed: src/subagent-reports-spec-assets.test.ts and src/delegation-matrix.test.ts verify rq-subagentReports05 and packet_contracts for TASK, PHASE, ATTEMPT and scanner-vs-worker transport. |
| AC6 | acceptance_criterion | pass | test | Passed: src/tools/subagent-report.test.ts verifies INVALID_REPORT for malformed payloads and UNSUPPORTED_AGENT for reserved agents; strict schemas still require task_id, attempt, and reviewer phase. |
| AC7 | acceptance_criterion | pass | test | Passed: focused suite 8 files/161 tests. Passed: pnpm run check (typecheck, test-isolation, lockfile policy, lint, format:check). |
| AC8 | acceptance_criterion | pass | test | Passed: src/agent-tool-contracts-assets.test.ts verifies docs/agent-tool-contracts.md, skills/adv-agent-tool-contracts/SKILL.md, adv-skill-author cross-link, and adv-* deploy sync. |
| C1 | constraint | respected | static_check | Implementation uses Zod schemas, typed packet anchor maps, spec JSON packet_contracts, and asset/schema tests. No heuristic ownership of ingest or persistence correctness added. |
| C2 | constraint | respected | static_check | SupportedSubagentReport schemas still require task_id and attempt; ReviewerSubagentReport still requires phase. Tests assert malformed reports remain INVALID_REPORT. |
| C3 | constraint | respected | static_check | Review/harden scanner packets remain explore analysis lanes and tests assert no adv_subagent_report_submit or typed report transport in scanner packets. |
| C4 | constraint | respected | static_check | adv-engineer and adv-reviewer prompt updates only add TASK/PHASE/ATTEMPT mapping; no nested delegation or ADV orchestration mutation permissions were added. |
| C5 | constraint | respected | static_check | Adjacent guardrails limited to exhaustive blockerSummary switch and consumer_warnings schema validation/tests in touched subagent-report subsystem. |
| C6 | constraint | respected | static_check | .adv/specs/subagent-reports/spec.json adds rq-subagentReports05; .adv/specs/delegation-defaults/spec.json adds packet_contracts and scanner-vs-worker law. |
| DONT1 | avoidance | respected | review | No delegation routing redesign; changes stay in packet contracts, schemas, tests, specs, docs, and small guardrails. |
| DONT2 | avoidance | respected | review | SupportedSubagentReportSchema still includes only adv-engineer and adv-reviewer; adv-researcher/adv-tron remain reserved and UNSUPPORTED_AGENT test remains. |
| DONT3 | avoidance | respected | review | Scanner packet tests and specs explicitly classify explore scanners as non_persisted_scanner; no scanner migrated to typed persisted reports. |
| DONT4 | avoidance | respected | review | No runtime packet generation added; recurrence prevention is asset/schema/spec tests and typed maps. |
| DONT5 | avoidance | respected | review | Prose docs/skill were added, but enforcement is structural through tests, schemas, typed maps, and specs. |
| DONT6 | avoidance | respected | review | Review/harden verdict logic unchanged; command edits are limited to scanner/remediation packet sections and context instructions. |
| OOS1 | out_of_scope | not_applicable | not_applicable | No full delegation routing redesign was attempted. |
| OOS2 | out_of_scope | not_applicable | not_applicable | No persistent typed schemas added for adv-researcher or adv-tron. |
| OOS3 | out_of_scope | not_applicable | not_applicable | Repo-owned globally synced ADV skill guidance was added; no external/built-in OpenCode skill source was modified. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-09a69e5f5fc2 | AC4 | AC4 | C1, C2, DONT5 |  |
| tk-d23496a47058 | AC1, AC2, AC3, AC4 | AC1, AC2, AC3, AC4 | C1, C2, C3, C4, DONT1, DONT3, DONT6 |  |
| tk-ffc0722da36f | AC5 | AC5 | C1, C6, DONT1, DONT5 |  |
| tk-f045bc8e7557 | AC8 | AC8 | C1, DONT5, OOS3 |  |
| tk-bd62566b96ef | AC6 | AC6 | C1, C2, C5, DONT2, DONT5 |  |
| tk-5e0da2aa39c3 |  | AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8 | C1, C2, C3, C4, C5, C6, DONT1, DONT2, DONT3, DONT4, DONT5, DONT6, OOS1, OOS2, OOS3 |  |
