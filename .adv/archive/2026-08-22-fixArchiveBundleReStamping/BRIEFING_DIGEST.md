# Archive Briefing Digest

**Change ID:** fixArchiveBundleReStamping
**Title:** Fix archive bundle re-stamping
**Status:** archived
**Generated:** 2026-08-22T15:57:16.186Z

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
| release | done |

## Epic Context

No Epic membership

## Durable Facts

Showing 10 of 10 durable facts.

- **[archive_only_evidence]** decisions: RED timestamp test failed before implementation. — The re-archive changed archived_at from 2026-08-22T05:07:18.902Z to 2026-08-22T05:07:19.017Z, proving the clock path was used.
- **[archive_only_evidence]** decisions: RED phase-9 test failed before implementation. — The in-repo refresh assertion failed with only one refresh call, the external bundle call; the in-repo terminal projection was not refreshed.
- **[archive_only_evidence]** decisions: Extracted readArchiveBundleArchivedAt and used it for reuseExistingBundlePath, refresh, and reconciliation. — This preserves the existing fail-closed summary validation in one shared helper. First-time archives still use the clock.
- **[archive_only_evidence]** decisions: Refresh both external and in-repo bundles after terminal archive projection, including archive-gate recovery afterCommit and already-done paths. — The in-repo bundle is written before finalization, so it must be refreshed from the terminal projection rather than relying on ordering.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/archive/archive.test.ts src/tools/change/handlers-archive.partial-repair.test.ts src/tools/change/archive-gate.test.ts (0) — PASS: 3 test files, 58 tests.
- **[archive_only_evidence]** verification: pnpm run check (0) — PASS: schemas, typecheck, manifest checks, lint, and Prettier.
- **[archive_only_evidence]** decisions: RED reproduced the raw rejection before the fix. — The new test against a change.json-only reused bundle failed with Error: Cannot preserve archive timestamp for digest-missing-terminal-summary: terminal summary is not_found. at archive.ts:107, through archiveChangeUnderLock at archive.ts:891.
- **[archive_only_evidence]** decisions: Caught terminal-summary resolution failures inside archiveChangeUnderLock and returned the existing ArchiveOperationResult error channel. — This preserves readArchiveBundleArchivedAt fail-closed behavior while preventing raw exceptions. An optional typed requirement field lets the existing handler branch expose rq-archiveTerminalDurability01.1 without a second error path. Failed timestamp resolution returns an empty archivedAt sentinel rather than inventing a timestamp.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/archive/ src/tools/change/ (0) — PASS: 21 test files and 174 tests passed.
- **[archive_only_evidence]** verification: pnpm run check (0) — PASS: schemas, TypeScript, manifests, frontmatter, isolation, prompt budget, lockfile policy, skill references, ESLint, and Prettier checks.

## Contract / AC Coverage

No contract items.

## Unresolved Actions

None
