# Acceptance

Reviewed at: 2026-05-26T00:56:00.000Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| AC1 | acceptance_criterion | `adv_subagent_report_submit` accepts strict persisted optimized handoff reports for `adv-researcher`, `adv-tron`, and scanner-bundle lanes. | pass | subagent-report + schema tests cover strict researcher/tron/scanner-bundle variants. |
| AC2 | acceptance_criterion | Existing `adv-engineer` / `adv-reviewer` report behavior stays backward-compatible. | pass | schema/report/reviewer asset tests passed; task-scoped aliases and legacy behavior retained. |
| AC3 | acceptance_criterion | Taskless reports are queryable with explicit source metadata; final readback shape is chosen by design for cleanest stack fit. | pass | change/checkpoint tests passed; include.subagentReports sidecar readback merges scoped/legacy reports with metadata. |
| AC4 | acceptance_criterion | Scanner persistence uses orchestrator-submitted aggregate bundles; individual scanners keep no ADV tool access. | pass | optimized-handoff asset test passed; review/harden define orchestrator SCANNER_BUNDLE_REPORT and scanners do not submit reports. |
| AC5 | acceptance_criterion | Persisted report `follow_ups[]` create bounded, source-tagged agenda items. | pass | subagent-report tests passed; follow_ups capped and source-tagged as subagent-followup agenda items. |
| AC6 | acceptance_criterion | Harden inspects report-created agenda items and fixes those that are safe, adjacent, and campsite/touched-scope applicable; non-applicable items get rationale. | pass | optimized-handoff asset test passed; adv-harden has Report-Created Agenda Audit with fix/rationale handling. |
| AC7 | acceptance_criterion | All `enforceTaskPolicy` / stale `guards/` references are corrected, removed, or explicitly historical. | pass | stale-enforcement asset test passed; no live enforceTaskPolicy/runtime-enforced refs outside tests. |
| AC8 | acceptance_criterion | Specs, agent prompts, command packets, and tests lock schema variants, packet anchors, agenda behavior, readback shape, and malformed-report rejection. | pass | optimized-handoff, spec asset, schema, and tool tests passed; packet anchors and malformed-report rejection covered. |
| C1 | constraint | Preserve strict Zod validation at the ingest boundary. | respected | Strict Zod schemas and INVALID_REPORT path remain in subagent-report tool. |
| C2 | constraint | Preserve existing durable report semantics for `adv-engineer` and `adv-reviewer`. | respected | SupportedSubagentReportSchema remains task-scoped and allows legacy string scope. |
| C3 | constraint | Keep the main ADV agent as orchestrator; sub-agents do not complete gates or mutate orchestration state. | respected | Agents only submit own reports; adv-tron blocks change/task/gate mutations; orchestrator owns bundles/gates. |
| C4 | constraint | Do not claim runtime enforcement for built-in `task` dispatch unless it is actually implemented. | respected | Live docs now say agent-self-enforced/no runtime guard; stale-enforcement test guards it. |
| C5 | constraint | Prefer compact optimized handoff payloads over raw transcript persistence. | respected | Optimized report schemas persist compact sources/evidence/findings/summary; readback is opt-in. |
| C6 | constraint | Keep agenda follow-up generation bounded and source-tagged. | respected | consumeFollowUps caps to MAX_REPORT_FOLLOW_UPS and writes Source metadata. |
| C7 | constraint | Harden inspection must remain limited to safe, adjacent, campsite/touched-scope-applicable items. | respected | adv-harden Report-Created Agenda Audit requires safe+adjacent+campsite/touched-scope to fix; otherwise rationale/drift stop. |
| DONT1 | avoidance | Do not weaken strict report validation or rely on LLM-parsed prose as the only persistence path. | respected | Reviewer verdict READY; strict tool-call transport required. |
| DONT2 | avoidance | Do not allow sub-agents to complete gates, create changes, or own orchestration decisions. | respected | Reviewer verdict READY; sub-agents do not complete gates/create changes/own decisions. |
| DONT3 | avoidance | Do not introduce fake runtime enforcement claims without real implementation and tests. | respected | False runtime-enforcement claims removed and guarded by tests. |
| DONT4 | avoidance | Do not make scanner persistence so verbose that it defeats context-purity goals. | respected | Scanner persistence is aggregate bundle with bounded payload skeleton. |
| DONT5 | avoidance | Do not create unbounded agenda noise. | respected | follow_ups capped and source-tagged; tests cover agenda creation. |
| DONT6 | avoidance | Do not require harden to fix non-adjacent or unrelated agenda items. | respected | adv-harden explicitly does not require non-adjacent/unrelated agenda fixes; rationale path required. |
| DONT7 | avoidance | Do not expand into broad ADV latency remediation beyond report readback needs. | respected | Touched scope limited to report schemas/persistence/readback/tooling/prompts/specs/tests and harden agenda handling. |

