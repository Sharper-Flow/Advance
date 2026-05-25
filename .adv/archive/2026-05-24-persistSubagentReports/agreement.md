# Agreement — persistSubagentReports

## Objectives

- **SC1.** Sub-agent reports become typed, Zod-validated, durably persisted ADV state via direct tool-call ingest.
- **SC2.** Reports become queryable via `adv_change_show`; orchestrator no longer LLM-parses prose.
- **SC3.** Three Layer-3 consumers activate report data: `follow_ups → agenda`, `blockers → task error_recovery`, `verification → adv_run_test cross-check`.
- **SC4.** Markdown agent specs and Zod schemas remain mechanically in sync via asset tests.
- **SC5.** `delegation-defaults rq-delDefaults05` requires typed + persisted + ingest-validated reports.

## Acceptance Criteria

- **AC1.** New `adv_subagent_report_submit` tool accepts strict typed payloads for `adv-engineer` and `adv-reviewer`, with reserved literals for `adv-researcher` and `adv-tron`, and rejects malformed input.
- **AC2.** Successful submission persists via `subagentReportSubmittedSignal`; tool uses `fireSignalAndRefresh`; target-path mutations use target store helper.
- **AC3.** Idempotency dedupes repeated `(change_id, task_id, agent, attempt)` submissions; `attempt` comes from Context Packet.
- **AC4.** `adv_change_show include.subagentReports` returns persisted reports; reports also live on `task.subagent_reports[]`.
- **AC5.** `follow_ups[]`, `blockers[]`, and `verification[]` consumers are wired with tests.
- **AC6.** Agent asset tests parse example payloads through Zod and pin `ATTEMPT:` anchors.
- **AC7.** Simulated final-message loss after submit still leaves report persisted and queryable.
- **AC8.** Submit failures retry 3× with exponential backoff; total failure is recorded in task `error_recovery`.
- **AC9.** Hard cut removes fenced JSON sentinel emission from `adv-engineer.md` and `adv-reviewer.md`; legacy structured output remains functional where still used.
- **AC10.** Apply/review/harden Context Packets include `ATTEMPT: N`.
- **AC11.** New `subagent-reports` spec has `conformance_required: false`; `delegation-defaults` is strengthened.
- **AC12.** Forward-compatible discriminator literals include `adv-researcher` and `adv-tron` slots.
- **AC13.** `pnpm test`, `pnpm run check`, `pnpm run build`, and workflow-bundle tests pass.
- **AC14.** Existing `TaskStructuredOutputSchema` / `extractStructuredOutput` infrastructure remains green.

## Constraints

- **C1.** Signal-only workflow surface; no `defineUpdate`.
- **C2.** Cache refresh via `fireSignalAndRefresh`.
- **C3.** Cross-project mutation through target store helper.
- **C4.** Workflow-bundle boundary preserved.
- **C5.** Strict schema at tool boundary; existing passthrough structured output unchanged.
- **C6.** New tool is bounded to `adv-engineer` / `adv-reviewer` report submission.
- **C7.** Replay-safe deterministic workflow reducer.

## Avoidances / Out of Scope

A2A/external protocols, streaming partial reports, OpenCode host changes, full typed researcher/tron reports, archive rendering, legacy structured-output removal, and hybrid sentinel+tool emission are out of scope.

## Decisions

- Hard cut from fenced report emission.
- Orchestrator-supplied attempt number.
- Retry 3× then hard-fail visibly through task error recovery.
- Full LBP in this change, including Layer-3 consumers.
- No archive rendering for v1.

## Sign-Off

Acceptance criteria approved by user via inline Tier A reply ("approve") at Phase 4.5.1 checkpoint on 2026-05-23.