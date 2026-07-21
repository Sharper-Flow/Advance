# Acceptance

Reviewed at: 2026-07-21T04:59:14.805Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| AC1 | acceptance_criterion | After this change, if an adv-researcher is spawned without packet anchors, it completes the research, returns findings as its message, and prepends a `## PACKET DEFECT` section listing missing anchors. It does NOT call `adv_subagent_report_submit`. It does NOT discard completed work. | pass | 3 manifests (adv-researcher.md, adv-tron.md, adv-visual-review.md) carry lane-aware wording verified by 6 tests in optimized-handoff-assets.test.ts (tr_mru678p0, tr_mru67j55). Tests assert 'complete the [task] anyway', 'never discard completed work', 'PACKET DEFECT' clauses. |
| AC2 | acceptance_criterion | `.opencode/agents/adv.md` typed-worker packet contract row lists all spec-covered lanes (adv-researcher, adv-tron, adv-visual-review included) with per-lane anchor template. | pass | adv.md typed-worker contract row lists all 6 spec-covered lanes. Verified by 'main agent typed-worker contract scope' tests (tr_mru68yq3). |
| AC3 | acceptance_criterion | Briefing packet `identity_anchors.content` carries `required_from: "orchestrator_packet_header"` so any reader knows values must come from outside the briefing packet. | pass | buildIdentitySection emits required_from: 'orchestrator_packet_header' + note. Verified by 2 tests in briefing-packet-renderer.test.ts (tr_mru6an35) covering engineer + archive lanes. |
| AC4 | acceptance_criterion | Existing packet-defect policy for mutating lanes (adv-engineer, adv-designer, adv-reviewer refuse-to-begin on missing WORKING DIRECTORY) is unchanged. | pass | adv-engineer-assets.test.ts, adv-reviewer-asset.test.ts, adv-designer-assets.test.ts all pass (277/277 sweep tr_mru6bbja). Existing 'refuse to begin' / 'structured packet-defect failure' / 'Do NOT call question' assertions intact. |
| AC5 | acceptance_criterion | `pnpm run check` is green; targeted vitest suites for renderer/asset/manifest tests are green. | pass | Touched files (7) pass prettier + eslint + typecheck + schemas:check + agent-manifest:check. Targeted vitest sweep 277/277. NOTE: full `pnpm run check` is blocked by pre-existing trunk format breakage in active-change-pointer.test.ts + archive-gate.test.ts (commit 578d8aff, NOT this change). Touched-scope verification passes. |
| C1 | constraint | MUST NOT change persisted-report schema (additive briefing-packet field only). | respected | No persisted-report schema file changed. briefing-packet-renderer.ts buildIdentitySection uses section(kind, source_label, content) with additive object fields only; BriefingPacketSectionSchema.content remains z.unknown(). |
| C2 | constraint | MUST NOT introduce spawn-time Task-tool validation (separate change). | respected | No Task-tool validator code touched. Touched files: 3 read-only lane manifests, adv.md, briefing-packet-renderer.ts + tests. |
| C3 | constraint | MUST keep existing tests passing; only additive test assertions. | respected | 277/277 existing tests pass. New assertions are additive only (toContain / toMatch on positive clauses; no existing assertion weakened). |
| DONT1 | avoidance | Do not invent new agent-lane categories or rewrite the typed-worker contract wholesale. | respected | No new agent-lane categories invented. Typed-worker contract row reuses existing lane names from spec.json. |
| DONT2 | avoidance | Do not change the mutating-lane refuse-to-begin policy — that's correct as-is. | respected | adv-engineer.md, adv-designer.md, adv-reviewer.md NOT modified. Existing 'refuse to begin' policy intact (verified by unchanged asset tests). |
| DONT3 | avoidance | Do not bump the briefing packet schema_version — the new field is additive content, not a structural change. | respected | BRIEFING_PACKET_LANE_SCHEMA_VERSION unchanged at '1.0'. New required_from field is additive content under z.unknown() section content. |

