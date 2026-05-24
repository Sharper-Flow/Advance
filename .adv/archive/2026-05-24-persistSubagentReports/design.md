# Design — persistSubagentReports

## Architecture

Add a direct ADV MCP ingest path for sub-agent reports. Sub-agents call `adv_subagent_report_submit` with a strict typed payload. The tool validates the payload, persists it through a signal-only Temporal workflow path, and activates bounded consumers. The orchestrator reads reports from workflow state through `adv_change_show`.

## Data Model

- New Zod report schemas live near ADV types.
- Supported v1 report agents: `adv-engineer`, `adv-reviewer`.
- Reserved discriminator literals: `adv-researcher`, `adv-tron`.
- Each task gains `subagent_reports[]`.
- Report identity key: `(change_id, task_id, agent, attempt)`.

## Workflow Persistence

- Add `subagentReportSubmittedSignal`.
- Workflow reducer appends reports to `task.subagent_reports[]`.
- `seenReportIds` dedupes repeat submissions and is preserved through continue-as-new.
- No `defineUpdate`; mutation surface remains signal/query only.
- Tool calls use `fireSignalAndRefresh`.

## Tool Behavior

`adv_subagent_report_submit`:

- Validates payload with Zod.
- Supports `dryRun:true` preview with no signal, agenda write, hook, or cache mutation.
- Rejects unsupported reserved agents in v1.
- Routes target-path mutation through target store helper.
- On successful submit, persists report through `subagentReportSubmittedSignal`.
- On submit failure after retry exhaustion, records task `error_recovery` when report identity is available.

## Consumers

- `follow_ups[]` create agenda entries with category `subagent-followup`.
- `blockers[]` map to task `error_recovery`.
- `verification[]` cross-checks against `adv_run_test` evidence and surfaces warnings for command/exit-code mismatch.

## Read Surface

- `adv_change_show include.subagentReports` returns persisted reports and metadata.
- Existing task payloads preserve `task.subagent_reports[]`.
- Legacy `structured_output` extraction short-circuits when matching persisted sub-agent reports exist, while remaining functional for legacy/non-ADV callers.

## Contracts and Specs

- `adv-engineer.md` and `adv-reviewer.md` switch from fenced JSON sentinel reports to tool-call submission.
- Apply/review/harden context packets include `ATTEMPT: N`.
- Asset tests parse markdown example payloads through Zod and pin packet anchors.
- New `subagent-reports` capability spec documents v1 behavior.
- `delegation-defaults rq-delDefaults05` requires typed, persisted, ingest-validated reports.

## Validation

- Unit tests for schemas, tool behavior, consumers, dry-run, idempotency, and failure recording.
- Workflow signal-handler tests and workflow-bundle boundary tests.
- Asset tests for agent/command markdown contracts.
- Full gates: `pnpm test`, `pnpm run check`, `pnpm run build`.

## Risks

- Complete Temporal unavailability prevents recording failure through the same Temporal signal path; tool reports failed recovery. A separate durable fallback is out of scope.