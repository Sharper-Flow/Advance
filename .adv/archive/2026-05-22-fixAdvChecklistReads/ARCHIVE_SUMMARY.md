# Archive: Fix ADV checklist reads

**Change ID:** fixAdvChecklistReads
**Archived:** 2026-05-22T15:08:58.138Z
**Created:** 2026-05-22T07:53:35.783Z

## Tasks Completed

- ✅ Add runtime checklist-read regression test
  > Modified `plugin/src/adv-skill-backed-commands-assets.test.ts` to scan `.opencode/command/adv-*.md` for runtime directives pointing at `docs/checklists/*` or `~/.local/share/Advance`, and reconciled the embedded-methodology test by removing the `Canonical source` positive assertion.
- ✅ Remove runtime source-checklist directives from commands
  > Updated `adv-proposal`, `adv-discover`, `adv-prep`, `adv-review`, `adv-harden`, and `adv-improve` command files to remove checklist path directives and replace canonical-source wording with embedded runtime-source guidance or existing skill/fallback wording.
- ✅ Resolve adv-improve methodology source
  > Changed `plugin/src/adv-improve-assets.test.ts` so `/adv-improve` is validated against `skill("adv-improve")`, embedded fallback scan category wording, and absence of `improve-checklist.md`/`CHECKLIST` runtime references. The command already points to the loaded skill/fallback and the skill contains the six categories.
- ✅ Add no-source-checklist spec and guidance updates
  > Updated `.adv/specs/advance-meta/spec.json`, `docs/specs/advance-meta.md`, and `ADV_INSTRUCTIONS.md` to make the no-source-checklist-read boundary durable and command/skill ownership explicit.
- ✅ Run final verification for checklist-read boundary
  > Verified the complete checklist-read boundary change. Also cleaned residual `adv-prep` wording to reference embedded methodology instead of skill/checklist wording before final verification.

## Specs Modified

