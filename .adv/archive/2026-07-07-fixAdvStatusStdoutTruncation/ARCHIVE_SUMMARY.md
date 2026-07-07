# Archive: Fix adv status stdout truncation

**Change ID:** fixAdvStatusStdoutTruncation
**Archived:** 2026-07-07T15:00:33.172Z
**Created:** 2026-07-07T04:04:52.534Z

## Tasks Completed

- ✅ Replace process.exit(code) with process.stdout.end(() => process.exit(code)) in bin/adv to prevent pipe truncation when stdout is piped.
  > Replaced immediate process.exit(code) in bin/adv with process.stdout.end(() => process.exit(code)); verified piped JSON completeness, exit codes, test suites, and no-hang behavior.

## Specs Modified

