# Executive Summary

## Outcome

`adv epic list --json` now returns each running Epic with a `startTime` field, giving consumers a stable timestamp for childless Epics while preserving the live Temporal Visibility-only CLI boundary.

## Why It Matters

Launcher/dashboard-style consumers no longer need to show `-` or mis-order childless Epics. The timestamp comes from Temporal Visibility rows already being enumerated, so the CLI still does not hydrate Epic workflows, read ADV state files, or depend on a worker.

## What Was Built

1. Added `startTime` to Epic CLI JSON entries as ISO UTC string when valid, or `null` when missing/invalid.
2. Added `listEpicWorkflows()` rich Visibility helper while preserving `listEpicWorkflowIds()` compatibility wrapper.
3. Updated `bin/adv` and `bin/lib/epic-list.ts` to emit rich Epic entries.
4. Updated `rq-epicCliList01` spec/docs and tests to define/prove timestamp behavior.
5. Repaired an existing missing citation for `rq-epicSearchAttributeRepair01` uncovered by spec citation invariant.

## What Was Verified

- Reviewer verdict: READY, 0 blockers/issues, no fixes applied, no scope drift.
- RED evidence: `bun test bin/lib/epic-list.test.ts` failed before implementation (`tr_mrcr9lk7_4edb67df`).
- GREEN/verification: Bun CLI tests passed (`tr_mrcrevv9_b76cac3c`, 22 tests); targeted plugin/source-boundary/spec-citation tests passed (`tr_mrcrhjnd_0aece7ba`, 30 tests); schema check passed (`tr_mrcrfa5a_cc0545ec`); format check passed (`tr_mrcrg5b2_c13d6dc4`); typecheck passed (`tr_mrcrgie3_f7ded6cc`); git diff whitespace check passed (`tr_mrcrhp6m_96accb23`).
- Live source command: `bin/adv epic list --json` emitted `startTime` for `optimizeAdvPerformanceStructure` (`tr_mrcrgp00_df64ddd3`).
- Contract matrix: 21 rows passed/respected/not_applicable; 0 failing rows.

## Remaining Concerns

None blocking. `startTime` is explicitly Temporal workflow start time, not true child-change last activity. True last-activity would require a future indexed-state design and was kept out of scope.

## Release Readiness Summary

Acceptance complete evidence is ready for harden/release. Worktree is clean at checkpoint `13302e3c7895d733aa85ad971eb64970e1a2a57a`. No frontend preview, migration, deployment config, operational runbook, or external service impact. Normal source-vs-deployed-runtime caveat applies: live OpenCode plugin behavior requires rebuild/deploy/restart after source changes.