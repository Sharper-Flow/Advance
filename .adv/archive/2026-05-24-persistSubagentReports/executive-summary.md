# Executive Summary — persistSubagentReports

Persisted typed sub-agent report submission is implemented and acceptance-ready.

## Outcome

- Added strict `adv_subagent_report_submit` typed ingest for `adv-engineer` / `adv-reviewer` reports, with reserved forward-compatible agent literals.
- Persisted reports through signal-only Temporal workflow state on `task.subagent_reports[]`, with dedupe by `(change_id, task_id, agent, attempt)`.
- Exposed reports through `adv_change_show include.subagentReports`.
- Wired Layer-3 consumers: follow-ups to agenda, blockers to task `error_recovery`, verification cross-check warnings.
- Updated agent/command contracts to use tool-call report transport and `ATTEMPT: N`; removed fenced sentinel report emission for ADV workers.
- Added `subagent-reports` spec law and strengthened `delegation-defaults rq-delDefaults05`.

## Acceptance Evidence

- AC8 blocker remediated in commit `443000fe537978b0e5491ec0898189119412cfb4`: malformed report payloads and report submit-signal failures now record durable task `error_recovery` when report identity is available.
- Review matrix persisted with 39/39 passing or respected rows.
- Independent `adv-reviewer` re-review returned READY/PASS with no findings.
- Verification passed: `pnpm exec vitest run src/tools/subagent-report.test.ts src/temporal/workflows.signal-handlers.test.ts src/temporal/workflow-bundle-boundary.test.ts`; `pnpm run check`; `pnpm test`; `pnpm run build`.

## Remaining Concerns

- If Temporal is completely unavailable, the same Temporal signal path cannot durably record recovery; the tool reports `failureRecord.recorded:false`. Separate durable fallback is out of scope for this change.