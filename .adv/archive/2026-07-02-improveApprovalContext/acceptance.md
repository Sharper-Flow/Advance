# Acceptance

Reviewed at: 2026-07-02T01:13:59.825Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | Final approval prompts let user understand broader consequences before approving. | pass | Acceptance review READY: approval surfaces now require Approval Consequence Context before acceptance/archive approval; asset tests pin review/harden/archive/ADV sign-off wiring. |
| SC2 | success_criterion | Harden prepares release-readiness answers before archive/complete sign-off depends on them. | pass | Harden command now carries Release Readiness Summary into executiveSummary before archive; archive reads it for sign-off context. |
| SC3 | success_criterion | Approval context stays concise, source-backed, and auditable. | pass | Shared renderer enforces stable categories, status vocabulary, evidence pointers, N/A handling, and byte bounds; tests cover these invariants. |
| AC1 | acceptance_criterion | Acceptance and archive/complete prompts show delivered value, enabling-only/follow-up dependency, ops readiness, migration/data impact, frontend/preview impact, collision/release risk, open follow-ups, and next action. | pass | tr_mr2t7af7_6cff8c70: approval consequence asset + renderer tests passed; asset test requires all eight categories in acceptance/archive sign-off surfaces. |
| AC2 | acceptance_criterion | Each category shows source-backed status or brief `N/A`; empty categories are not silently omitted. | pass | Renderer tests require every category, non-empty evidence, source-backed N/A behavior, and missing evidence rejection; tr_mr2t7af7_6cff8c70 passed. |
| AC3 | acceptance_criterion | Harden prepares or verifies ops/migration/frontend/collision/release-readiness answers before archive sign-off. | pass | adv-harden asset test requires Release Readiness Summary, executiveSummary persistence, and harden evidence unavailable fallback; tr_mr2t7af7_6cff8c70 passed. |
| AC4 | acceptance_criterion | Blocking follow-ups block release; non-blocking follow-ups are listed as coming next or needs done after closure. | pass | archive/ADV sign-off asset test requires checkOpsFollowupReleaseBlockers and getOpenOpsFollowupObligations semantics; tr_mr2t7af7_6cff8c70 passed. |
| AC5 | acceptance_criterion | Prompts do not include raw logs, diffs, task spam, or full scanner reports. | pass | Renderer and command tests require bounded consequence context and command prose forbids raw logs, diffs, task spam, and full scanner reports; tr_mr2t7af7_6cff8c70 passed. |
| AC6 | acceptance_criterion | No new checkpoints, no second confirmation, Tier A/Tier B parsing unchanged. | pass | Acceptance/harden/archive edits explicitly state no new checkpoint/second confirmation; Tier A/Tier B sections preserved; tr_mr2t7af7_6cff8c70 and tr_mr2t88ry_e8ed29b3 passed. |
| AC7 | acceptance_criterion | Tests/specs fail if required consequence categories or source-backed evidence rules are removed. | pass | Spec law plus renderer/asset tests fail if categories/evidence rules are removed; tr_mr2t7af7_6cff8c70 and pnpm run check tr_mr2t88ry_e8ed29b3 passed. |
| C1 | constraint | Source readiness/consequence statements from structural evidence where available. | respected | Rows require source/evidence pointers; commands name structural sources: task summaries, contract matrix, subagent reports, archive preflight, harden summary, follow-up blockers. |
| C2 | constraint | Keep harden as the owner for release/deploy/production/docs/cleanup readiness when those answers are needed for archive/complete approval. | respected | Harden owns Release Readiness Summary for release/deploy/production/docs/cleanup readiness before archive begins. |
| C3 | constraint | Preserve archive Tier B whitelist-only parsing and no LLM fallback. | respected | adv-archive Tier B whitelist/no LLM fallback text remains unchanged; consequence context is before prompt only. |
| C4 | constraint | Keep approval context terse and scannable; use brief N/A rows for empty categories. | respected | Shared renderer bounds output and evidence length; command prose requires terse, scannable rows and brief N/A rationales. |
| C5 | constraint | Design must verify exact assembly points for acceptance summary, executive summary, harden evidence, archive sign-off, archive terminal output, and brief archive summary before implementation. | respected | Implementation wires exact assembly points: adv-review, executiveSummary, adv-harden, adv-archive sign-off/report, and ADV Sign-Off Boundary. |
| DONT1 | avoidance | Do not dump raw logs, diffs, task spam, or full scanner reports into approval prompts. | respected | Renderer comments/tests and command prose forbid raw logs, diffs, task spam, full scanner reports; reviewer verdict READY. |
| DONT2 | avoidance | Do not add new human approval checkpoints or second confirmations. | respected | No new approval parser or checkpoint added; existing acceptance/archive prompts preserved. |
| DONT3 | avoidance | Do not invent weak summaries without source-backed evidence. | respected | Missing/unreadable harden evidence must render warning/blocked as harden evidence unavailable; renderer rejects missing evidence. |
| DONT4 | avoidance | Do not move readiness checks later than the approval point that relies on them. | respected | Harden persists readiness before archive; archive blocks if required harden evidence is missing/unreadable. |
| DONT5 | avoidance | Do not treat heuristics as authority for readiness, release safety, persistence, or gate completion. | respected | Renderer/model owns correctness-critical category/status/evidence invariants; command heuristics are only evidence sources, not authority. |
| OOS1 | out_of_scope | Replacing the seven-gate lifecycle. | not_applicable | Seven-gate lifecycle unchanged. |
| OOS2 | out_of_scope | Broad prompt slop reduction unrelated to final approval consequence context. | not_applicable | Scope limited to final approval consequence context surfaces and tests. |
| OOS3 | out_of_scope | Product-specific ops, database, or frontend behavior for downstream apps. | not_applicable | No downstream product-specific ops/database/frontend behavior changed. |
| OOS4 | out_of_scope | Changing archive finalization semantics beyond surfacing prepared consequences and readiness answers. | not_applicable | Archive finalization semantics unchanged; only sign-off/report context changed. |

