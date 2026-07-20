# Archive: Fix recovery schema drift

**Change ID:** fixRecoverySchemaDrift
**Archived:** 2026-07-20T15:10:06.652Z
**Created:** 2026-07-20T06:35:11.372Z

## Tasks Completed

- ✅ Schema-error propagation: predicate + store-layer swallow-site fixes + hasArchiveBundle
  > Task checkpoint completed
- ✅ Extend schemas to make recovery_audit round-trip through ChangeSchema.parse
  > Task checkpoint completed
- ✅ New regression test: schema-error propagation at store layer
  > Task checkpoint completed
- ✅ New regression test: recovery_audit round-trip through ChangeSchema.parse
  > Task checkpoint completed
- ⏭️ Comment update at _recovery-writers.ts:333 reflecting defense-in-depth status
- ✅ Tool-layer schema-error overwrite fixes (change.ts 4 sites + task.ts resolveChangeId)
  > Task checkpoint completed
- ✅ Extend existing writer/tool tests with ChangeSchema.parse round-trip + serial-disposition coverage
  > Task checkpoint completed
- ✅ Full build + test verification gate
  > Task checkpoint completed
- ✅ Local deploy + live verification (pokeedge-web if available)
  > Task checkpoint completed

## Specs Modified

