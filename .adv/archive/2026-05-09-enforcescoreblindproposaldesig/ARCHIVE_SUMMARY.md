# Archive: enforceScoreBlindProposalDesign

**Change ID:** enforcescoreblindproposaldesig
**Archived:** 2026-05-09T05:49:39.483Z
**Created:** 2026-05-09T05:18:05.220Z

## Tasks Completed

- ✅ Add red asset tests for score-blind invariant and ROADMAP.md score-free layout: assert ADV_INSTRUCTIONS contains Score-Blind Quality Invariant; assert adv-triage ROADMAP layout lacks V/TC/RROE/E/WSJF columns and lacks WSJF run-summary wording; preserve existing roadmap sorting tests as baseline.
  > Added tests in adv-instructions-assets.test.ts for Score-Blind Quality Invariant presence/scope, and manifest-doc-drift.test.ts tests for adv-triage ROADMAP.md score-free layout while preserving score-rich snapshot schema. Red run failed as expected on missing invariant/layout updates.
- ✅ Implement score-blind invariant in ADV_INSTRUCTIONS.md and update Change Origin/roadmap wording so ROADMAP.md is rank-only while GH Project v2 and .adv/roadmap-snapshot.json remain score-rich.
  > Added Score-Blind Quality Invariant to ADV_INSTRUCTIONS.md. Updated Change Origin source-of-truth split and anti-pattern wording so ROADMAP.md is rank-only while GH Project v2 and .adv/roadmap-snapshot.json remain score-rich.
- ✅ Update command docs: adv-triage Phase 5 ROADMAP.md layout to rank-only; adv-roadmap sequencing-only side-quest warning; adv-proposal/discover/design/prep references to score-blind invariant.
  > Updated adv-triage Phase 5 to generate a rank-only score-free ROADMAP.md while preserving score-rich snapshot schema. Updated adv-roadmap with sequencing-only side-quest warning and anti-pattern. Added score-blind invariant references to proposal/discover/design/prep. Updated current ROADMAP.md to rank-only. Focused asset tests pass.
- ✅ Define future roadmap-origin issue-body sanitizer contract: strip ADV scoring trailers and obvious V/TC/RROE/E/WSJF score-field lines before proposal synthesis; add coordination note for wireIssueChangeLinkage without implementing /adv-proposal #N.
  > Defined concrete future roadmap-origin issue import sanitizer contract in ADV_INSTRUCTIONS.md: strip adv-triage scoring trailers, V/TC/RROE/E/WSJF score headers, and matching score rows before /adv-proposal #N synthesis. Added asset test coverage referencing wireIssueChangeLinkage. Focused test passes.
- ✅ Run focused tests for updated asset guards, then run pnpm run check from plugin/ and record verification evidence.
  > Ran focused verification: 59 tests passed across manifest-doc-drift, adv-instructions-assets, roadmap tool tests. Initial pnpm run check failed due Prettier formatting in manifest-doc-drift.test.ts and roadmap.test.ts; formatted flagged files and reran. Final pnpm run check passed: typecheck, test-isolation, lint, and format:check clean.
- ✅ Add formal .adv/specs requirements for score-blind quality invariant, ROADMAP.md score-free mirror, and roadmap-origin issue-import sanitizer; update mirrored docs/specs if required; add/extend tests verifying spec requirement IDs exist.
  > Added formal advance-workflow requirements rq-scoreBlindQuality01, rq-roadmapMirrorScoreFree01, and rq-roadmapOriginSanitize01 to .adv/specs/advance-workflow/spec.json and docs/specs/advance-workflow.md. Bumped spec version to 1.7.0. Added manifest-doc-drift test assertions for IDs and MUST priority. Red test failed before spec update; final focused tests (60) and pnpm run check pass.

## Specs Modified


## Wisdom Accumulated

- **[gotcha]** When using adv_change_update, passing empty strings for artifact fields can overwrite/restage artifacts and trigger scaffold projection on later reads. Only include artifact fields that should be written, and pass non-empty restored content when repairing.
