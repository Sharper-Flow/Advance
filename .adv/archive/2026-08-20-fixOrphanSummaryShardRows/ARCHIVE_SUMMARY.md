# Archive: Fix orphan summary shard rows

**Change ID:** fixOrphanSummaryShardRows
**Archived:** 2026-08-20T01:01:36.550Z
**Created:** 2026-08-19T21:30:29.726Z

## Tasks Completed

- ✅ Add classifySummaryCandidates with four-way classification
- ✅ Ship the classifier as a standalone dist bundle
- ✅ Compose classification at buildLauncherProjection
- ✅ Wire validation into loadSummariesFromDisk and add the residue field
- ✅ Verify structural guards pass unchanged
- ✅ Verify against the real affected store

## Specs Modified

