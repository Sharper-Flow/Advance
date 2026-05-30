# Executive Summary — addAdvDesigner

## Outcome

Shipped `adv-designer` as an apply-phase, write-only, typed-persisted ADV sub-agent for frontend/component implementation. Reviews remain owned by `adv-reviewer`, which now receives a `FRONTEND DESIGN REVIEW SKILL` anchor (inline 6-dimension checklist) for design-inclusive changes. Structural routing flows from `metadata.frontend == "true"` at `/adv-prep` time into `/adv-apply` Priority 1.5 delegation.

## What Was Built

- New agent asset `.opencode/agents/adv-designer.md` mirroring `adv-engineer`: `mode: subagent`, hidden, temperature 0.1, full repo-write tools, all ADV orchestration mutation tools blocked, no nested delegation, no `/adv-*` invocation, explicit Backend Boundary, Neighboring Recommendation protocol, DESIGN QUALITY BAR.
- New typed report variant `DesignerSubagentReportSchema` (Zod, strict) with `design_dimensions` + `neighboring_recommendations` + standard engineer-shaped fields. Discriminated unions, `SUBAGENT_REPORT_FIELD_SOURCES`, types barrel, and `adv_subagent_report_submit` description text all updated. Blocker mapping shares the engineer path in `change-state.ts`.
- Spec law updates:
  - `delegation-defaults` apply step now allows `adv-designer` and includes a new `Frontend Implementation` delegated substep with typed_persisted_worker packet contract (4 identity anchors + 6 warn-first anchors).
  - `subagent-reports` rq01/05/06 narratives include `adv-designer` and new scenario `rq-subagentReports01.3` pins designer report variant validation.
- Routing surfaces:
  - `/adv-prep` documents `metadata.frontend` classification and splits mixed UI/backend work by concern.
  - `/adv-apply` adds Priority 1.5 routing branch (preserves `metadata.delegation_hint` at Priority 1) plus a Designer Apply Context Packet that pins DESIGN QUALITY BAR, NEIGHBORING RECOMMENDATIONS, BACKEND BOUNDARY, and EXPECTED OUTPUT to `DESIGNER_REPORT`.
  - `/adv-review` and `/adv-harden` Reviewer Remediation Packets gain `FRONTEND DESIGN REVIEW SKILL` anchor with inline 6-dimension checklist; review/harden ownership stays with `adv-reviewer`.
- Test coverage: new `adv-designer-assets.test.ts` (31 tests) plus targeted additions to `subagent-reports.test.ts`, `subagent-reports-spec-assets.test.ts`, `delegation-matrix.test.ts`, `phantom-subagent-roster.test.ts`, `deploy-local-exclusion.test.ts`, `adv-reviewer-asset.test.ts`, `adv-instructions-assets.test.ts`.
- Documentation: ADV_INSTRUCTIONS, SETUP, README, project.md, AGENTS.md all updated with bundled-global roster, apply-phase intent, and review-ownership preservation.
- Campsite fix: `prettier --write src/tools/gate.ts` cleared pre-existing formatting drift adjacent to the touched scope.

## What Was Verified

- Focused designer suites (11 files): 344 tests passed.
- `pnpm run check`: typecheck, test-isolation, lockfile-policy, lint, and format:check all green.
- Independent acceptance review (`adv-reviewer`, phase `review`, attempt 1): verdict **READY**, no blockers, no issues; praise only across all 12 review dimensions; `git status --porcelain` clean before and after.
- Validator (design gate): verdict **VALIDATED** with one CAUTION resolved inline (Priority 1.5 routing preserves `metadata.delegation_hint` at Priority 1).
- Working tree clean on `change/addAdvDesigner` at HEAD 01ad7deba5a4c4f566f09acfbd84e798fe7336ad.

## Contract Coverage

Every AC1–AC11 and SC1–SC4 has at least one implementing or verifying task. Constraints C1–C6 respected; avoidances DONT1–DONT7 and out-of-scope OOS1–OOS7 preserved structurally via Zod schemas, spec law, asset tests, and prompt boundaries.

## Remaining Concerns

- Parent fast-follow `addDelegationMatrix` still acceptance-pending; same specs and roster tests are touched. Release-stage coordination required (rebase or merge order) before archive — orchestrator concern, not a blocker for this change.
- Live OpenCode runtime needs `./scripts/deploy-local.sh --fix` plus session restart to pick up the new `DesignerSubagentReportSchema` enum and the new agent asset. New `adv-designer` will not be spawnable from existing sessions until then. Standard rebuild/deploy step.
- `skill("adv-frontend-review")` is deferred; iteration 1 uses an inline checklist in the reviewer packet. Skill creation can be a future fast-follow.

## Investment

9 tasks (5 schema/asset + 3 routing + 1 verification), 7 commits, 0 retries, ~24 minutes execution wall-clock, 25 files touched, validator + reviewer agree READY.
