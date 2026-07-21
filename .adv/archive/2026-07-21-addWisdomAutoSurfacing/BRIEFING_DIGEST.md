# Archive Briefing Digest

**Change ID:** addWisdomAutoSurfacing
**Title:** Add wisdom auto-surfacing
**Status:** archived
**Generated:** 2026-07-21T20:50:06.012Z

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
| release | done |

## Epic Context

No Epic membership

## Durable Facts

Showing 26 of 26 durable facts.

- **[report_follow_up]** follow_ups: Re-run design validation after D1 ordering and D5 checkpoint ownership are corrected.
- **[research_citation]** sources: Approved agreement (inline packet): AC1 requires `_relevantWisdom` to be the top five entries by recency whenever `contract_refs.implements` is non-empty; AC5 requires checkpoint counts. (https://github.com/Sharper-Flow/Advance)
- **[research_citation]** sources: Current wisdom tool source: `adv_wisdom_list` documents `query` as relevance-ranked FTS and routes it through `store.wisdom.search`, so its query path does not establish AC1's recency ordering. (https://github.com/Sharper-Flow/Advance/blob/trunk/plugin/src/tools/wisdom.ts)
- **[research_citation]** sources: Current checkpoint source: `adv_task_checkpoint` implementation emits `taskCompletedSignal` from `fireTaskCompletedFromCheckpoint`; it is distinct from `tools/task.ts`. (https://github.com/Sharper-Flow/Advance/blob/trunk/plugin/src/tools/checkpoint.ts)
- **[research_citation]** sources.omitted: 4 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Typed, task-scoped drafts and signal-driven state changes follow the repository's Zod-plus-Temporal architecture and preserve advisory-only behavior, but D1's FTS-ranked top-five selection conflicts directly with AC1's recency-ranked top-five contract. D5 also needs the actual checkpoint owner, `tools/checkpoint.ts`, in its implementation path.
- **[unresolved_action]** validation.blockers: D1 specifies an FTS query and its top five results, while the existing `adv_wisdom_list` query path is documented and implemented as relevance-ranked FTS. This cannot guarantee AC1's required top five by recency.
- **[unresolved_action]** validation.blockers: D5 assigns auto-dismiss behavior to `adv_task_checkpoint`, but the affected-file list omits its implementation owner. `adv_task_checkpoint` is implemented in `plugin/src/tools/checkpoint.ts`, where completion is recorded through `taskCompletedSignal`; modifying only `tools/task.ts` cannot implement or verify checkpoint dismissal/count reporting.
- **[report_follow_up]** follow_ups: Workflow boundary schema validation (security-4) — extend applyTaskUpdatedToState to validate wisdom_drafts partial via WisdomDraftSchema.array().parse; defense-in-depth change
- **[report_follow_up]** follow_ups: CAS-style concurrency guarantee for draft lifecycle (correctness-5/6) — requires contract language about concurrent operations; design-level decision
- **[archive_only_evidence]** findings: [blocker] contract-traceability: AC8 producer side dead: AssembleSystemBlockState.pendingWisdomDraftTasks declared but never populated by production code. [ADV:WISDOM_DRAFTS] nudge never fires in production. Tests pass only because they hand-construct state with the field set.
- **[archive_only_evidence]** findings: [issue] correctness-edge-cases: _relevantWisdom sort uses localeCompare without null guards; missing recorded_at throws TypeError, caught and silently masked as search failure.
- **[archive_only_evidence]** findings: [issue] correctness-edge-cases: taskBlockedSignal branch bypasses draft creation; SEMANTIC error_recovery + status=blocked never creates draft. Spec scenario .3 has no carve-out for blocked status.
- **[archive_only_evidence]** findings: [issue] correctness-edge-cases: from_draft_id TOCTOU race: no CAS on draft.status. Two concurrent calls can both pass validation, both add wisdom, and second taskUpdatedSignal overwrites first promotion.
- **[archive_only_evidence]** findings: [issue] correctness-edge-cases: Checkpoint auto-dismiss TOCTOU: dismiss fires with full drafts array from readback snapshot. Concurrent from_draft_id promotion between readback and dismiss clobbers the promotion.
- **[archive_only_evidence]** findings: [issue] correctness-edge-cases: WisdomDraftSchema.suggested_content has no max length; maybeCreateWisdomDraftFromErrorRecovery doesn't bound attempts.length. WisdomEntry.content capped at 2000 but draft field unbounded — Temporal payload bloat risk.
- **[archive_only_evidence]** findings: [issue] security: applyTaskUpdatedToState uses Object.assign with no schema validation on wisdom_drafts partial. Malformed signal payload silently corrupts task state. A08 data-integrity defense-in-depth gap.
- **[archive_only_evidence]** findings: [issue] tests-tdd-evidence: Spec rq-wisdomAutoSurfacing01.8 requires dismiss best-effort on signal failure, but no test exercises the try/catch at checkpoint.ts:497-509.
- **[archive_only_evidence]** findings: [issue] tests-tdd-evidence: When Temporal unavailable, wisdom add succeeds via disk fallback but draft promotion silently skipped due to `if (nextDrafts && handle)` guard. Wisdom durable, draft stuck suggested — inconsistent state.
- **[archive_only_evidence]** findings: [issue] contract-traceability: AC7 cancelled-task scope enforced by architecture only (drafts never enter change-level wisdom storage) — no test verifies the invariant.
- **[archive_only_evidence]** findings: [issue] contract-traceability: AC9 advisory-only invariant enforced by architecture only — no test verifies _relevantWisdom/_episodeRecallHint never gate.
- **[archive_only_evidence]** findings: [issue] scope-conformance: 7 files of unrelated command-description cleanup mixed into wisdom auto-surfacing change (drive-by scope drift).
- **[archive_only_evidence]** findings: [suggestion] touched-scope-bad-test-cleanup: wisdom.test.ts:418 signal-name assertion too permissive — passes for any string. Should be .toBe(taskUpdatedSignal).
- **[archive_only_evidence]** findings: [suggestion] correctness-edge-cases: promoteDraft doc comment claims null for non-suggested; impl returns array unchanged. Misleading contract documentation.
- **[archive_only_evidence]** findings: [suggestion] correctness-edge-cases: Stale comment about clearing lastCompletedTask — describes retired prompt, not new draft-aware flow.
- **[archive_only_evidence]** findings: [info] tests-tdd-evidence: Recency-vs-FTS conflict coverage is implicit in test fixture; rename/comment for explicit contract clarity.

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| SC1 | success_criterion | pass |
| SC2 | success_criterion | pass |
| SC3 | success_criterion | not_applicable |
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
| C7 | constraint | respected |
| C8 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |
| DONT4 | avoidance | respected |
| DONT5 | avoidance | respected |
| DONT6 | avoidance | respected |
| DONT7 | avoidance | respected |

## Unresolved Actions

- D1 specifies an FTS query and its top five results, while the existing `adv_wisdom_list` query path is documented and implemented as relevance-ranked FTS. This cannot guarantee AC1's required top five by recency.
- D5 assigns auto-dismiss behavior to `adv_task_checkpoint`, but the affected-file list omits its implementation owner. `adv_task_checkpoint` is implemented in `plugin/src/tools/checkpoint.ts`, where completion is recorded through `taskCompletedSignal`; modifying only `tools/task.ts` cannot implement or verify checkpoint dismissal/count reporting.
