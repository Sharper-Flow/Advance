# Executive Summary — Optimize status WIP

## Outcome

`adv_status` now has a typed, grouped recommendation read model for large-WIP projects. High-volume status output can surface grouped next actions and omitted counts instead of relying only on a long flat recommendation list.

## What shipped

- Added `StatusRecommendationItem`/group/summary types and deterministic `buildStatusRecommendationGroups`.
- Migrated known recommendation producers to structural items while preserving legacy flat recommendation strings.
- Added additive status fields: `recommendation_summary` and `recommendation_groups` across status views.
- Added detailed flat recommendation capping above a named threshold, while preserving summary behavior and legacy fields.
- Added formatted `nextActionsSection` with group counts, top examples, omitted counts, and drilldown hints.
- Reviewer remediation: archived-branch hygiene now preserves typed cleanup recommendations for grouping.
- Campsite formatting: Prettier-normalized two pre-existing files that blocked `pnpm run check`.

## Verification

- Targeted: `bin/oc-test targeted -- src/tools/status.test.ts src/tools/status-recommendations.test.ts src/utils/tool-formatters.test.ts` — 83 passed.
- Reviewer: status tests, status-recommendations/tool-formatters tests, typecheck, check, git diff --check — all passed.
- Full static gate: `pnpm run check` — passed.

## Remaining concerns

- Hygiene non-recommendation sections can still grow; this change targets recommendation explosion first. If external/session metadata dominates truncation later, create a separate follow-up.