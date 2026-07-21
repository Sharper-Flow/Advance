# Contract Traceability

**Change ID:** fixPacketDefectWorkDiscard
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-21T04:59:14.805Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | 3 manifests (adv-researcher.md, adv-tron.md, adv-visual-review.md) carry lane-aware wording verified by 6 tests in optimized-handoff-assets.test.ts (tr_mru678p0, tr_mru67j55). Tests assert 'complete the [task] anyway', 'never discard completed work', 'PACKET DEFECT' clauses. |
| AC2 | acceptance_criterion | pass | test | adv.md typed-worker contract row lists all 6 spec-covered lanes. Verified by 'main agent typed-worker contract scope' tests (tr_mru68yq3). |
| AC3 | acceptance_criterion | pass | test | buildIdentitySection emits required_from: 'orchestrator_packet_header' + note. Verified by 2 tests in briefing-packet-renderer.test.ts (tr_mru6an35) covering engineer + archive lanes. |
| AC4 | acceptance_criterion | pass | test | adv-engineer-assets.test.ts, adv-reviewer-asset.test.ts, adv-designer-assets.test.ts all pass (277/277 sweep tr_mru6bbja). Existing 'refuse to begin' / 'structured packet-defect failure' / 'Do NOT call question' assertions intact. |
| AC5 | acceptance_criterion | pass | test | Touched files (7) pass prettier + eslint + typecheck + schemas:check + agent-manifest:check. Targeted vitest sweep 277/277. NOTE: full `pnpm run check` is blocked by pre-existing trunk format breakage in active-change-pointer.test.ts + archive-gate.test.ts (commit 578d8aff, NOT this change). Touched-scope verification passes. |
| C1 | constraint | respected | static_check | No persisted-report schema file changed. briefing-packet-renderer.ts buildIdentitySection uses section(kind, source_label, content) with additive object fields only; BriefingPacketSectionSchema.content remains z.unknown(). |
| C2 | constraint | respected | static_check | No Task-tool validator code touched. Touched files: 3 read-only lane manifests, adv.md, briefing-packet-renderer.ts + tests. |
| C3 | constraint | respected | static_check | 277/277 existing tests pass. New assertions are additive only (toContain / toMatch on positive clauses; no existing assertion weakened). |
| DONT1 | avoidance | respected | review | No new agent-lane categories invented. Typed-worker contract row reuses existing lane names from spec.json. |
| DONT2 | avoidance | respected | review | adv-engineer.md, adv-designer.md, adv-reviewer.md NOT modified. Existing 'refuse to begin' policy intact (verified by unchanged asset tests). |
| DONT3 | avoidance | respected | review | BRIEFING_PACKET_LANE_SCHEMA_VERSION unchanged at '1.0'. New required_from field is additive content under z.unknown() section content. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-2cef91dd9331 |  | AC4, AC5 |  |  |
| tk-33b5173141f0 | AC2 |  | C3 |  |
| tk-a3479c712725 | AC3 |  | C1, DONT3 |  |
| tk-ff1afa6666db | AC1 |  | C1, C3, DONT1 |  |
