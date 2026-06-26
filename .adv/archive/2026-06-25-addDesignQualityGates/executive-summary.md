# Executive Summary

Delivered **structural** design-quality enforcement for ADV — concerns raised by `adv-designer` reports now block acceptance and release by code, not by reviewer prose. This change was re-defined from the top after an acceptance review found the first attempt was ~60% prompt text whose only tests asserted keyword presence.

## Outcome

- **Structural blocker (the teeth):** a sandbox-safe gate-readiness evaluator `checkUnresolvedDesignConcerns` reads persisted `adv-designer` reports from change state and emits a `DESIGN_CONCERN_UNRESOLVED` blocker on **acceptance and release** while a task's latest designer report has an undispositioned `design_dimensions` concern or `neighboring_recommendation`.
- **Typed disposition (no accepted_debt):** concerns clear only via a later all-pass report or a typed `designConcernDispositioned` signal (`adv_design_concern_disposition`: `fixed | rejected_with_evidence | split | fast_follow`, non-blank evidence). Dispositions persist through projection, re-seed, and continue-as-new.
- **Advisory promotion:** on report submit, each concern/neighbor is auto-promoted to a deduped `required-obligation` agenda item so nothing is silently lost — routing only, never the gate authority.
- **Kept real teeth:** designer dimension-notes `superRefine`; prep-readiness frontend-applicability validator (structured metadata owns routing; heuristics advisory).
- **Anti-slop:** keyword-presence asset tests are explicitly labeled non-behavioral and point at the behavioral test owners; contract re-minted with zero `accepted_debt` vocabulary.

## What changed vs the first attempt

The first attempt mapped designer evidence into the review matrix via reviewer prose with no consumer code — a concern could reach acceptance silently. This version makes the concern→block path code-owned and state-resident, satisfying SC2 ("design concerns visible before acceptance, not buried in sidecar reports") structurally.

## Verification

- Full suite (`bin/oc-test full`): **285 files / 4007 tests passed, 0 failures**.
- `pnpm run check` green; worker bundle builds; workflow-bundle boundary intact (evaluator is sandbox-safe).
- Behavioral coverage: `gate-readiness.test.ts` (evaluator, 7 cases), `subagent-report.test.ts` (consumer, 5 cases), `design-concern.test.ts` (tool, 5 cases), `change-state.test.ts` (disposition apply + persistence), `subagent-reports.test.ts` (schema, 6 cases).
- Independent acceptance review: **READY**; caught and fixed a disposition-persistence gap (projection/continue-as-new).
- Contract review matrix: 31/31 pass or respected, 0 failing.

## Remaining concerns

- `adv_change_validate strict` reports one non-blocking `NO_DELTAS` warning (spec edits are in-repo, not change deltas).
- Branch diverged from a base behind current trunk; several inherited stale frozen-snapshot tests were reconciled to trunk reality (spec versions, deploy ceiling, search-attribute lists, cli-surface row). Eventual PR merge should be routine but is wider than the design-quality code itself.