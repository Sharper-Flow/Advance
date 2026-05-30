# Add Handoff Reports

## Why
ADV intends sub-agents to run noisy task, research, review, and scanner loops while the main `adv` agent stays clean for orchestration. Today that contract is only partially durable: `adv-engineer` and `adv-reviewer` submit strict persisted reports, while `adv-researcher`, `adv-tron`, and `explore` scanner lanes return prose or transient scanner output. In parallel, the docs reference `enforceTaskPolicy` as runtime enforcement even though no implementation exists, creating false confidence about task-spawn enforcement.

## What Changes
- Replace stale `enforceTaskPolicy` runtime-enforcement claims with accurate structural enforcement language: sub-agents are constrained by `task: false`, primary agents own dispatch limits, and future runtime enforcement requires a host hook or ADV-owned delegation tool.
- Add persisted optimized handoff/report schemas for `adv-researcher`, `adv-tron`/recon, and scanner lanes.
- Extend `adv_subagent_report_submit` to accept and validate the new handoff report variants.
- Update sub-agent prompts and command packets so parent-facing output is compact structured handoff data, not raw transcript/prose.
- Update review/harden scanner flows to persist compact scanner reports or aggregate scanner bundles for orchestration and audit.
- Add bounded agenda follow-up handling for persisted reports and update harden guidance so agenda items created by these report flows are inspected and fixed when they qualify under campsite/touched-scope rules.
- Update specs, docs, and tests that define sub-agent report transport and delegation defaults.

## Success Criteria
- `adv_subagent_report_submit` accepts valid optimized handoff reports for `adv-researcher`, `adv-tron`, and scanner lanes, and rejects malformed payloads structurally.
- Persisted reports are queryable through existing change/task read surfaces or an explicitly documented equivalent read surface.
- `adv-engineer` and `adv-reviewer` report behavior remains backward-compatible.
- Review/harden scanner results no longer rely only on main-agent chat context for auditability.
- Bounded `follow_ups[]` from all persisted report variants can create source-tagged agenda items without unbounded agenda noise.
- Harden guidance requires report-created agenda items to be inspected and fixed when they are safe, adjacent, and campsite/touched-scope applicable; non-applicable items must be documented rather than silently ignored.
- All active and historical `enforceTaskPolicy` / stale `guards/` references are corrected, removed, or explicitly marked historical so no current doc claims nonexistent runtime enforcement.
- Asset/schema/tool tests cover new report variants, packet anchors, prompt requirements, agenda follow-up behavior, readback shape, and unsupported/malformed report behavior.

## Affected Code
- `plugin/src/types/subagent-reports.ts`
- `plugin/src/tools/subagent-report.ts`
- `plugin/src/temporal/change-state.ts` and task/report persistence/readback surfaces as needed
- `.opencode/agents/adv.md`, `.opencode/agents/adv-researcher.md`, `.opencode/agents/adv-tron.md`
- `.opencode/command/adv-review.md`, `.opencode/command/adv-harden.md`, and any discovery/design packets that spawn `adv-researcher`
- `.adv/specs/subagent-reports/spec.json`
- `.adv/specs/delegation-defaults/spec.json`
- Relevant active docs plus README/CHANGELOG/project context references that mention `enforceTaskPolicy` or stale `guards/`
- Relevant asset, schema, and tool tests under `plugin/src/`

## Related Repositories
- Current repository only: `advance`.
- No product-linked multi-repo scope detected in `project.json`.

## Constraints
- Preserve strict Zod validation at the ingest boundary.
- Preserve existing durable report semantics for `adv-engineer` and `adv-reviewer`.
- Keep the main ADV agent as orchestrator; sub-agents do not complete gates or mutate orchestration state.
- Do not claim runtime enforcement for built-in `task` dispatch unless it is actually implemented.
- Prefer compact optimized handoff payloads over raw transcript persistence.
- Keep agenda follow-up generation bounded and source-tagged; harden inspection must not become unrelated repo-wide cleanup.

## Impact
- Improves ADV as an agent harness by making sub-agent-to-agent handoff durable, queryable, and compact.
- Reduces dependence on chat context for researcher/recon/scanner findings.
- Removes misleading enforcement language that could hide real harness limitations.
- Converts report-generated follow-ups into actionable, bounded agenda items and ensures harden does not silently ignore campsite-applicable follow-ups.

## Context
Existing evidence:
- `subagent-reports` spec v1 supports only `adv-engineer` and `adv-reviewer`, while reserving `adv-researcher` and `adv-tron` for future extension.
- `delegation-defaults` explicitly describes scanner lanes as non-persisted today.
- Search found `enforceTaskPolicy` only in docs/instructions, not implementation.
- Competitor comparison shows strong precedent for agent-as-tool semantics with compact parent-visible outputs.

## Scope

### In Scope
- Accurate `enforceTaskPolicy` wording or replacement guidance across all references.
- New strict report schemas for researcher, tron/recon, and scanner optimized handoffs.
- Submit-tool support, validation, persistence, readback, and tests for new report variants.
- Bounded report follow-up to agenda handling across persisted report variants.
- Harden inspection rule for report-created agenda items when campsite/touched-scope criteria apply.
- Agent/command packet updates requiring compact structured handoff output.
- Spec-law updates for sub-agent reports, delegation defaults, and harden agenda handling.

### Out of Scope
- Generic OpenCode built-in `task` middleware unless OpenCode exposes a stable hook.
- Nested teams or sub-agents spawning sub-agents.
- Role-to-role handoff where the main ADV orchestrator loses control.
- Full raw transcript persistence as the primary handoff mechanism.
- Broad latency remediation unrelated to handoff report readback.
- Unrelated repo-wide cleanup of agenda items outside report-created/campsite-applicable scope.

### Must Not
- Must not weaken strict report validation or rely on LLM-parsed prose as the only persistence path.
- Must not allow sub-agents to complete gates, create changes, or own orchestration decisions.
- Must not introduce a fake runtime enforcement claim without a real implementation and tests.
- Must not make scanner persistence so verbose that it defeats context-purity goals.
- Must not create unbounded agenda noise or require harden to fix non-adjacent/unrelated agenda items.

## Discovery Agenda
- Determine final implementation shape for taskless report identity: explicit change-level bucket versus deterministic surrogate IDs.
- Define the optimized handoff schema fields and size limits for each lane.
- Verify current OpenCode support for blocking sub-agent `question` usage or further constraining tool grants.
- Confirm whether any active change (`addDelegationMatrix`, `improveAdvLatency`) should be linked, superseded, or left independent during discovery.

## Ambiguity Scan
- B Boundaries: PASS — In Scope, Out of Scope, and Must Not are populated.
- F Functional Scope: PASS — Success Criteria are testable at schema/tool/prompt/spec levels.
- S Completion Signals: PASS — completion can be verified through accepted/rejected report payloads, readback, docs search for `enforceTaskPolicy`, and test coverage.

## Research Validation

### Summary
Architecture validated with one discovery-resolved direction: scanner persistence should be orchestrator-aggregated, not direct scanner submission.

### Architecture Health Assessment
Classification: `SOUND` with targeted corrections.

| Area | Existing | Reference | Deviation | Impact |
|---|---|---|---|---|
| Typed worker handoff | `adv-engineer` and `adv-reviewer` use strict Zod reports via `adv_subagent_report_submit` | Agent-as-tool/subagent systems return compact parent-facing output, not raw transcripts | Minor gap for researcher/tron/scanner lanes | Extend existing pattern rather than redesign harness |
| Persistence location | Current reports persist only on `task.subagent_reports[]` | Research/recon/scanner findings often exist before tasks | Change-level report bucket likely needed | Avoid fake tasks and preserve truthful lifecycle state |
| Scanner transport | `explore` scanner lanes are explicitly non-persisted and have no ADV tool access | Lead/orchestrator synthesizes compact results from noisy workers | Direct scanner submit would violate current boundary | Prefer one orchestrator-submitted scanner bundle |
| Enforcement wording | Docs claim `enforceTaskPolicy` runtime enforcement | Actual enforcement is tool grants/platform constraints + orchestrator protocol | Documentation defect | Replace false claim; do not implement fake guard |

### Validated Decisions
- Keep existing strict Zod/discriminated-union report architecture.
- Add researcher and tron report variants as additive schema extensions.
- Expose taskless reports through a readback shape chosen during design; agent recommendation is merged `_subagentReports` with explicit `_source` and meta counts.
- Persist scanner results as orchestrator-synthesized aggregate bundles instead of giving scanners ADV tool access.
- Correct `enforceTaskPolicy` prose to reflect real enforcement: sub-agent `task:false` and orchestrator protocol, not plugin runtime guard.
- Add bounded auto-agenda for explicit report follow-ups and ensure harden inspects report-created agenda items when campsite/touched-scope applies.

### Concerns
- Direct scanner submission would contradict `delegation-defaults`, `subagent-reports`, `adv-review`, and `adv-harden` contracts.
- Making `task_id` optional requires careful dedupe/readback design so existing task-level reports remain backward-compatible.
- Temporal workflow switch logic must be extended exhaustively for new variants; passive analysis lanes should not automatically update task `error_recovery` unless intentionally designed.
- Follow-up auto-agenda must be bounded to avoid replacing context bloat with agenda bloat.

### Recommended Implementation Direction
1. Truth fix: remove or replace every `enforceTaskPolicy` runtime-enforcement claim and stale `guards/` reference.
2. Add `ResearcherSubagentReportSchema` and `TronSubagentReportSchema` matching current prompt outputs: findings, assessment, validation, recommendation, sources/evidence, bounded `follow_ups[]`.
3. Add taskless report support with explicit source-tagged readback; design should choose the stack-cleanest identity strategy.
4. Add `ScannerBundleSubagentReportSchema` submitted by the orchestrator after review/harden scanner synthesis.
5. Keep individual `explore` scanners non-persisted and without ADV tool access.
6. Update `adv_change_show include.subagentReports` to return both task-level and taskless reports with source metadata.
7. Extend agenda consumer to all report variants with bounded, source-tagged `follow_ups[]`.
8. Update harden contracts so report-created agenda items are inspected and campsite-applicable items are fixed or documented.
9. Update specs and asset/schema/tool tests to lock packet anchors, prompt instructions, agenda behavior, and rejection behavior.

### Sources
- Repo: `plugin/src/types/subagent-reports.ts`, `plugin/src/tools/subagent-report.ts`, `plugin/src/types/signals.ts`, `plugin/src/temporal/change-state.ts`, `plugin/src/tools/change.ts`, `docs/agent-tool-contracts.md`, `.adv/specs/subagent-reports/spec.json`, `.adv/specs/delegation-defaults/spec.json`.
- Anthropic subagents/context isolation: https://platform.claude.com/docs/en/agent-sdk/subagents
- Anthropic context engineering: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- OpenAI Agents SDK agent-as-tool output extraction: https://github.com/openai/openai-agents-python/blob/main/docs/tools.md
- Microsoft Agent Framework agents-as-tools: https://learn.microsoft.com/en-us/agent-framework/journey/agents-as-tools
- LangChain subagents: https://docs.langchain.com/oss/python/langchain/multi-agent/subagents
- Temporal safe deployments/message idempotency/patching: https://docs.temporal.io/develop/safe-deployments, https://docs.temporal.io/handling-messages, https://docs.temporal.io/patching

### Contract Tracking
CONTRACT ACTIVE
- Correct stale enforcement docs.
- Extend durable optimized handoffs to researcher/tron/scanner lanes.
- Preserve strict validation and orchestrator ownership.
- Keep scanner persistence compact and aggregated.
- Add bounded agenda follow-up handling and harden inspection for campsite-applicable report-created agenda items.

CONTRACT FULFILLED
- Evidence: proposal updated with sourced research validation and recommended architecture.
- Status: COMPLETE

## Discovery Findings

### Discovery Checklist
| Step | Status | Result |
|---|---|---|
| Skill Discovery | PASS | Loaded `adv-agent-tool-contracts`; scout skill attempted via `adv-researcher`. No pending-review skills found. |
| Prior Research Extension | PASS | Cited `docs/repo-improve-prep.md`; it supports latency/observability relevance and notes slow `adv_change_list`/`adv_status` patterns. New finding: current conflict-scan timeouts reinforce need for compact readback and telemetry but do not change handoff-report scope. |
| Conflict & Related-Work Scan | PARTIAL | `adv_wip_state` found active `addDelegationMatrix` and `improveAdvLatency`; `adv_change_list` and `adv_change_validate` timed out despite healthy Temporal diagnosis. No direct conflict identified; possible related work should be reviewed during design. |
| Edge Case Investigation | PASS | Edge cases recorded below. |
| Design Question Depth | PASS | Open design questions annotated below. |
| Draft Spec Delta Shapes | PASS | Draft `rq-*` shapes listed below. |
| P25 Related-Pattern Scan | PASS | Similar patterns found: `enforceTaskPolicy`, `non_persisted_scanner`, `UNSUPPORTED_AGENT`, task-only `subagent_reports`. |
| LBP Check | PASS | LBP is compact typed parent-facing handoff, taskless report support, and orchestrator-synthesized scanner bundles. |

### Skills Considered
- `adv-agent-tool-contracts`: matched; governs schema, packet anchors, prompt mapping, worker/scanner transport, tests, and specs.
- `adv-opportunity-scout`: attempted through `adv-researcher`; produced five candidate refinements.
- Other skills: no stronger core-domain match than agent tool contracts.

### Extends
- `docs/repo-improve-prep.md`: relevant sections: Current State, Observability, Code Quality, LBP/Reference Comparison, Applicability to This Repo. It highlights ADV latency/readback pain and missing production timing surfaces. New finding for this change: discovery-time `adv_change_list`/`adv_change_validate` timeouts provide live evidence that compact, queryable report surfaces and telemetry are valuable, but latency remediation remains separate from this scope.

### Conflict Scan
- Active related changes: `addDelegationMatrix` owns delegation matrix prior work; `improveAdvLatency` owns latency/performance work. This change should update `delegation-defaults` and avoid absorbing broad latency remediation.
- Active agenda overlap: `Stop asking for attempt numbers` may intersect packet ergonomics; keep packet anchor changes explicit and avoid asking users for attempts.
- Validation tool result: inconclusive due timeout; Temporal diagnosis reported healthy. Treat as non-blocking discovery warning, not evidence of spec conflict.

### Current State
- `SupportedSubagentReportSchema` supports `adv-engineer` and `adv-reviewer` only.
- `SubagentAgentSchema` already reserves `adv-researcher` and `adv-tron`.
- `adv_subagent_report_submit` rejects researcher/tron with `UNSUPPORTED_AGENT`.
- Persistence is task-scoped only through `task.subagent_reports[]`.
- `adv_change_show include.subagentReports` only flattens task-scoped reports.
- Scanner lanes are explicitly non-persisted and must not call `adv_subagent_report_submit`.
- `enforceTaskPolicy` appears as a prose/runtime claim but has no implementation.

### Edge Cases
1. Taskless report dedupe: researcher/tron/scanner-bundle reports lack real task IDs; unstable synthetic IDs would break idempotency.
2. Readback compatibility: merging task- and taskless reports silently could confuse consumers that assume every report maps to an existing task.
3. Scanner verbosity: aggregate bundles could become transcript-by-proxy unless field lengths and per-scanner rows are bounded.
4. Passive-analysis blockers: researcher/tron/scanner findings should not automatically set task `error_recovery` unless a real task is blocked.
5. Schema evolution: changing base required fields can invalidate existing report tests; additive variants and compatibility guards are safer.
6. Prompt drift: fixing `enforceTaskPolicy` prose once is insufficient without an asset test to prevent recurrence.
7. Agenda bloat: report follow-ups could create too many agenda items unless bounded, tagged, and deduped.
8. Harden overreach: harden could drift into unrelated cleanup unless report-created agenda inspection is limited to campsite/touched-scope applicability.

### Open Design Questions
1. Report anchoring: use optional `task_id` plus change-level bucket, or deterministic surrogate `task_id` while preserving base schema? Trust model: agent-owned technical decision. Blast radius: dedupe/readback and schema complexity. Alternatives: optional task ID; surrogate ID; fake tasks. Recommendation: choose stack-cleanest shape during design, with explicit source-tagged readback.
2. Scanner persistence: orchestrator aggregate vs direct scanner submission. Trust model: agent-owned technical decision. Blast radius: scanner tool grants and spec contracts. Alternatives: direct scanner submit; orchestrator bundle; leave non-persisted. Recommendation: orchestrator bundle.
3. Follow-up routing: bounded auto-agenda for explicit `follow_ups[]`. Trust model: user-resolved. User decision: use bounded auto-agenda and add harden inspection/fix rule for campsite-applicable created agenda items.
4. Readback UX: same `_subagentReports` list with `_source` metadata vs separate arrays. Trust model: agent-owned after user deferred preference. User decision: no preference; agent recommendation is merged list plus source tags/meta counts unless design finds a cleaner stack fit.
5. Enforcement scope: user-resolved. User decision: clean all references, not only active prompts.

### Draft Spec Deltas
- `rq-subagentReports06`: Researcher and tron reports SHALL be strict Zod-validated optimized handoff reports and persist durably without relying on final-message prose.
  - Given a valid `adv-researcher` report, when submitted, then it persists and is queryable.
  - Given malformed sources/recommendation fields, when submitted, then validation rejects before signal.
- `rq-subagentReports07`: Scanner findings SHALL persist as orchestrator-submitted aggregate bundles; individual scanners remain non-persisted and have no ADV tool access.
  - Given review/harden scanner outputs, when synthesis completes, then one scanner bundle can be persisted.
  - Given an `explore` scanner prompt, then it is not instructed to call `adv_subagent_report_submit`.
- `rq-subagentReports08`: Readback SHALL distinguish task-scoped and taskless reports with explicit source metadata.
  - Given both report scopes exist, when `adv_change_show include.subagentReports` runs, then meta counts and row source are present.
- `rq-subagentReports09`: Persisted report variants SHALL support bounded, source-tagged `follow_ups[]` that can create agenda items without unbounded agenda noise.
  - Given a report has explicit follow-ups, when submit succeeds, then bounded agenda items are created with source metadata.
- `rq-delDefaults07`: Delegation docs SHALL distinguish structural sub-agent spawn limits from nonexistent runtime enforcement claims.
  - Given agent docs mention task spawning limits, when checked, then they cite `task:false`/orchestrator protocol, not `enforceTaskPolicy` runtime enforcement.
- `rq-hardenAgendaFollowups01`: Harden SHALL inspect report-created agenda items and fix items that are safe, adjacent, and campsite/touched-scope applicable; non-applicable items SHALL be documented.
  - Given report-created agenda items exist for the change, when harden runs, then each is inspected, fixed if applicable, or documented with rationale.

### Related Pattern Scan
- `enforceTaskPolicy`: 4 active prose references, no implementation.
- `non_persisted_scanner`: spec/test references define current scanner lane boundary.
- `UNSUPPORTED_AGENT`: submit tool/test/spec encode current researcher/tron rejection.
- `subagent_reports`: task-only persistence/readback in `change-state`, `task.ts`, `change.ts`, and tests.
- `follow_ups`: currently engineer-focused; new report variants need bounded follow-up handling.

### Discovery Opportunity Scout
- Candidates considered: 5.
- Auto-adopted now: asset-test guard for `enforceTaskPolicy` prose; generalized `follow_ups` handling for new report variants.
- Design-around: deterministic taskless report identity; structural scanner-bundle rows with bounded field lengths; source-tagged readback.
- Surfaced to user and resolved: agenda/follow-up behavior, readback UX, and enforcement cleanup scope.

### LBP Check
Likely direction matches LBP: keep strict typed report ingest, additive discriminated-union variants, deterministic dedupe, compact parent-visible summaries, no raw transcript persistence, and no scanner tool-grant expansion. External reference patterns from Anthropic, OpenAI Agents SDK, Microsoft Agent Framework, and LangChain support this shape.

### AMBIGUITY ANALYSIS — no blocking ambiguity findings. Coverage: B:C F:C S:C M:C
- Single warning resolved: readback shape preference deferred to agent design judgment, with recommendation to use merged `_subagentReports` plus `_source` and meta counts unless design finds a cleaner stack fit.

### Recommended Objectives
1. Make optimized sub-agent handoffs durable for researcher, tron/recon, and scanner-bundle lanes.
2. Preserve existing engineer/reviewer task-scoped report behavior.
3. Add taskless report readback with explicit source metadata and deterministic identity.
4. Keep individual scanners non-persisted/no ADV tool access; persist only orchestrator-synthesized scanner bundles.
5. Generalize bounded follow-up handling for all persisted report variants.
6. Ensure harden inspects report-created agenda items and fixes campsite/touched-scope-applicable items.
7. Correct all `enforceTaskPolicy` and stale `guards/` references, not only active prompts.
