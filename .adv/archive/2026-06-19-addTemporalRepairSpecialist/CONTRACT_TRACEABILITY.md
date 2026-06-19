# Contract Traceability

**Change ID:** addTemporalRepairSpecialist
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-06-19T01:59:32Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | adv-reviewer verdict READY; agent/routing docs require `adv_change_show` + `adv_gate_status` before phantom classification; asset tests passed. |
| SC2 | success_criterion | pass | review | `include.artifactOnly` returns Temporal-backed artifact content and suppresses unreadable sidecar paths; `src/tools/change.test.ts` bounded artifact-only test passed. |
| SC3 | success_criterion | pass | review | `docs/temporal-recovery.md` decision tree separates real Temporal failure, pointer mismatch, target-path confusion, artifact readability mismatch; docs asset test passed. |
| SC4 | success_criterion | pass | review | Agent instructions preserve primary ADV ownership for lifecycle, user checkpoints, cancellation, destructive and approval-gated repair tools; review found no silent repair path. |
| AC1 | acceptance_criterion | pass | test | `.opencode/agents/adv-temporal-repair.md` added as hidden `mode: subagent`; `adv-temporal-repair-assets.test.ts` validates mode and no nested delegation. Targeted tests passed. |
| AC2 | acceptance_criterion | pass | test | Specialist instructions and tests require `adv_change_show` and `adv_gate_status` before declaring state lost; targeted asset tests passed. |
| AC3 | acceptance_criterion | pass | test | State-access asset tests include new specialist and forbid direct ADV state path reads; targeted tests passed. |
| AC4 | acceptance_criterion | pass | test | Specialist/docs limit `adv_change_forget` to exact current-session phantom pointer cleanup; asset/docs tests passed. |
| AC5 | acceptance_criterion | pass | test | Specialist reuses change-scoped `adv-researcher` report transport; no bespoke report schema added. Asset tests and reviewer report submission passed. |
| AC6 | acceptance_criterion | pass | test | `adv_temporal_diagnose` description narrowed and output adds `serverServiceable`; `src/tools/temporal-ops.test.ts` passed. |
| AC7 | acceptance_criterion | pass | test | `docs/temporal-recovery.md` includes phantom-pointer decision tree plus OpenCode restart vs worker restart distinction; docs asset test passed. |
| AC8 | acceptance_criterion | pass | test | Low-risk bounded `include.artifactOnly` support implemented in `adv_change_show`; targeted `change.test.ts` passed. |
| C1 | constraint | respected | static_check | Tool-first state classification, schema-backed report submission, asset tests, and typed matrix enforce structural correctness over heuristic file reads. |
| C2 | constraint | respected | static_check | Specialist has read/classifier/report scope only; full repair tools remain primary ADV actions requiring evidence and arguments. |
| C3 | constraint | respected | static_check | No mutation tool approvals were bypassed; instructions route destructive/approval-gated work to primary ADV/user approval. |
| C4 | constraint | respected | static_check | Specialist is hidden subagent context offload; no new gate authority or lifecycle mutation role added. |
| C5 | constraint | respected | static_check | Docs and agent instructions define ADV tool state as authoritative and sidecar presence as non-authoritative. |
| C6 | constraint | respected | static_check | Agent instructions forbid dereferencing artifact paths unless metadata says `readable:true`; `artifactOnly` suppresses unreadable paths. |
| C7 | constraint | respected | static_check | Docs/acceptance note: live sessions need build/deploy plus OpenCode restart. Preview URL not_applicable: agreement declares `visual_surface:false` and changed files are agent/tool/docs/tests, not browser-visible output. |
| DONT1 | avoidance | respected | review | No new lifecycle gate added; acceptance/release gates unchanged. |
| DONT2 | avoidance | respected | review | Primary mechanism is ADV tool-driven triage/specialist guidance, not shell scripts or manual runbooks. |
| DONT3 | avoidance | respected | review | Sidecar files remain non-authoritative; ADV tools expose artifact state/content metadata. |
| DONT4 | avoidance | respected | review | Specialist forbids nested subagents; asset tests anchor no delegation. |
| DONT5 | avoidance | respected | review | No silent destructive or approval-gated repair path added; primary/user approval remains required. |
| DONT6 | avoidance | respected | review | No bespoke repair report schema added; v1 reuses `adv-researcher` report transport. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-454819fa4d34 | SC1, SC2, SC3, SC4, AC1, AC2, AC3, AC4, AC5 | AC1, AC2, AC3, AC4, AC5 | C1, C2, C3, C4, C5, C6, C7, DONT1, DONT2, DONT3, DONT4, DONT5, DONT6 |  |
| tk-3b587a93b2d5 | SC1, SC3, SC4, AC2, AC3, AC4 | AC2, AC3, AC4 | C1, C2, C3, C4, C5, DONT1, DONT2, DONT4, DONT5 |  |
| tk-0d3ea1d7f477 | SC3, SC4, AC6 | AC6 | C1, C2, C3, C5, DONT2, DONT5 |  |
| tk-e1b592958f0b | SC1, SC2, SC3, SC4, AC2, AC3, AC4, AC7 | AC7 | C1, C2, C3, C5, C6, DONT2, DONT3, DONT5 |  |
| tk-ccc9f0ae8cf4 | SC1, SC2, AC2, AC3, AC8 | AC8 | C1, C3, C5, C6, DONT3, DONT5 |  |
| tk-4d1059ce4cf1 |  | SC1, SC2, SC3, SC4, AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8 | C1, C2, C3, C4, C5, C6, C7, DONT1, DONT2, DONT3, DONT4, DONT5, DONT6 |  |
