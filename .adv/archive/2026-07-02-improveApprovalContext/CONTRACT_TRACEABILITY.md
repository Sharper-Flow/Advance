# Contract Traceability

**Change ID:** improveApprovalContext
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-02T01:13:59.825Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Acceptance review READY: approval surfaces now require Approval Consequence Context before acceptance/archive approval; asset tests pin review/harden/archive/ADV sign-off wiring. |
| SC2 | success_criterion | pass | review | Harden command now carries Release Readiness Summary into executiveSummary before archive; archive reads it for sign-off context. |
| SC3 | success_criterion | pass | review | Shared renderer enforces stable categories, status vocabulary, evidence pointers, N/A handling, and byte bounds; tests cover these invariants. |
| AC1 | acceptance_criterion | pass | test | tr_mr2t7af7_6cff8c70: approval consequence asset + renderer tests passed; asset test requires all eight categories in acceptance/archive sign-off surfaces. |
| AC2 | acceptance_criterion | pass | test | Renderer tests require every category, non-empty evidence, source-backed N/A behavior, and missing evidence rejection; tr_mr2t7af7_6cff8c70 passed. |
| AC3 | acceptance_criterion | pass | test | adv-harden asset test requires Release Readiness Summary, executiveSummary persistence, and harden evidence unavailable fallback; tr_mr2t7af7_6cff8c70 passed. |
| AC4 | acceptance_criterion | pass | test | archive/ADV sign-off asset test requires checkOpsFollowupReleaseBlockers and getOpenOpsFollowupObligations semantics; tr_mr2t7af7_6cff8c70 passed. |
| AC5 | acceptance_criterion | pass | test | Renderer and command tests require bounded consequence context and command prose forbids raw logs, diffs, task spam, and full scanner reports; tr_mr2t7af7_6cff8c70 passed. |
| AC6 | acceptance_criterion | pass | test | Acceptance/harden/archive edits explicitly state no new checkpoint/second confirmation; Tier A/Tier B sections preserved; tr_mr2t7af7_6cff8c70 and tr_mr2t88ry_e8ed29b3 passed. |
| AC7 | acceptance_criterion | pass | test | Spec law plus renderer/asset tests fail if categories/evidence rules are removed; tr_mr2t7af7_6cff8c70 and pnpm run check tr_mr2t88ry_e8ed29b3 passed. |
| C1 | constraint | respected | static_check | Rows require source/evidence pointers; commands name structural sources: task summaries, contract matrix, subagent reports, archive preflight, harden summary, follow-up blockers. |
| C2 | constraint | respected | static_check | Harden owns Release Readiness Summary for release/deploy/production/docs/cleanup readiness before archive begins. |
| C3 | constraint | respected | static_check | adv-archive Tier B whitelist/no LLM fallback text remains unchanged; consequence context is before prompt only. |
| C4 | constraint | respected | static_check | Shared renderer bounds output and evidence length; command prose requires terse, scannable rows and brief N/A rationales. |
| C5 | constraint | respected | static_check | Implementation wires exact assembly points: adv-review, executiveSummary, adv-harden, adv-archive sign-off/report, and ADV Sign-Off Boundary. |
| DONT1 | avoidance | respected | review | Renderer comments/tests and command prose forbid raw logs, diffs, task spam, full scanner reports; reviewer verdict READY. |
| DONT2 | avoidance | respected | review | No new approval parser or checkpoint added; existing acceptance/archive prompts preserved. |
| DONT3 | avoidance | respected | review | Missing/unreadable harden evidence must render warning/blocked as harden evidence unavailable; renderer rejects missing evidence. |
| DONT4 | avoidance | respected | review | Harden persists readiness before archive; archive blocks if required harden evidence is missing/unreadable. |
| DONT5 | avoidance | respected | review | Renderer/model owns correctness-critical category/status/evidence invariants; command heuristics are only evidence sources, not authority. |
| OOS1 | out_of_scope | not_applicable | not_applicable | Seven-gate lifecycle unchanged. |
| OOS2 | out_of_scope | not_applicable | not_applicable | Scope limited to final approval consequence context surfaces and tests. |
| OOS3 | out_of_scope | not_applicable | not_applicable | No downstream product-specific ops/database/frontend behavior changed. |
| OOS4 | out_of_scope | not_applicable | not_applicable | Archive finalization semantics unchanged; only sign-off/report context changed. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-6008a2d6ccd1 | AC1, AC2, AC3, AC4, AC5, AC6, AC7, C1, C2, C3, C4, C5 |  | DONT1, DONT2, DONT3, DONT4, DONT5, OOS1, OOS2, OOS3, OOS4 |  |
| tk-f8e18014a9d0 | AC1, AC2, AC5, AC7, C1, C4, C5 | AC1, AC2, AC5, AC7 | DONT1, DONT3, DONT5 |  |
| tk-2c5705410682 | AC1, AC2, AC5, AC6, AC7, C1, C3, C4, C5 | AC1, AC2, AC5, AC6, AC7 | DONT1, DONT2, DONT3, DONT4, DONT5 |  |
| tk-0fc1b23a6f49 | AC2, AC3, AC5, AC6, AC7, C1, C2, C3, C4, C5 | AC2, AC3, AC5, AC7 | DONT1, DONT2, DONT3, DONT4, DONT5 |  |
| tk-7cdd66c7b2ea | AC1, AC2, AC3, AC4, AC5, AC6, AC7, C1, C2, C3, C4, C5 | AC1, AC2, AC3, AC4, AC5, AC6, AC7 | DONT1, DONT2, DONT3, DONT4, DONT5, OOS1, OOS4 |  |
| tk-55b2419bd575 |  | SC1, SC2, SC3, AC1, AC2, AC3, AC4, AC5, AC6, AC7, C1, C2, C3, C4, C5 | DONT1, DONT2, DONT3, DONT4, DONT5, OOS1, OOS2, OOS3, OOS4 |  |
