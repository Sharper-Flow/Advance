# Acceptance

Reviewed at: 2026-05-26T05:03:00.000Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| AC1 | acceptance_criterion | Worker packets include first-class scope anchors: `TASK_SCOPE`, `IN_SCOPE`, `OUT_OF_SCOPE`, `DONE_WHEN`, `STOP_WHEN`, and `VERIFICATION`. | pass | Asset tests verify TASK_SCOPE, IN_SCOPE, OUT_OF_SCOPE, DONE_WHEN, STOP_WHEN, VERIFICATION in worker prompts/packets. Combined asset/schema test suite exitCode 0 (166 tests). |
| AC2 | acceptance_criterion | Engineer reports structurally capture `scope_drift` and `required_main_agent_actions`, not only prose `follow_ups`. | pass | EngineerSubagentReportSchema now requires scope_drift and required_main_agent_actions; schema/tool tests pass (35 tests). |
| AC3 | acceptance_criterion | Legacy packets warn first during rollout; strict failure remains for identity anchors (`CHANGE`, `TASK`, `PHASE`, `ATTEMPT`, `WORKING DIRECTORY`). | pass | SUBAGENT_WARN_FIRST_PACKET_ANCHORS is separate from strict identity anchors; delegation-defaults uses warn_packet_anchors. Relevant schema/spec/matrix tests pass. |
| AC4 | acceptance_criterion | Out-of-scope findings use “finish owned scope if safe, then report” by default; stop immediately only for contract/security/release blockers. | pass | Specs and prompts document finish owned scope if safe, then report; stop immediately for contract/security/release blockers. Asset tests assert prompt/spec coverage. |
| AC5 | acceptance_criterion | Verification commands are required when possible; workers may add extra checks. | pass | Worker packets include VERIFICATION sections with required_when_possible commands and optional_additional_checks. Full check, full tests, and build passed. |
| AC6 | acceptance_criterion | Asset/schema/spec tests prove schema ↔ packet ↔ prompt alignment for identity, scope, done, stop, and verification anchors. | pass | Schema/spec/asset alignment pinned by tests across subagent-reports, delegation-matrix, engineer/reviewer/optimized-handoff assets. Full vitest --maxWorkers=4 exitCode 0. |
| AC7 | acceptance_criterion | Scanner lanes remain non-persisted; only orchestrator-submitted scanner bundles use `adv_subagent_report_submit`. | pass | Specs and asset tests verify scanner packets are explore-only and do not ask scanners to call adv_subagent_report_submit; scanner bundles remain orchestrator-submitted only. |
| AC8 | acceptance_criterion | `adv_subagent_report_submit` report tool typing is checked so object payloads are not string-serialized by MCP/schema drift. | pass | adv_subagent_report_submit args.report uses ScopedSubagentReportSchema; tests reject JSON-stringified payloads with INVALID_REPORT. |
| C1 | constraint | Do not weaken `INVALID_REPORT` validation for required identity fields. | respected | ScopedSubagentReportSchema remains strict; parseReport still returns INVALID_REPORT on malformed payloads. Tests cover missing/invalid fields and scope pairings. |
| C2 | constraint | Do not infer missing `task_id`, `phase`, `attempt`, `change_id`, or `workdir_used` heuristically for persistence correctness. | respected | No code infers missing task_id, phase, attempt, change_id, or workdir_used for persistence. Prompts forbid asking user or inferring identity values. |
| C3 | constraint | Keep worker and scanner transport lanes distinct. | respected | delegation-defaults and asset tests keep typed_persisted_worker vs non_persisted_scanner contracts separate. |
| C4 | constraint | Use structural mechanisms first: Zod schemas, packet builders/anchors, asset tests, specs, and command/prompt checks. | respected | Implementation uses Zod schemas, exported anchor constants, specs, matrix fields, and tests. pnpm run check, full tests, and build passed. |
| C5 | constraint | Preserve backward compatibility for existing/legacy packets where possible by warning first for newly-added non-identity anchors. | respected | New non-identity anchors are warn-first constants/matrix fields; strict identity anchors remain separate and tested. |
| C6 | constraint | No nested sub-agent delegation. | respected | Agent prompts continue to forbid nested delegation; asset tests pin this. No nested spawning added. |
| DONT1 | avoidance | Do not make sub-agents discover their own ADV task IDs from global state. | respected | Worker prompts copy identity from packet anchors and treat missing identity as packet defects; no worker discovers ADV task IDs from global state. |
| DONT2 | avoidance | Do not rely on final-message fenced JSON as ADV worker report transport. | respected | Prompts/specs require adv_subagent_report_submit tool-call transport and explicitly reject fenced JSON/sentinel transport. |
| DONT3 | avoidance | Do not make explore/scanner lanes call `adv_subagent_report_submit` directly. | respected | Review/harden scanner packets stay explore-only and exclude adv_subagent_report_submit; asset/spec tests verify scanner isolation. |
| DONT4 | avoidance | Do not expand into unrelated sub-agent quality or model-routing refactors. | respected | Touched scope was limited to sub-agent contracts: schemas/tool tests, specs, agent prompts, command packets, and fixtures. No unrelated refactors. |

