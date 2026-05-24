# Proposal — persistSubagentReports

## Problem

ADV sub-agent reports from `adv-engineer` and `adv-reviewer` were transported as fenced JSON inside final prose. The orchestrator then had to recover structured state by LLM-/regex-adjacent parsing of chat text. Message truncation, aborted final responses, malformed fences, or schema drift could lose implementation/review evidence even when the worker had already completed useful work.

## Chosen Direction

Introduce a typed, durable report-ingest path: `adv_subagent_report_submit`. Sub-agents submit strict Zod-validated reports directly into ADV Temporal state. The orchestrator reads reports from state instead of parsing prose.

## Success Criteria

- Sub-agent reports are typed, Zod-validated, durably persisted ADV state.
- Reports are queryable via `adv_change_show`; orchestrator no longer depends on prose parsing for ADV worker reports.
- Layer-3 consumers use report fields: follow-ups become agenda items, blockers become task error recovery, verification entries are cross-checked against test evidence.
- Agent/command markdown examples stay mechanically aligned with schemas via asset tests.
- `delegation-defaults rq-delDefaults05` requires typed, persisted, ingest-validated reports.

## Scope

### In Scope

- Strict report schemas for `adv-engineer` and `adv-reviewer`.
- Reserved discriminator literals for `adv-researcher` and `adv-tron` for future extension.
- Signal-only Temporal workflow persistence with dedupe by `(change_id, task_id, agent, attempt)`.
- `adv_subagent_report_submit` tool with dry-run validation and target-path routing.
- `adv_change_show include.subagentReports` read surface.
- Consumers for follow-ups, blockers, and verification warnings.
- Agent/command contract updates including `ATTEMPT: N` packets.
- Spec updates for `subagent-reports` and `delegation-defaults`.
- Regression tests and full quality gates.

### Out of Scope

- External A2A protocols.
- Streaming partial reports.
- OpenCode host changes.
- Full typed report schemas for `adv-researcher` / `adv-tron`.
- Archive rendering of reports.
- Removal of legacy `TaskStructuredOutputSchema` for non-ADV or legacy callers.
- Hybrid sentinel + tool emission for ADV reports.

## Must Not

- Introduce `defineUpdate` on change workflows.
- Bypass `fireSignalAndRefresh` for change-scoped signals.
- Mutate target projects outside target-store routing.
- Break Temporal workflow-bundle purity.
- Rely on heuristic prose parsing as the source of truth for new ADV sub-agent reports.

## Discovery Agenda

- Confirm current report transport and extraction sites.
- Confirm Temporal signal/query pattern and workflow-bundle constraints.
- Confirm task schema and `adv_change_show` read surface extension points.
- Confirm command/agent markdown contract locations.
- Confirm spec-law updates needed for delegation defaults.
- Confirm test assets that can mechanically pin schema/example drift.

## User Approval

Proposal approved by user via inline Tier A continuation on 2026-05-23.