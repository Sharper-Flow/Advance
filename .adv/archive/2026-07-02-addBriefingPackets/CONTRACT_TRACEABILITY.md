# Contract Traceability

**Change ID:** addBriefingPackets
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-02T20:22:05.808Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | adv-reviewer READY; command/agent assets consume generated BRIEFING PACKET slices; briefing-packets-command-assets.test passed. |
| SC2 | success_criterion | pass | review | Renderer emits lane-specific bounded sections; no raw artifact/report dump; targeted suite 11 files/245 tests passed after rebase. |
| SC3 | success_criterion | pass | review | classifier maps typed report fields to durable outcomes; archive digest writes durable facts and excludes transient prompt context; archive.test passed. |
| AC1 | acceptance_criterion | pass | test | adv_change_show include.briefingPacket source path tested in plugin/src/tools/change.test.ts; tool-name asset test confirms no adv_briefing_packet tool; targeted suite passed. |
| AC2 | acceptance_criterion | pass | test | Briefing lane anchors derive via getSubagentReportPacketAnchors/SUBAGENT_REPORT_FIELD_SOURCES; types and command asset tests passed. |
| AC3 | acceptance_criterion | pass | test | Renderer tests cover source labels and bounded content; command asset tests ban duplicated AFFECTED FILES/AC/CONTRACT/EPIC manual sections; targeted suite passed. |
| AC4 | acceptance_criterion | pass | test | Renderer unavailable-state tests pass; missing structured state renders explicit unavailable markers; classifier has no keyword/prose inference path. |
| AC5 | acceptance_criterion | pass | test | Renderer non-Epic and Epic compact context tests pass; Epic order remains advisory in spec/command assets. |
| AC6 | acceptance_criterion | pass | test | briefing-fact-classifier.test covers typed outcomes; reviewer remediation wired readback facts into change.ts and change.test; targeted suite passed. |
| AC7 | acceptance_criterion | pass | test | archive.test covers BRIEFING_DIGEST.md, transient exclusion, durable facts, same-day replay, and existing dated bundle replay without duplicate digest; targeted suite passed. |
| AC8 | acceptance_criterion | pass | test | BriefingPacketSchema enforces session_metadata.audit_only true; no live packet state persistence path; type/renderer tests passed. |
| AC9 | acceptance_criterion | pass | test | Spec/asset tests cover packet-anchor derivation, lane-slice bounds, command consumption, and lifecycle cleanup; targeted suite passed after rebase. |
| C1 | constraint | respected | static_check | Zod schemas, TypeScript lane maps, classifier enum outcomes, renderer unit tests, and spec asset tests own correctness structurally. |
| C2 | constraint | respected | static_check | Strict sub-agent report schemas retained; anchors are derived from SUBAGENT_REPORT_FIELD_SOURCES; missing anchors throw rather than infer. |
| C3 | constraint | respected | static_check | Delivery uses existing adv_change_show include path and command/handoff packet consumption; ADV_TOOL_NAMES test confirms no standalone briefing tool. |
| C4 | constraint | respected | static_check | LANE_SECTIONS and omitTail bounds in renderer; schema caps sections/facts; renderer tests verify bounded slices. |
| C5 | constraint | respected | static_check | Classifier separates transient_prompt_context from durable outcomes; archive digest filters transient context and records durable archive evidence. |
| C6 | constraint | respected | static_check | Implementation remains current repo scoped; no target_path/product read expansion added beyond optional compact Epic membership context. |
| DONT1 | avoidance | respected | review | No checklist source of truth added; generated renderer/types/spec tests own packet structure. |
| DONT2 | avoidance | respected | review | Command asset tests ban raw manual sections; renderer uses structured summaries, bounded facts, and source labels only. |
| DONT3 | avoidance | respected | review | Non-Epic packets render valid; Epic context present:false path tested; Epic membership remains optional/advisory. |
| DONT4 | avoidance | respected | review | No project-level singleton/shared workflow state added; packets are generated read projections from current change state. |
| DONT5 | avoidance | respected | review | Briefing packets do not complete gates, override proof, or mutate state; archive digest is written only by archive flow. |
| DONT6 | avoidance | respected | review | session_metadata audit_only is schema-enforced; no session log/tool-read persistence added. |
| DONT7 | avoidance | respected | review | tool-name asset test confirms no adv_briefing_packet tool; command docs reference existing typed tools only. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-eb2cc01eed52 | AC1, AC2, AC4, AC7, AC8, AC9, C1, C2, C3 | AC1, AC2, AC4, AC8, AC9 | DONT1, DONT2, DONT5, DONT6, DONT7 |  |
| tk-cb9e107ca5ef | AC2, AC3, AC4, AC5, AC8, C1, C2, C4 | AC2, AC3, AC4, AC5, AC8 | DONT1, DONT2, DONT3, DONT4, DONT5, DONT6 |  |
| tk-12d65d289dab | AC1, AC3, AC4, AC5, C1, C3, C4 | AC1, AC3, AC4, AC5 | DONT1, DONT2, DONT3, DONT5, DONT7 |  |
| tk-1d4d6a5d94a3 | AC6, C1, C2, C5 | AC6 | DONT1, DONT2, DONT5, DONT6 |  |
| tk-e97d791ffb60 | AC7, C1, C5 | AC7 | DONT2, DONT3, DONT5, DONT6 |  |
| tk-3c3a4a9e0637 | AC1, AC2, AC3, AC9, C1, C3, C4 | AC1, AC2, AC3, AC9 | DONT1, DONT2, DONT4, DONT5, DONT7 |  |
| tk-24faf6e93013 |  | SC1, SC2, SC3, AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC9, C1, C2, C3, C4, C5, C6 | DONT1, DONT2, DONT3, DONT4, DONT5, DONT6, DONT7 |  |
