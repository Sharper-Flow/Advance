# Archive: Optimize status WIP

**Change ID:** optimizeStatusWip
**Archived:** 2026-06-27T19:49:30.394Z
**Created:** 2026-06-27T18:13:30.282Z

## Tasks Completed

- ✅ Add typed status recommendation model and grouping builder
  > Added `status-recommendations.ts` with structural recommendation kinds, priorities, sources, item/group/summary types, deterministic grouping order, per-group omitted counts, total omitted count, drilldown hints, and legacy string projection helper. Added RED/GREEN unit tests for group ordering and omission accounting.
- ✅ Migrate status recommendation producers to structural helper
  > Added `StatusRecommendationCarrier` plus `pushStatusRecommendation` helper in status tooling. Migrated recency, clarify, next-gate enrichment, queue serviceability, search attribute, session-debt, health-snapshot, and archived-branch hygiene recommendations to emit typed structural items while preserving legacy flat recommendation strings. Added regression proving recency producer emits `stale` structural kind.
- ✅ Add grouped/bounded status view projections
  > Added view-level recommendation grouping projections. `adv_status` now builds `recommendation_summary`/`recommendation_groups` from the full typed item set before flat recommendation truncation, exposes those additive fields across status views, and caps detailed flat recommendation lists above a named threshold. Extended high-WIP summary fixture to assert grouped fields and omitted counts while preserving existing recent-change and flat recommendation compatibility.
- ✅ Render compact grouped next-actions in formatted status output
  > Extended formatted status output with a pure `nextActionsSection` that renders grouped recommendation counts, top examples, omitted counts, and drilldown hints. Wired `recommendationSummary` from `adv_status` into `formatStatusOutput` while keeping legacy `recommendationsList` intact. Added RED/GREEN formatter coverage for grouped next-actions.
- ✅ Verify status WIP behavior and compatibility
  > Verified grouped/bounded status behavior and compatibility. Targeted status/formatter tests passed (83 tests). `pnpm run check` passed after formatting. Acceptance reviewer then fixed one issue: archived-branch hygiene now preserves typed `recommendation_items`, with regression assertion. Reviewer verification passed status tests, status-recommendations/tool-formatters tests, typecheck, check, and git diff --check.

## Specs Modified


## Wisdom Accumulated

- **[pattern]** For status recommendation migrations, preserve legacy flat strings by storing an optional `message` on the typed item and deriving `recommendations` from the typed projection. This lets tests and existing JSON consumers keep exact strings while grouped status uses structural `kind/source/priority` fields.
- **[pattern]** For bounded status projections, compute grouped summaries from the full typed recommendation set before applying any flat-list caps. Otherwise omitted counts and grouped actionability inherit summary truncation and become wrong under high-WIP load.
- **[gotcha]** `pnpm run check` can surface pre-existing Prettier drift outside touched scope after a narrow targeted edit. If format:check fails only on unrelated files, formatting them may be the least risky path to satisfy required check, but call it out in verification/summary as campsite formatting rather than feature scope.
