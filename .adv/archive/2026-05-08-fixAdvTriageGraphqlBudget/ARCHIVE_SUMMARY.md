# Archive: Fix /adv-triage GraphQL budget exhaustion during Project field updates

**Change ID:** fixAdvTriageGraphqlBudget
**Archived:** 2026-05-08T19:50:51.845Z
**Created:** 2026-05-08T19:20:22.479Z

## Tasks Completed

- ✅ Update Phase 3b in adv-triage.md: replace `gh project item-edit` on line 217 with `gh api graphql --include` single-field mutation for Value writes. Add budget gate before Value writes.
  > Task completed
- ✅ Update Phase 4 in adv-triage.md: add cached project-state protocol (reuse Phase 1 item-list), batched GraphQL mutation instructions (4 fields per item via `gh api graphql --include`), GraphQL budget estimation gate, 1-second pacing, idempotent resume logic (skip already-correct fields, ±0.05 WSJF tolerance), and rate-limit error handling. Replace line 254 `gh project item-edit` reference.
  > Task completed
- ✅ Update Phase 5 in adv-triage.md: add explicit note that Phase 5 must use a separate fresh `item-list` read (not Phase 4 cache) for ROADMAP freshness.
  > Task completed
- ✅ Update Phase 6 report template in adv-triage.md: add API Budget section (GraphQL points consumed, remaining, reset, batch mutations issued, items skipped).
  > Task completed
- ✅ Update Key Tools table in adv-triage.md: replace `gh project item-edit` row with batched `gh api graphql --include` rows (single-field, batch-4, budget check, per-response header check).
  > Task completed
- ✅ Update Anti-Patterns table in adv-triage.md: add 3 new rows (don't use item-edit for bulk writes, don't ignore rate-limit headers, don't use rateLimit query for every post-mutation check).
  > Task completed
- ✅ Add GitHub GraphQL Budget section to SETUP.md: REST vs GraphQL budget separation table, Projects v2 budget note, batching explanation, multi-session shared-budget note.
  > Task completed
- ✅ Validate: run `pnpm run check` to verify no manifest drift from command edits. Read the updated command contract end-to-end to verify consistency across all phases, Key Tools, and Anti-Patterns.
  > Validation passed. typecheck ✓, lint ✓, format warning on unrelated pre-existing file. All item-edit references replaced except Anti-Patterns bad column. Fresh read, budget gate, batching, --include, resume, API Budget report all present and consistent.

## Specs Modified

