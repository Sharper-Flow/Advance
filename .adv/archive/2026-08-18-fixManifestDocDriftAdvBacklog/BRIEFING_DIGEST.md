# Archive Briefing Digest

**Change ID:** fixManifestDocDriftAdvBacklog
**Title:** Fix manifest-doc-drift adv-backlog
**Status:** archived
**Generated:** 2026-08-18T19:41:58.595Z

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

Showing 6 of 6 durable facts.

- **[archive_only_evidence]** decisions: Aligned .opencode/command/adv-backlog.md frontmatter to the manifest description. — Git path history shows the command doc changed more recently (ad40ee8a, 2026-08-12) than manifest.ts (c7075bed, 2026-08-04), but the manifest is machine-dispatch authority and the drift test also requires README.md and ADV_INSTRUCTIONS.md tables to match it. Copying the newer frontmatter into the manifest caused two additional failures, so the one-file green fix preserves the canonical manifest value.
- **[archive_only_evidence]** decisions: Kept the manifest value verbatim: "Capture future work before it becomes an Epic or change". — The command body describes capturing backlog work that can become a normal change or Epic, and all manifest-derived tables already use this wording.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/manifest-doc-drift.test.ts --maxWorkers=4 (1) — RED: 19 passed, 1 failed; adv-backlog frontmatter differed from manifest.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/manifest-doc-drift.test.ts --maxWorkers=4 (1) — Intermediate manifest-led attempt exposed two README/ADV_INSTRUCTIONS table mismatches.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/manifest-doc-drift.test.ts --maxWorkers=4 (0) — GREEN: 20 tests passed.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/checkpoint-surface-drift.test.ts src/handoff-footer-drift.test.ts --maxWorkers=4 (0) — Neighbor check passed: 39 tests across 2 files.

## Contract / AC Coverage

No contract items.

## Unresolved Actions

None
