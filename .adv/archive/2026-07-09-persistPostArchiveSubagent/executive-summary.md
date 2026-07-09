# Executive Summary

## Outcome

Sub-agent review reports (adv-designer, adv-reviewer, adv-engineer) now persist durably on **already-shipped (archived/closed)** changes. Previously, submitting a report for a terminal change failed with `SUBMIT_SIGNAL_FAILED: workflow execution already completed`, and the main ADV agent had to scrape the report from raw text — losing typed evidence (design dimensions, blocking findings, follow-ups).

## Why it matters

Post-merge design reviews and verification work on shipped code can now produce durable, typed report evidence with an audit trail. Follow-ups from these reviews create trackable agenda items. This closes the gap where archived changes were second-class citizens for review workflows.

## How it works

When `adv_subagent_report_submit` detects a terminal change (archived/closed), it routes to a disk-projection fallback (`saveRecoveredSubagentReport`) that writes the report directly to the change's terminal disk projection — the archive bundle `change.json` for archived changes, the active changes dir for closed ones. The existing read path already loads terminal projections from disk first (terminal-projection dominance), so the report surfaces automatically in `adv_change_show`. The active-workflow signal path is untouched.

The write target is determined by **archive bundle existence on disk** (filesystem truth), not the possibly-stale in-memory status field — this handles the active→archived race correctly.

## Verification

- 76 tests pass (19 recovery-writer + 37 subagent-report integration + 20 spec-asset)
- `pnpm run check` fully green (schemas/typecheck/lint/format)
- Independent adv-reviewer acceptance review: one blocker found (stale-status race) → fixed with bundle-existence detection + regression test → re-verified
- Independent adv-researcher design validation: all 3 claims confirmed (cache, write location, read dominance)

## Risks / follow-ups

- Source-vs-dist: live tool behavior requires rebuild + OpenCode restart to take effect (source edits don't affect cached deployed dist in-session)
- Concurrent post-archive submissions race on the bundle file — mitigated by atomic temp+rename writes and attempt-stable dedupe