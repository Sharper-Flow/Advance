# Archive Briefing Digest

**Change ID:** alignProviderEvalTargets
**Title:** Align provider eval targets
**Status:** archived
**Generated:** 2026-07-13T12:41:00.065Z

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

Showing 12 of 12 durable facts.

- **[agenda]** follow_ups: Plan a separate nested `adv_subagent_report_submit.report` placeholder-normalization design.
- **[agenda]** follow_ups: Create a separate Toolbox change for Caveman `lite` mode.
- **[unresolved_action]** consumer_warnings: verification_missing: Worker report transport initially failed from its worktree with WorkflowNotFoundError; orchestrator persisted this source-backed validator report through the target store.
- **[archive_only_evidence]** sources: OpenRouter GPT Terra: Verified canonical GPT target slug.
- **[archive_only_evidence]** sources: OpenRouter GLM 5.2: Verified canonical GLM target slug.
- **[archive_only_evidence]** sources: OpenRouter Kimi K2.7 Code: Verified canonical Kimi target slug.
- **[archive_only_evidence]** sources: OpenRouter Claude Opus 4.8: Verified canonical Claude target slug.
- **[archive_only_evidence]** sources: Provider eval implementation: Harness calls OpenRouter directly and owns provider model configuration.
- **[archive_only_evidence]** sources: Preflight implementation and tests: Existing table-driven policy and drift-guard architecture.
- **[archive_only_evidence]** architecture_assessment: The design extends the existing deterministic provider map and table-driven FIELD_POLICIES pattern. Direct OpenRouter calls require canonical OpenRouter slugs rather than OpenCode routing identifiers. Prompt label updates preserve scoring structure. No architectural deviation found.
- **[agenda]** follow_ups: Nested adv_subagent_report_submit.report placeholder normalization (separate structural design).
- **[agenda]** follow_ups: Caveman lite mode (separate Toolbox change).

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
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| C4 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |

## Unresolved Actions

- verification_missing: Worker report transport initially failed from its worktree with WorkflowNotFoundError; orchestrator persisted this source-backed validator report through the target store.
