# Contract Traceability

**Change ID:** improveSubAgentContracts
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-05-26T05:03:00.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | Asset tests verify TASK_SCOPE, IN_SCOPE, OUT_OF_SCOPE, DONE_WHEN, STOP_WHEN, VERIFICATION in worker prompts/packets. Combined asset/schema test suite exitCode 0 (166 tests). |
| AC2 | acceptance_criterion | pass | test | EngineerSubagentReportSchema now requires scope_drift and required_main_agent_actions; schema/tool tests pass (35 tests). |
| AC3 | acceptance_criterion | pass | test | SUBAGENT_WARN_FIRST_PACKET_ANCHORS is separate from strict identity anchors; delegation-defaults uses warn_packet_anchors. Relevant schema/spec/matrix tests pass. |
| AC4 | acceptance_criterion | pass | test | Specs and prompts document finish owned scope if safe, then report; stop immediately for contract/security/release blockers. Asset tests assert prompt/spec coverage. |
| AC5 | acceptance_criterion | pass | test | Worker packets include VERIFICATION sections with required_when_possible commands and optional_additional_checks. Full check, full tests, and build passed. |
| AC6 | acceptance_criterion | pass | test | Schema/spec/asset alignment pinned by tests across subagent-reports, delegation-matrix, engineer/reviewer/optimized-handoff assets. Full vitest --maxWorkers=4 exitCode 0. |
| AC7 | acceptance_criterion | pass | test | Specs and asset tests verify scanner packets are explore-only and do not ask scanners to call adv_subagent_report_submit; scanner bundles remain orchestrator-submitted only. |
| AC8 | acceptance_criterion | pass | test | adv_subagent_report_submit args.report uses ScopedSubagentReportSchema; tests reject JSON-stringified payloads with INVALID_REPORT. |
| C1 | constraint | respected | static_check | ScopedSubagentReportSchema remains strict; parseReport still returns INVALID_REPORT on malformed payloads. Tests cover missing/invalid fields and scope pairings. |
| C2 | constraint | respected | static_check | No code infers missing task_id, phase, attempt, change_id, or workdir_used for persistence. Prompts forbid asking user or inferring identity values. |
| C3 | constraint | respected | static_check | delegation-defaults and asset tests keep typed_persisted_worker vs non_persisted_scanner contracts separate. |
| C4 | constraint | respected | static_check | Implementation uses Zod schemas, exported anchor constants, specs, matrix fields, and tests. pnpm run check, full tests, and build passed. |
| C5 | constraint | respected | static_check | New non-identity anchors are warn-first constants/matrix fields; strict identity anchors remain separate and tested. |
| C6 | constraint | respected | static_check | Agent prompts continue to forbid nested delegation; asset tests pin this. No nested spawning added. |
| DONT1 | avoidance | respected | review | Worker prompts copy identity from packet anchors and treat missing identity as packet defects; no worker discovers ADV task IDs from global state. |
| DONT2 | avoidance | respected | review | Prompts/specs require adv_subagent_report_submit tool-call transport and explicitly reject fenced JSON/sentinel transport. |
| DONT3 | avoidance | respected | review | Review/harden scanner packets stay explore-only and exclude adv_subagent_report_submit; asset/spec tests verify scanner isolation. |
| DONT4 | avoidance | respected | review | Touched scope was limited to sub-agent contracts: schemas/tool tests, specs, agent prompts, command packets, and fixtures. No unrelated refactors. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-fe62a95c44fd | AC2, AC3, AC8 | AC2, AC3, AC8 | C1, C2, C4, C5, DONT1, DONT2 |  |
| tk-4748faeb813b | AC1, AC3, AC4, AC5, AC6, AC7 | AC1, AC3, AC4, AC5, AC6, AC7 | C3, C4, C5, C6, DONT2, DONT3, DONT4 |  |
| tk-194b4d798da5 | AC1, AC2, AC4, AC5, AC7 | AC1, AC2, AC4, AC5, AC7 | C1, C2, C3, C5, C6, DONT1, DONT2, DONT3 |  |
| tk-4d81593fe27a |  | AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8 | C1, C2, C3, C4, C5, C6, DONT1, DONT2, DONT3, DONT4 |  |
