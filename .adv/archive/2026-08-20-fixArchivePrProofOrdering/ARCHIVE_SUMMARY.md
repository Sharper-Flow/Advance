# Archive: Fix archive PR proof ordering

**Change ID:** fixArchivePrProofOrdering
**Archived:** 2026-08-20T17:05:02.737Z
**Created:** 2026-08-20T15:43:15.221Z

## Tasks Completed

- ✅ RED: scenario-B regression tests at integration and handler level
- ✅ Add preArchiveTipSha to the schema and thread it through every writer
- ✅ GREEN: capture the pre-bundle tip and accept either candidate in merged-PR proof
- ✅ Tree re-proof: try the pre-bundle tree under a DISTINCT proof token
- ✅ Verify: scenario A preserved, historical-repair untouched, full suite

## Specs Modified

