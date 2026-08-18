# Archive Briefing Digest

**Change ID:** tightenHandoffVoice
**Title:** Tighten handoff voice
**Status:** archived
**Generated:** 2026-08-18T17:54:08.565Z

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

Showing 7 of 7 durable facts.

- **[report_follow_up]** follow_ups: Full-suite unrelated failure remains in src/manifest-doc-drift.test.ts: adv-backlog.md frontmatter says "Capture future work as backlog-status changes before proposal" while the manifest says "Capture future work before it becomes an Epic or change". Per scope, it was not changed. Shell proof also found no "Want changes" matches under .opencode/ or plugin/src/; git diff --check passed.
- **[archive_only_evidence]** decisions: Replaced Tier A rendered reply blocks with the single standard line while leaving Tier B archive and cancellation prompts unchanged. — The requested voice change applies to reversible Tier A presentation; existing Tier A parsing tables and command-as-approval mechanics remain authoritative.
- **[archive_only_evidence]** decisions: Converted the discovery criteria checkpoint's rendered reply block to the same single line and kept /adv-clarify handling in the surrounding detection rules. — This aligns all Tier A checkpoint surfaces without removing the literal halt route.
- **[archive_only_evidence]** decisions: Added the spine rules, a condensed Azure Key Vault BAD/GOOD pair, and a regression assertion for the evidence-dump prohibition. — These are the requested durable contract and drift protections.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/checkpoint-surface-drift.test.ts src/handoff-footer-drift.test.ts --maxWorkers=4 (0) — Targeted drift suite passed: 2 files, 39 tests.
- **[archive_only_evidence]** verification: pnpm exec vitest run --maxWorkers=4 (1) — Full suite: 385 files passed, 1 failed, 1 skipped; 5128 tests passed, 1 failed, 1 skipped, 12 todo. The failure is unrelated manifest-doc drift in src/manifest-doc-drift.test.ts: adv-backlog.md description differs from the manifest.
- **[archive_only_evidence]** verification: tests_run=git show --stat e0fd7ed3, git show --format=fuller --find-renames e0fd7ed3, grep -rn 'Want changes' .opencode/ plugin/src/, grep -rn 'reply with what to adjust' docs/command-voice-standard.md .opencode/command/adv-{proposal,discover,design,prep,review}.md, pnpm exec vitest run src/checkpoint-surface-drift.test.ts src/handoff-footer-drift.test.ts --maxWorkers=4, pnpm exec vitest run --maxWorkers=4, git diff --check e0fd7ed3^ e0fd7ed3 results=pass — Commit changes only the five Tier A command docs, command voice standard, and two drift tests. 'Want changes' returned 0 under .opencode/ and plugin/src/. Single-line text is present in the standard and all five command docs. Targeted Vitest: 2 files, 39 passed, exit 0. Full Vitest: 385 files passed, 1 skipped; only manifest-doc-drift failed for untouched adv-backlog.md frontmatter/manifest mismatch. git diff --check and final worktree diff were clean.

## Contract / AC Coverage

No contract items.

## Unresolved Actions

None
