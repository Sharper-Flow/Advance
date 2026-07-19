# Archive Briefing Digest

**Change ID:** restoreDesignerFollowUp
**Title:** Restore designer follow-up
**Status:** archived
**Generated:** 2026-07-19T04:34:15.691Z

## Identity Anchors

- CHANGE
- STATUS
- TERMINAL_GATE_SUMMARY

## Archive Digest

**Status:** archived

| Gate | Status |
| --- | --- |
| proposal | done |
| discovery | done |
| design | done |
| planning | done |
| execution | done |
| acceptance | done |
| release | pending |

## Epic Context

No Epic membership

## Durable Facts

Showing 55 of 55 durable facts.

- **[report_follow_up]** follow_ups: Episode recall returned no relevant project decision; conclusions rely on current repository source and packet-provided agreement.
- **[report_follow_up]** follow_ups: lgrep semantic search timed out twice, including required hybrid:false retry; exact lgrep text search and targeted file reads provided source evidence.
- **[report_follow_up]** follow_ups: No user-surface candidate identified: approved agreement resolves preview fallback and adjacent-alignment tradeoffs, and all recommended changes are contract-tied, low-risk design adjustments or explicit no-ops.
- **[research_citation]** sources: Typed implementation provenance schema: Existing discriminated union already supports engineer, engineer_report, and inline provenance under a shared implementation cycle. (https://github.com/Sharper-Flow/Advance/blob/main/plugin/src/types/subagent-reports.ts#L82-L109)
- **[research_citation]** sources: Stable report identity and cycle suffix: subagentReportKey is shared, byte-stable identity and includes implementation cycle when present. (https://github.com/Sharper-Flow/Advance/blob/main/plugin/src/types/subagent-reports.ts#L1057-L1101)
- **[research_citation]** sources: Report submit response: Successful submission already returns reportId, enabling direct engineer_report handoff without reconstructing report identity. (https://github.com/Sharper-Flow/Advance/blob/main/plugin/src/tools/subagent-report.ts#L857-L879)
- **[research_citation]** sources.omitted: 10 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Core design is sound: restore upstream engineer-first routing, then reuse existing typed provenance, stable report identity, and reducer cycle guards. Highest leverage comes from one post-implementation follow-up funnel shared by delegated and inline success paths. Do not add another state machine, provenance union, preview schema, or designer-specific completion guard. Design still needs explicit packet/report wiring and semantic-test strengthening. Current designer neighboring-policy prose contradicts the approved same-surface alignment allowance and must be reconciled across synchronized surfaces.
- **[report_follow_up]** follow_ups: After design amendment, rerun design validation against exact Priority 1 semantics and failure-path assertions.
- **[report_follow_up]** follow_ups: Semantic tests must assert ordering and outcomes, not token presence; current weak test accepts contradictory law (https://github.com/Sharper-Flow/Advance/blob/main/plugin/src/delegation-matrix.test.ts#L726-L752).
- **[research_citation]** sources: Approved agreement and design, retrieved through ADV: Agreement requires engineer-first behavior for every metadata.frontend=true task, no initial designer-direct route, matching-cycle designer evidence, explicit incomplete/failure behavior, reviewer ownership, bounded same-surface designer scope, and fallback evidence. Design proposes one shared follow-up funnel using existing typed provenance. (adv://change/restoreDesignerFollowUp)
- **[research_citation]** sources: Current adv-apply routing: Current Priority 1 metadata.delegation_hint wins; Priority 1.5 metadata.frontend routes directly to adv-designer. This precedence must be changed or constrained, not merely the Priority 1.5 row. (https://github.com/Sharper-Flow/Advance/blob/main/.opencode/command/adv-apply.md#L406-L446)
- **[research_citation]** sources: Current designer packet contract: Current packet already carries bounded visual context, unavailable markers, quality dimensions, neighboring recommendations, and backend boundary, providing a simple base for a follow-up packet. (https://github.com/Sharper-Flow/Advance/blob/main/.opencode/command/adv-apply.md#L565-L607)
- **[research_citation]** sources.omitted: 10 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Core shape is correct and simpler than adding another state machine or provenance variant: reuse the existing strict provenance union, consume returned reportId, and preserve reducer cycle guards (https://github.com/Sharper-Flow/Advance/blob/main/plugin/src/types/subagent-reports.ts#L82-L109; https://github.com/Sharper-Flow/Advance/blob/main/plugin/src/tools/subagent-report.ts#L694-L715; https://github.com/Sharper-Flow/Advance/blob/main/plugin/src/temporal/change-state.ts#L937-L963). However, design is not yet spec-law complete. Current routing gives Priority 1 metadata.delegation_hint precedence over frontend classification, while design implementation strategy explicitly mentions replacing only Priority 1.5; that leaves a path for an adv-designer hint to violate SC1/AC1/DONT1 unless precedence/allowed-hint semantics are explicitly changed and tested (https://github.com/Sharper-Flow/Advance/blob/main/.opencode/command/adv-apply.md#L406-L446). Design also lacks an explicit orchestrator transition for designer spawn/report failure, despite SC2 requiring incomplete state with explicit failure; report schemas can durably represent status:error, but packet/funnel handling must require that outcome and forbid completion (https://github.com/Sharper-Flow/Advance/blob/main/plugin/src/types/subagent-reports.ts#L230-L323).
- **[unresolved_action]** validation.blockers: Routing precedence is unresolved: current Priority 1 metadata.delegation_hint wins over metadata.frontend, and design only names replacement of Priority 1.5. Without explicit frontend-safe hint semantics plus a semantic regression case, initial direct adv-designer dispatch remains possible, violating SC1, AC1, and DONT1 (https://github.com/Sharper-Flow/Advance/blob/main/.opencode/command/adv-apply.md#L406-L446).
- **[unresolved_action]** validation.blockers: Designer follow-up failure handling is underspecified. SC2 requires explicit failure while remaining incomplete; existing status:error and completion guards provide primitives, but design must define funnel behavior for spawn failure, malformed/missing report, status:error, and submit failure, and test that no path marks task done (https://github.com/Sharper-Flow/Advance/blob/main/plugin/src/types/subagent-reports.ts#L298-L323; https://github.com/Sharper-Flow/Advance/blob/main/plugin/src/temporal/change-state.ts#L937-L963).
- **[report_follow_up]** follow_ups: Caution: AC4 wording says classified reports reject missing provenance. Tests should explicitly prove the chosen new-report boundary rejects missing apply_context, not merely that completion later fails, while legacy stored reports remain readable.
- **[report_follow_up]** follow_ups: Caution: bounded remediation must have finite retry/escalation assertions so failure recovery cannot loop or silently complete.
- **[research_citation]** sources: Revised approved design and agreement: Revision explicitly bounds Priority-1 hints to eligibility, requires engineer-first delegated classified work, routes successful delegated and inline implementation through one designer follow-up funnel, and defines no-completion structured recovery for dispatch/report/verification failures. (adv://change/restoreDesignerFollowUp)
- **[research_citation]** sources: Current routing precedence requiring change: Current source gives metadata.delegation_hint Priority 1 and direct designer routing Priority 1.5; revised DDC3 and implementation strategy now explicitly constrain this precedence for classified work. (https://github.com/Sharper-Flow/Advance/blob/main/.opencode/command/adv-apply.md#L406-L446)
- **[research_citation]** sources: Existing typed provenance: Existing implementation_cycle_id plus engineer, engineer_report, and inline provenance variants support revised funnel without new schema arms. (https://github.com/Sharper-Flow/Advance/blob/main/plugin/src/types/subagent-reports.ts#L82-L109)
- **[research_citation]** sources.omitted: 5 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Revised design resolves both prior blockers. Priority-1 hints are now eligibility-only and cannot select the initial worker for metadata.frontend=true tasks, directly satisfying SC1/AC1/DONT1 at design level when paired with DDC3/DDC5 semantic tests (adv://change/restoreDesignerFollowUp; https://github.com/Sharper-Flow/Advance/blob/main/.opencode/command/adv-apply.md#L406-L446). Designer dispatch, malformed/error report, and verification failures now follow one explicit no-checkpoint recovery path with bounded remediation and unresolved retry/escalation, satisfying SC2 while relying on the existing matching-cycle completion authority (adv://change/restoreDesignerFollowUp; https://github.com/Sharper-Flow/Advance/blob/main/plugin/src/temporal/change-state.ts#L937-L963). AC4 is satisfied architecturally by requiring apply_context in every new classified follow-up packet, retaining stale/mismatch ingestion rejection, and preventing missing-context evidence from satisfying completion while preserving readability of legacy optional-context reports (https://github.com/Sharper-Flow/Advance/blob/main/plugin/src/types/subagent-reports.ts#L230-L323; https://github.com/Sharper-Flow/Advance/blob/main/plugin/src/temporal/change-state.ts#L1120-L1166).
- **[report_follow_up]** follow_ups: Packet omitted STOP_WHEN and VERIFICATION anchors; research continued under supplied scope per transport contract and used evidence-backed source inspection.
- **[report_follow_up]** follow_ups: Semantic lgrep search timed out with hybrid on and off; fallback exact lgrep search plus direct source reads succeeded.
- **[research_citation]** sources: Current modify delta schema: DeltaModifySchema exists but is private; its strict changes object permits an empty object and does not refine replacement scenario IDs against target_id. (file:///home/jon/dev/advance/plugin/src/types/specs.ts#L127-L185)
- **[research_citation]** sources: Current add-only public tool boundary: adv_delta_add intentionally excludes modify and protects Temporal reducer/archive ownership boundaries. (file:///home/jon/dev/advance/plugin/src/tools/spec-delta.ts#L1-L23)
- **[research_citation]** sources: Current Temporal add/read-back path: Existing operation validates payload, signals workflow, queries authoritative state, and updates projections only after confirming append. (file:///home/jon/dev/advance/plugin/src/storage/store-temporal/spec-deltas.ts#L15-L73)
- **[research_citation]** sources.omitted: 7 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Existing shape is sound: narrow change-owned delta intent, Temporal durable state, and archive-only global writes; engineer/designer evidence already has implementation-cycle anchoring. Bounded candidates, sorted by payoff/risk: (1) AUTO-ADOPT — export a modify-only schema/type and strengthen it with non-empty changes, delta/requirement ID validation, and target-consistent replacement scenario IDs; payoff high, risk low, ties AC8/DDC1, prior consideration new. (2) AUTO-ADOPT — when designer provenance kind is engineer_report, reducer must resolve report_key to a successful same-task, same-cycle adv-engineer report before persisting designer evidence; payoff high, risk low, ties AC2/AC4, prior consideration new. (3) AUTO-ADOPT — shared follow-up builder must consume reportId returned by adv_subagent_report_submit rather than reconstructing report keys; payoff medium, risk low, ties AC2/AC4, prior consideration new. (4) NO-OP — retain operation-specific Signal/store/read-back plumbing and existing task-completion guard; do not introduce Temporal Updates or a second designer-follow-up state machine for this restoration. Existing signal rejection records plus same-cycle completion guard provide the needed durable safety; payoff medium, risk low, ties AC8/AC2, prior consideration archived:updateSubagentDispatch/addSpecDeltaWriter. No user-value tradeoff candidate found, so nothing requires user surfacing.
- **[report_follow_up]** follow_ups: Packet warning: labeled TASK_SCOPE, IN_SCOPE, OUT_OF_SCOPE, DONE_WHEN, STOP_WHEN, and VERIFICATION anchors were absent; identity anchors were present, so research continued under the explicit user objective.
- **[report_follow_up]** follow_ups: Specify whether a designer report with status=complete but any non-zero verification exit_code, non-empty blockers, or blocking consumer warning is rejected at report ingest or simply non-authorizing at completion; prefer structural ingest consistency plus completion defense-in-depth.
- **[report_follow_up]** follow_ups: Specify that modified scenarios, when supplied, must be non-empty, unique by ID, exact children of target_id, and fully valid Given/When/Then records before signaling.
- **[report_follow_up]** follow_ups: Ensure no direct disk-projection recovery path is introduced for adv_delta_modify; mirror adv_delta_add refusal semantics.
- **[research_citation]** sources: Change agreement and design packet: Defines AC1-AC10, C1-C6, DONT1-DONT5, modify-only scope, archive-only global writes, engineer-first follow-up, returned reportId provenance, and incomplete-on-failure behavior. (adv://change/restoreDesignerFollowUp/design)
- **[research_citation]** sources: Existing add-only delta tool: Existing public tool validates add shape and target context, mutates only change-owned delta state through Store.specDeltas, and refuses direct disk recovery writes. (https://github.com/Sharper-Flow/Advance/blob/fa33e04c17579d5f56d3e8a2f13f6b063b1bcb48/plugin/src/tools/spec-delta.ts)
- **[research_citation]** sources: Existing Temporal spec-delta store path: Existing add path validates payload, signals workflow, queries authoritative state, then updates cache/projection. (https://github.com/Sharper-Flow/Advance/blob/fa33e04c17579d5f56d3e8a2f13f6b063b1bcb48/plugin/src/storage/store-temporal/spec-deltas.ts)
- **[research_citation]** sources.omitted: 10 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Design is structurally correct and simpler than alternatives. Modify-only adv_delta_modify reuses the existing typed modify variant, Store/Signal/Query/read-back lifecycle, and sole archive writer rather than introducing CRUD, direct spec edits, Temporal Updates, or a second archive engine (https://github.com/Sharper-Flow/Advance/blob/fa33e04c17579d5f56d3e8a2f13f6b063b1bcb48/plugin/src/archive/delta.ts; https://docs.temporal.io/develop/typescript/workflows/message-passing). Engineer-first then same-cycle designer follow-up aligns with existing implementation-cycle and report-key primitives, and returned reportId avoids heuristic key reconstruction (https://github.com/Sharper-Flow/Advance/blob/fa33e04c17579d5f56d3e8a2f13f6b063b1bcb48/plugin/src/tools/subagent-report.ts#L694-L715; https://github.com/Sharper-Flow/Advance/blob/fa33e04c17579d5f56d3e8a2f13f6b063b1bcb48/plugin/src/types/subagent-reports.ts#L82-L109). AC1-AC10, C1-C6, and DONT1-DONT5 are covered at design level. Two implementation-defining cautions must be made explicit before planning: (1) successful designer evidence must structurally require status=complete, empty blockers, and all required verification exit codes zero; current completion helper checks only status/task/cycle (https://github.com/Sharper-Flow/Advance/blob/fa33e04c17579d5f56d3e8a2f13f6b063b1bcb48/plugin/src/temporal/change-state.ts#L1092-L1105); (2) modify validation must run at both tool preflight and workflow reducer boundaries, verify the target exists in the named capability, reject empty changes, malformed/empty/duplicate scenario IDs and wrong scenario parents, and reject any existing same-target modify/remove/rename before state mutation. Strict/refined schemas are the canonical mechanism (https://github.com/colinhacks/zod/blob/v3.24.2/README.md).
- **[wisdom_candidate]** wisdom_candidates: [gotcha] Frontend routing is documented in both apply and prep command contracts; changing the execution path requires a stale-language scan across both surfaces, not only agent packets.
- **[archive_only_evidence]** changes_made: .opencode/command/adv-prep.md: Corrected stale designer-direct frontend-routing prose to match engineer-first classified UI implementation and matching-cycle designer follow-up.
- **[archive_only_evidence]** changes_made: plugin/src/adv-prep-assets.test.ts: Added regression assertions preventing stale designer-direct routing language in the prep command.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/adv-prep-assets.test.ts src/adv-designer-assets.test.ts src/temporal/change-state.test.ts src/temporal/change-state.spec-delta.test.ts src/tools/spec-delta.test.ts, CI=true bin/oc-test targeted -- src/adv-prep-assets.test.ts src/adv-designer-assets.test.ts src/temporal/change-state.test.ts src/temporal/change-state.spec-delta.test.ts src/tools/spec-delta.test.ts, git diff --check results=pass — Initial throttled test invocation stopped before tests because pnpm required CI confirmation to recreate the missing worktree modules directory. Diagnosed environment setup; reran with CI=true: 5 files, 165 tests passed. git diff --check passed. Reviewed typed modify validation/reducer atomicity, matching-cycle designer provenance and completion guards, and command/agent contract surfaces.
- **[unresolved_action]** required_main_agent_actions: Run the normal archive flow so dl-RestoreDel10 updates the global delegation-defaults spec; do not directly edit .adv/specs or docs/specs.
- **[unresolved_action]** required_main_agent_actions: After archive, rerun CI=true bin/oc-test targeted -- src/adv-prep-assets.test.ts src/tools/spec-delta.test.ts src/delegation-matrix.test.ts and confirm rq-delDefaults10 passes.
- **[unresolved_action]** required_main_agent_actions: If deployment is required, rerun the source deployment/build with CI=true after confirming the worktree dependency state; the post-commit deploy hook did not deploy stale dist.
- **[unresolved_action]** required_main_agent_actions: Leave plugin/src/tools/change.ts untouched; it remains the sole dirty, unstaged unrelated recovery change.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] A semantic regression test for archive-owned spec changes must assert the approved post-archive requirement semantics; before archive it should fail rather than silently accept a stale global spec through loose agent-name substrings.
- **[archive_only_evidence]** changes_made: .opencode/command/adv-prep.md: Aligned frontend metadata wording with engineer-first implementation and mandatory designer follow-up.
- **[archive_only_evidence]** changes_made: plugin/src/adv-prep-assets.test.ts: Added regression assertions rejecting designer-direct routing wording.
- **[archive_only_evidence]** changes_made: plugin/src/tools/spec-delta.ts: Corrected top-level documentation for typed add and narrow modify paths while preserving global-write and CRUD boundaries.
- **[archive_only_evidence]** changes_made: plugin/src/delegation-matrix.test.ts: Replaced loose agent-name substring assertions with engineer-first body and scenario semantics.
- **[archive_only_evidence]** changes_made: CHANGELOG.md: Added concise Unreleased entries for adv_delta_modify and engineer-first designer follow-up behavior.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/adv-prep-assets.test.ts src/tools/spec-delta.test.ts src/delegation-matrix.test.ts, CI=true bin/oc-test targeted -- src/adv-prep-assets.test.ts src/tools/spec-delta.test.ts src/delegation-matrix.test.ts, CI=true pnpm --dir plugin run check results=fail — Initial targeted command could not install dependencies without TTY. CI=true rerun executed 68 tests: 67 passed; delegation-matrix rq-delDefaults10 failed deterministically because current global spec is still designer-direct. pnpm check passed after Prettier formatting.

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| SC1 | success_criterion | pass |
| SC2 | success_criterion | pass |
| SC3 | success_criterion | pass |
| SC4 | success_criterion | pass |
| AC1 | acceptance_criterion | pass |
| AC2 | acceptance_criterion | pass |
| AC3 | acceptance_criterion | pass |
| AC4 | acceptance_criterion | pass |
| AC5 | acceptance_criterion | pass |
| AC6 | acceptance_criterion | pass |
| AC7 | acceptance_criterion | pass |
| AC8 | acceptance_criterion | pass |
| AC9 | acceptance_criterion | pass |
| AC10 | acceptance_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| C4 | constraint | respected |
| C5 | constraint | respected |
| C6 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |
| DONT4 | avoidance | respected |
| DONT5 | avoidance | respected |
| OOS1 | out_of_scope | respected |
| OOS2 | out_of_scope | respected |
| OOS3 | out_of_scope | respected |
| OOS4 | out_of_scope | respected |
| OOS5 | out_of_scope | respected |

## Unresolved Actions

- Routing precedence is unresolved: current Priority 1 metadata.delegation_hint wins over metadata.frontend, and design only names replacement of Priority 1.5. Without explicit frontend-safe hint semantics plus a semantic regression case, initial direct adv-designer dispatch remains possible, violating SC1, AC1, and DONT1 (https://github.com/Sharper-Flow/Advance/blob/main/.opencode/command/adv-apply.md#L406-L446).
- Designer follow-up failure handling is underspecified. SC2 requires explicit failure while remaining incomplete; existing status:error and completion guards provide primitives, but design must define funnel behavior for spawn failure, malformed/missing report, status:error, and submit failure, and test that no path marks task done (https://github.com/Sharper-Flow/Advance/blob/main/plugin/src/types/subagent-reports.ts#L298-L323; https://github.com/Sharper-Flow/Advance/blob/main/plugin/src/temporal/change-state.ts#L937-L963).
- Run the normal archive flow so dl-RestoreDel10 updates the global delegation-defaults spec; do not directly edit .adv/specs or docs/specs.
- After archive, rerun CI=true bin/oc-test targeted -- src/adv-prep-assets.test.ts src/tools/spec-delta.test.ts src/delegation-matrix.test.ts and confirm rq-delDefaults10 passes.
- If deployment is required, rerun the source deployment/build with CI=true after confirming the worktree dependency state; the post-commit deploy hook did not deploy stale dist.
- Leave plugin/src/tools/change.ts untouched; it remains the sole dirty, unstaged unrelated recovery change.
