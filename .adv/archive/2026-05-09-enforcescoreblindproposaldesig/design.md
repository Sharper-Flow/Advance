# Design

## Architecture Overview

Two-plane split:

1. **Sequencing plane (score-rich)** — GH Project v2, `.adv/roadmap-snapshot.json`, `adv_roadmap`, `/adv-triage`, `/adv-roadmap` keep Value/TC/RROE/Effort/WSJF.
2. **Quality plane (score-blind)** — `ROADMAP.md` and quality-producing workflow docs remove or forbid score-as-quality-budget inputs. Proposal/discover/design/prep/apply/review/harden use agreement/spec/contract evidence, not triage scores.

No runtime schema/tool API change. `adv_roadmap` remains unchanged.

## Key Decisions

1. ROADMAP.md rank-only: neutral `## Features (ranked)`, no `V|TC|RROE|E|WSJF` columns, no `WSJF computed this run`; ordering may still derive from WSJF.
2. Snapshot/tool stay score-rich: keep `RoadmapFeature.value/time_criticality/rroe/effort/wsjf` and `sortFeaturesByWsjf` tests.
3. Add `### Score-Blind Quality Invariant` to `ADV_INSTRUCTIONS.md`; update current roadmap wording so ROADMAP.md is rank-only and score fields live in GH Project v2/snapshot.
4. Add one-line invariant references to proposal/discover/design/prep; add `/adv-roadmap` sequencing-only side-quest warning.
5. Define future sanitizer contract: strip `<!-- adv-triage:scoring v1 ... -->` and score tables/lines with V/TC/RROE/E/WSJF headers or score rows like `| 8 | 3 | 13 | 3 | 8.0 |`; implementation deferred to `wireIssueChangeLinkage`.

## Implementation Strategy

1. Red tests: invariant presence; triage ROADMAP layout lacks score columns and summary wording; roadmap sorting remains score-based.
2. Update docs: `ADV_INSTRUCTIONS.md`, `adv-triage.md`, `adv-roadmap.md`, `adv-proposal.md`, `adv-discover.md`, `adv-design.md`, `adv-prep.md`.
3. Run focused tests then `pnpm run check` from `plugin/`.

## Affected Components
Command docs + asset tests only. No Temporal, storage, MCP schema, or runtime tool changes.

## LBP Analysis
Structural prevention beats visible-score + ignore-prose. This follows P33: remove bias surface from quality plane and test invariant.

## Risks / Mitigations
- Human rank opacity → GH Project v2 and `/adv-roadmap` keep score details.
- `adv_roadmap` regression → preserve score-sorting tests.
- Sanitizer over-strip → narrow contract and defer implementation.
- `wireIssueChangeLinkage` race → prep coordination task.

## Validator Result
VERDICT: VALIDATED. Suggestions incorporated: update ADV_INSTRUCTIONS roadmap wording, test run-summary stripping, add sanitizer pattern example.