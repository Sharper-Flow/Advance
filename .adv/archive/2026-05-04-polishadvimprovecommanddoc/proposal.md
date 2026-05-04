## Goal

Bring `/adv-improve` command doc up to the standard set by peer commands (`/adv-proposal`, `/adv-tron`, `/adv-discover`) by resolving four audit findings in one pass.

## Decisions (locked at proposal approval)

- **H1 — Option A:** delete the trailing `---` + `## Output` heading. Report shape stays in Phase 4/5; matches `/adv-tron` pattern (read-only utility, no gate handoff block).
- **M3:** standardize on `{current-year}` (checklist already uses it; more explicit for the agent).

## Scope

### In scope

1. **H1 — Delete empty `## Output` section.** Remove `---` separator and `## Output` heading at lines 173-175 of `.opencode/command/adv-improve.md`. No replacement template added; Phase 4 (synthesis) and Phase 5 (persist) already specify report and artifact shape.
2. **M1 — Reconcile Phase 2 fallback ordering.** Rewrite line 80 fallback to: Context7 → webfetch → local conventions, with a single canonical annotation form (`[Reference: local conventions — Context7/webfetch unavailable]`).
3. **M2 — Expand manifest `successors`.** Update `plugin/src/manifest.ts:389` from `["adv-proposal"]` to `["adv-proposal", "adv-task", "adv-audit"]` to match the doc's suggested next-command set.
4. **M3 — Standardize year placeholder.** Replace `{year}` with `{current-year}` in `.opencode/command/adv-improve.md` Phase 3 queries (line 88). Checklist already uses `{current-year}`; this aligns the two.

### Out of scope

- Adding new phases to `/adv-improve`
- Changing the 6-category scan structure or per-category caps
- Modifying the research-pack artifact schema
- Touching `/adv-discover` consumer-side cite logic
- Changing tests in `adv-improve-assets.test.ts` (existing 28 assertions must still pass)

## Acceptance Criteria

1. `## Output` heading and preceding `---` separator are removed from `.opencode/command/adv-improve.md`. File no longer contains a `## Output` heading.
2. Phase 2 (LBP) has a single, ordered fallback chain: Context7 → webfetch → local conventions, with one canonical annotation form.
3. `manifest.ts` `successors` for `adv-improve` is exactly `["adv-proposal", "adv-task", "adv-audit"]`.
4. `{year}` placeholder is replaced with `{current-year}` everywhere in `.opencode/command/adv-improve.md`. Grep for literal `{year}` returns zero hits in that file.
5. `pnpm test src/adv-improve-assets.test.ts` passes (28 existing assertions).
6. `pnpm run check` passes (typecheck + lint + format).
7. File stays within `token-budgets.json` baseline of 182 lines for `adv-improve.md` (current: 175, post-change: ~172).

## Success Criteria

- A future audit run against `/adv-improve` finds zero of these four issues.
- `/adv-discover` Prior Research Extension behavior is unchanged (consumer contract preserved).
- No regression in `adv-improve-assets.test.ts` assertions.

## Out of Scope (explicit)

- Behavioral changes to `/adv-improve` execution (still inline-only, still produces report + research pack, still no ADV state mutation).
- Generating an actual `docs/*-prep.md` artifact (none exist in tree; producing one is a separate exercise).
- Changes to `/adv-discover` or any consumer.