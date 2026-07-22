# Archive Briefing Digest

**Change ID:** tightenToolOutputDefaults
**Title:** Tighten tool output defaults
**Status:** archived
**Generated:** 2026-07-22T19:06:44.105Z

## Identity Anchors

- CHANGE
- STATUS
- TERMINAL_GATE_SUMMARY
- Origin: discovery

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

Epic: systemizeAdvOrchestration · Tighten tool output defaults (mutation auto-emit → opt-in) (order 6)

## Durable Facts

Showing 33 of 33 durable facts.

- **[archive_only_evidence]** verification: tests_run=adv_change_show changeId:tightenToolOutputDefaults, adv_spec show chat-output-display, adv_spec show advance-meta, grep rq-advStatusLazyView01 .adv/specs/advance-meta/spec.json, adv_change_validate changeId:tightenToolOutputDefaults results=pass — adv_change_show returned all three required modify deltas with correct capability/target IDs and default-OFF/opt-in bodies. Shipped specs contain rq-ctxsnap2 (line 53), rq-ctxticker2 (line 134), and rq-advStatusLazyView01 (line 2391). adv_change_validate passed with errors:[]; only three non-fatal OVERLAPPING_CAPABILITY warnings for advance-meta remained.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: adv_change_show changeId:tightenToolOutputDefaults
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: adv_spec show chat-output-display
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: adv_spec show advance-meta
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: grep rq-advStatusLazyView01 .adv/specs/advance-meta/spec.json
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: adv_change_validate changeId:tightenToolOutputDefaults
- **[report_follow_up]** follow_ups: Report schema rejected a top-level scout_candidates array and architecture_judgement.summary; the five structured candidates are retained in architecture_assessment. Schema also requires a non-empty alternatives_considered array, so persistence could not retain the packet's requested empty array.
- **[research_citation]** sources: ADV context snapshot emission spec: Retrieved through adv_spec: major transitions emit full snapshots; transient task-state tools use tickers. (file:///home/jon/dev/advance/.adv/specs/chat-output-display.md#rq-ctxsnap2)
- **[research_citation]** sources: Local ticker implementation: Single fetchChangeContextTicker implementation builds the ticker after change and gate reads. (file:///home/jon/dev/advance/plugin/src/storage/context-snapshot-fetch.ts#L60-L83)
- **[research_citation]** sources: Zod official API: Zod object schemas expose reusable shapes and composition methods; Context7 sourced from the official Zod repository. (https://zod.dev/api)
- **[research_citation]** sources.omitted: 1 additional source omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Five production ticker emissions were found: task.ts:572, 1164, 1505, 1809 and wisdom.ts:210. SC-1 [AUTO-ADOPT/execution]: gate ticker fetch/attachment in maybeAttachChangeTicker(output, store, changeId, include?.snapshot); evidence task.ts:572-610, 1159-1172, 1503-1527, 1805-1819; wisdom.ts:208-222; context-snapshot-fetch.ts:60-83; tie rq-ctxticker2/KD1; low risk—preserve wisdom's current catch policy. SC-2 [AUTO-ADOPT/execution]: reusable nested includeSnapshotSchema for eight mutation/ready args; evidence change.ts:942-975, target-project.ts:74-93, task.ts:1244-1247, https://zod.dev/api; tie rq-advChangeShowInclude01/KD1; low risk—do not extract change_show's unrelated flags. SC-3 [AUTO-ADOPT/execution]: table-drive default absent vs include.snapshot:true ticker tests with existing hoisted mock; evidence task.test.ts:12-42, 87-126, change.ts:970-975; tie rq-ctxsnap2/rq-ctxticker2/KD3; low risk—keep KD3 full-box tests separate. SC-4 [AUTO-ADOPT/execution]: table-driven semantic asset assertions for adv-apply.md, adv-prep.md, adv.md; evidence adv-instructions-assets.test.ts:143-150 and briefing-packets-command-assets.test.ts:40-58,70-173; tie rq-ctxsnap2/rq-ctxticker2; low-medium risk—avoid prose-exact assertions. SC-5 [SURFACE/planning]: author spec deltas and test matrix concurrently; evidence task.test.ts:12-42 and change.ts:942-975; tie rq-ctxsnap2/rq-ctxticker2/rq-advStatusLazyView01; medium risk—names must remain locked and integration follows wiring. No status-enrich.ts or tool-registry.ts recommendation.
- **[report_follow_up]** follow_ups: WORKING DIRECTORY: /home/jon/dev/advance
- **[report_follow_up]** follow_ups: CHANGE: tightenToolOutputDefaults | Tighten tool output defaults
- **[report_follow_up]** follow_ups: SCOPE KEY: researcher:design-validation
- **[report_follow_up]** follow_ups: ATTEMPT: 1
- **[report_follow_up]** follow_ups: TASK_SCOPE: validate the proposed design against agreement, specs, and external evidence
- **[report_follow_up]** follow_ups: IN_SCOPE: inline design/agreement, named specs, and optional docs/examples research.
- **[report_follow_up]** follow_ups: OUT_OF_SCOPE: design rewriting, unapproved scope, and user-value decisions including adv_status snapshot inversion.
- **[report_follow_up]** follow_ups: DONE_WHEN: sourced findings or explicit inconclusive notes cover correctness, simplicity, spec-law compliance, and key alternatives.
- **[report_follow_up]** follow_ups: STOP_WHEN: contract compromise, security/release blocker, or conflict requiring orchestrator decision.
- **[report_follow_up]** follow_ups: VERIFICATION: official/local source evidence for each caution or conflict where possible; additional checks optional.
- **[research_citation]** sources: Chat Output Display specs: Current MUST rules require full snapshots for three major transition tools and tickers for four task tools; proposed inversion therefore requires the planned spec deltas. (file:///home/jon/dev/advance/.adv/specs/chat-output-display/spec.json#rq-ctxsnap2,rq-ctxticker2)
- **[research_citation]** sources: Advance Meta spec: Current lazy-view requirement explicitly preserves required status snapshot emission across views; status recommendation snapshots must remain untouched under C3. (file:///home/jon/dev/advance/.adv/specs/advance-meta/spec.json#rq-advStatusLazyView01)
- **[research_citation]** sources: Advance Delivery spec: adv_change_show already uses an opt-in include.snapshot pattern and preserves no-snapshot default behavior. (file:///home/jon/dev/advance/.adv/specs/advance-delivery/spec.json#rq-advChangeShowInclude01)
- **[research_citation]** sources.omitted: 5 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Correctness: default-off plus explicit include.snapshot is sound when every emission fetch/build is inside the guard. KD4 needs correction: the present `pretty` option cannot honor explicit outputMode:'compact' when ADV_TOOL_OUTPUT_MODE=pretty. Simplicity: a shared snapshot field schema and ticker helper are the least-complex approach; do not generalize bespoke full-box directive derivation. Spec-law: current rq-ctxsnap2/rq-ctxticker2 require automatic emission, so target-hash-protected modify deltas are mandatory; retain rq-advStatusLazyView01 status emission because C3 preserves it. AC7 is a genuine agreement citation compromise, not a reason to expand status-enrichment scope.
- **[unresolved_action]** validation.blockers: KD4 cannot implement an explicit compact override with the existing `formatToolOutput({ pretty })` contract: `pretty:false` evaluates through `options?.pretty || OUTPUT_MODE === "pretty"`, so an environment value of pretty still serializes pretty output.
- **[unresolved_action]** required_main_agent_actions: Record spec deltas dl-xtxFRdk1ybRO, dl-tb1q3HJWCv2u, and dl-dExfd5Lb947l in change state.
- **[unresolved_action]** required_main_agent_actions: Persist tk-14a8e307034d verification summary with ~2140-byte measurement, exceeded DDC6 threshold, and KEEP nested-shape KD1 decision.
- **[unresolved_action]** required_main_agent_actions: Request a new reviewer evidence pass after state is visible.
- **[archive_only_evidence]** verification: tests_run= results=n/a — Evidence-only review. adv_task_show confirmed task policies/statuses. adv_change_show artifactOnly returned artifact metadata; full change projection reported `deltas: {}`. No repository changes or executable checks applicable.
- **[epic_terminal_note]** epic.membership: systemizeAdvOrchestration · Tighten tool output defaults (mutation auto-emit → opt-in) (order 6)

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| SC1 | success_criterion | pass |
| SC2 | success_criterion | pass |
| SC3 | success_criterion | pass |
| AC1 | acceptance_criterion | pass |
| AC2 | acceptance_criterion | pass |
| AC3 | acceptance_criterion | pass |
| AC4 | acceptance_criterion | pass |
| AC5 | acceptance_criterion | pass |
| AC6 | acceptance_criterion | pass |
| AC7 | acceptance_criterion | pass |
| AC8 | acceptance_criterion | pass |
| AC9 | acceptance_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| C4 | constraint | respected |
| C5 | constraint | respected |
| C6 | constraint | respected |
| C7 | constraint | respected |
| C8 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |
| DONT4 | avoidance | respected |
| DONT5 | avoidance | respected |
| OOS1 | out_of_scope | missing |
| OOS2 | out_of_scope | missing |
| OOS3 | out_of_scope | missing |
| OOS4 | out_of_scope | missing |
| OOS5 | out_of_scope | missing |
| OOS6 | out_of_scope | missing |
| OOS7 | out_of_scope | missing |
| OOS8 | out_of_scope | missing |

## Unresolved Actions

- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: adv_change_show changeId:tightenToolOutputDefaults
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: adv_spec show chat-output-display
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: adv_spec show advance-meta
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: grep rq-advStatusLazyView01 .adv/specs/advance-meta/spec.json
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: adv_change_validate changeId:tightenToolOutputDefaults
- KD4 cannot implement an explicit compact override with the existing `formatToolOutput({ pretty })` contract: `pretty:false` evaluates through `options?.pretty || OUTPUT_MODE === "pretty"`, so an environment value of pretty still serializes pretty output.
- Record spec deltas dl-xtxFRdk1ybRO, dl-tb1q3HJWCv2u, and dl-dExfd5Lb947l in change state.
- Persist tk-14a8e307034d verification summary with ~2140-byte measurement, exceeded DDC6 threshold, and KEEP nested-shape KD1 decision.
- Request a new reviewer evidence pass after state is visible.
