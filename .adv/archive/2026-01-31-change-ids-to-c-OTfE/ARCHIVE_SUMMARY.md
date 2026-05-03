# Archive: Change IDs to camelCase format

**Change ID:** change-ids-to-c-OTfE
**Archived:** 2026-01-31T05:43:24.598Z
**Created:** 2026-01-31T04:28:52.394Z

## Tasks Completed

- ✅ Update store.ts: Change ID generation from kebab-case+nanoid to camelCase with auto-increment
- ⏭️ Update json.ts: Remove hyphen-specific suffix matching in resolveChangeId
- ✅ Update types.ts: Change comment from kebab-case to camelCase
- ✅ Update ADV_INSTRUCTIONS.md: Change ID format table and examples
- ✅ Update AGENTS.md: Change ID format table
- ✅ Update change.test.ts: Fix regex expectations for new camelCase format
- ✅ Update store.test.ts: Fix test expectations for new format
- ✅ Update json.test.ts: Add tests for resolving both kebab and camelCase IDs
- ✅ Run full test suite and fix any failures
- ✅ Simplify resolveChangeId: Remove suffix matching (dead code), keep exact + prefix only
- ✅ Add case-insensitive prefix matching to resolveChangeId for ergonomics
- ✅ Update setup.ts: Change SAMPLE_CHANGE.id to camelCase format - this propagates to all tests using the fixture
- ✅ Update gate.test.ts: Fix 18+ hardcoded refs to "add-feature-abc123" format
- ✅ Update integration.test.ts: Fix hardcoded changeId ref to use camelCase format

## Specs Modified

