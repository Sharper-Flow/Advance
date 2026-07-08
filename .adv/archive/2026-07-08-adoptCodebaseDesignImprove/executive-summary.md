# Executive Summary: Adopt `codebase-design` and `improve-codebase-architecture`

## Outcome

Adopted two open-zone `mattpocock/skills` into ADV as `skills/adv-codebase-design/` and `skills/adv-improve-codebase-architecture/`. All five vendored files preserve Matt Pocock's original content (MIT licensed) with a 5-line attribution header prepended and minimal frontmatter adaptations. The 2-skill "open zone" in ADV's mattpocock exclusion policy is now resolved — these skills are documented in a new "Adopted Skills (Open-Zone Resolutions)" table in `ADV_INSTRUCTIONS.md`.

## Value / Why it matters

`/adv-design` and `/adv-discover` discovery output now have a shared deep-module vocabulary (module / interface / depth / seam / adapter / leverage / locality) plus the deletion test and dependency categories. Discussions of "is this module too shallow?" or "where should the seam go?" can use these shared terms instead of prose-only phrasing. The procedural `adv-improve-codebase-architecture` skill is also available for organic architecture reviews when a user explicitly invokes it (it preserves Matt's `disable-model-invocation: true`, so it won't auto-fire).

For the non-technical release-approval reader: this is a documentation-and-skill-append change. It does not modify the plugin's runtime behavior, the existing 27+ ADV skills, the scanner output schemas (`adv-arch-scan` / `adv-slop-scan`), or any of the 6 already-excluded mattpocock skills. The vocabulary gains and procedural workflow are additive.

## Verification

- **`pnpm run check` (CI gate):** schemas + typecheck + lint + format + isolation + lockfile all pass.
- **`pnpm test` (full suite):** 4772 / 4773 tests pass. The 1 failing test (`concurrent-signaling.itest.ts` SC1/SC9) is a Temporal integration test that flakes on full-suite runs but **passes in isolation** — confirmed pre-existing, not a regression (this change has zero `src/` impact).
- **`scripts/deploy-local.sh --check`:** line 29 glob (`skills/adv-*/SKILL.md`) covers both new SKILL.md files; no frontmatter post-processing warnings. A pre-existing tool-drift issue (`adv_backlog_*` tools not in `adv.md` allowlist) is unrelated to this change.
- **License compliance:** `LICENSE-THIRD-PARTY.md` updated with current upstream HEAD SHA (`d574778f94cf620fcc8ce741584093bc650a61d3`) and 5 new vendored rows.

## Risks / Follow-ups

- **Design validator INCONCLUSIVE:** the independent `adv-researcher` worker was unavailable in this session (2 cancelled spawns). The orchestrator self-validated all 4 dimensions (CORRECTNESS, SIMPLICITY, SPEC-LAW COMPLIANCE, KEY ALTERNATIVES) against the agreement ACs and ADV specs. A human re-validation in a future session is recommended but not blocking.
- **Pre-existing Temporal test flake:** `concurrent-signaling.itest.ts` SC1/SC9 should be addressed by a follow-up change to make it more robust under full-suite runs. Not introduced by this change.
- **Pre-existing tool-drift:** `adv_backlog_*` tools not registered in `adv.md` allowlist. Unrelated to this change but worth a separate cleanup.
- **Vocabulary conflict (non-blocking):** Matt's glossary bans `component` / `service` / `API` / `boundary`. ADV's P-rules and command docs use some of these terms (e.g., P33 `structural-correctness`, `boundary` in `ADV_INSTRUCTIONS.md`). This is documented as a non-adoption of those bans; no rename required for this change.

## Supporting evidence

- PR: https://github.com/Sharper-Flow/Advance/pull/209 (commit `08833c38`, base `trunk`)
- 7 files changed: 5 new (vendored skills) + 2 modified (`LICENSE-THIRD-PARTY.md`, `ADV_INSTRUCTIONS.md`)
- 6 tasks executed and checkpointed
- 8 typed ChangeContract items (C1–C8) all marked `respected` in the contract review matrix
- Artifacts: `proposal.md`, `agreement.md` (7 AC + 2 SC + 7 constraints + 5 avoidances), `design.md` (architecture + 7-phase strategy + 5 design-derived criteria + 8 risks)