# Executive Summary — Clarify bin/adv command boundary

## Outcome

`bin/adv` now distinguishes read-only commands from mutating dashboard installation in source header, help output, dry-run output, README docs, and CLI surface docs.

## What changed

- Replaced top-of-file whole-CLI read-only wording with command-specific boundary language.
- Added `COMMAND BOUNDARY` help section.
- Marked `dashboard install` as a mutating install in help.
- Added explicit `MUTATION PLAN: dashboard install` and `No changes were made (--dry-run).` dry-run output.
- Updated README to show `--dry-run` preview before mutating install and identify local user config/service writes.
- Added compact `bin/adv` subcommand boundary section to `docs/cli-surface-matrix.md`.
- Added tests for help boundary, header wording, dry-run mutation plan, and loopback/read-only dashboard wording.

## Verification

- `bun test bin/dashboard-cli.test.ts` — passed: 7 tests, 31 expects.
- `bun test bin/dashboard-cli.test.ts bin/adv.test.ts` — passed: 23 tests, 89 expects.
- `../bin/oc-test targeted -- src/cli-surface-matrix.test.ts` — passed: 2 tests.
- Static command verified old read-only header removed, help boundary present, dry-run mutation plan present, README dry-run preview present.

## Review

Independent reviewer verdict: `READY`; no findings and no changes made.

## Remaining concerns

None for this change. Later Epic entries remain future work.