# Archive: Add runtime enforcement hooks for todo continuation and wisdom accumulation

**Change ID:** add-runtime-enf-qzFE
**Archived:** 2026-01-26T03:39:30.541Z
**Created:** 2026-01-26T02:46:55.823Z

## Tasks Completed

- ✅ RESEARCH: Validate experimental.chat.system.transform hook API for context injection
- ✅ Add WisdomEntry schema and extend ChangeSchema with optional wisdom array
- ✅ Add wisdom operations (add, list) to Store interface and implement in store.ts
- ✅ Create adv_wisdom_add and adv_wisdom_list tools in new wisdom.ts file
- ✅ Register wisdom tools in plugin index.ts
- ✅ Implement todo continuation hook via experimental.chat.system.transform - inject reminder when task done but others remain
- ✅ Implement wisdom injection hook via experimental.chat.system.transform - inject accumulated wisdom when task starts (in_progress)
- ✅ Add wisdom recording prompt via experimental.chat.system.transform on task completion
- ✅ Write tests for wisdom storage operations
- ✅ Write tests for todo continuation and wisdom injection hooks
- ✅ Update ADV_INSTRUCTIONS.md with new tools and hook behavior documentation
- ✅ Add error handling for wisdom operations (invalid changeId, corrupted wisdom data, missing change)
- ✅ Add validation for WisdomEntry content (max length 2000 chars, required fields, type enum)
- ✅ Test backward compatibility: existing changes without wisdom field load and save correctly
- ✅ Add integration test for full wisdom lifecycle: start task -> inject wisdom -> complete task -> prompt recording -> add wisdom

## Specs Modified

