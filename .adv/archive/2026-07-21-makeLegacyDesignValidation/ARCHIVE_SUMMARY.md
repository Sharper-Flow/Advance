# Archive: Make legacy design-validation blockers read-tolerant

**Change ID:** makeLegacyDesignValidation
**Archived:** 2026-07-21T21:04:48.812Z
**Created:** 2026-07-20T17:34:16.026Z

## Tasks Completed

- ✅ Remove check-3 (design-validation string-blocker rejection) from `ResearcherSubagentReportSchema.superRefine` in `plugin/src/types/subagent-reports.ts` L580-591.
  > Task checkpoint completed
- ✅ Add relocated check-3 to the write boundary in `plugin/src/tools/subagent-report.ts` `executeSubmit`, inside the existing `if (parsedReport.report.agent === "adv-researcher" && parsedReport.report.scope.scope_key.startsWith("researcher:design-validation"))` block at L755, BEFORE the existing AC13 unknown-contract-IDs flatMap at L764-769.
  > Task checkpoint completed
- ✅ Add AC3 write-boundary handler tests in `plugin/src/tools/subagent-report.test.ts`. Extend the existing `design-validation handler rejects typed blockers with unknown contract IDs (AC13)` describe block (around L1793).
  > Task checkpoint completed
- ✅ Verification: run targeted test suite and report green.
  > Task checkpoint completed
- ✅ Update existing schema-time rejection test + add AC1 read round-trip tests in `plugin/src/types/subagent-reports.test.ts`.
  > Task checkpoint completed
- ✅ Add AC2 archive-through fixture test. Construct a change fixture matching the wedged shape of Vision `fixPlaywrightSessionIsolation`: a change at acceptance-done state with a `researcher:design-validation`-scoped report in `subagent_reports` whose `blockers` array contains plain strings (mirroring the 3 historical failed-attempt reports).
  > Task checkpoint completed

## Specs Modified

