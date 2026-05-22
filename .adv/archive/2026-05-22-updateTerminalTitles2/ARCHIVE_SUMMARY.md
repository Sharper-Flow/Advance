# Archive: Update terminal titles

**Change ID:** updateTerminalTitles2
**Archived:** 2026-05-22T16:40:08.965Z
**Created:** 2026-05-22T15:31:32.916Z

## Tasks Completed

- ✅ Implement terminal title identity policy and focused RED/GREEN tests
  > Changed `buildTabTitle` so sanitized/trimmed active change ids take precedence over project names, falling back to project when no active change exists. Updated terminal title comments and focused events/terminal tests for raw active id, inactive project fallback, whitespace change fallback, no project prefix, active payload sanitization, failed emission retry, and status-churn no-retitle behavior.
- ✅ Add current docs/spec title-identity law and drift coverage
  > Added `rq-titleIdentity01` to `.adv/specs/chat-output-display/spec.json` with scenarios for active change id, inactive project fallback, status-churn no-retitle, and title safety preservation. Updated `docs/specs/chat-output-display.md`, drift assertions in `handoff-footer-drift.test.ts`, and current tab-title prose in `ADV_INSTRUCTIONS.md` / `events/status.ts`. Preserved `rq-titleBell01` unchanged and left historical-only references untouched.
- ✅ Run final verification and contract/static safety audit
  > Ran focused title/spec verification, static title safety/current-doc audit, full `pnpm test`, `pnpm run check`, `pnpm run build`, and strict ADV validation. First full test run exposed unrelated pre-existing drift failures (`adv-tron` lgrep remote index tool permission, advance-meta mirror test metadata, missing external citation for `rq-noSourceChecklistReads01`); applied minimal corrections so the full suite passes. Formatted `events.test.ts` to satisfy check.

## Specs Modified


## Wisdom Accumulated

- **[gotcha]** Full-suite verification can surface unrelated archived-change drift (asset allowlists, spec mirror metadata, citation invariants). Classify first; when failures are tiny structural drift blockers, repair minimally and record them in task error_recovery rather than weakening the requested verification bar.
