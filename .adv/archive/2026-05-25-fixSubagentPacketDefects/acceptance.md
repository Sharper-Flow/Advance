# Acceptance

Reviewed at: 2026-05-25T02:32:05.989Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| AC1 | acceptance_criterion | Top-level ADV instructions state typed worker spawns must include `WORKING DIRECTORY`, `CHANGE`, `TASK`, and `ATTEMPT`; `adv-reviewer` typed workers must also include `PHASE`. | pass | Passed: src/adv-task-assets.test.ts asserts top-level ADV contains Typed worker packet contract with WORKING DIRECTORY, CHANGE, TASK, ATTEMPT, adv-reviewer PHASE, orchestrator-owned, never ask user, corrected retry, inline fallback. |
| AC2 | acceptance_criterion | Top-level ADV instructions state missing typed-worker packet identity fields are orchestrator defects handled internally by corrected retry or inline fallback, never by user `question`. | pass | Passed: src/adv-task-assets.test.ts asserts missing typed-worker packet fields are orchestrator-owned and handled by retry with corrected packet or continue inline, never ask user. |
| AC3 | acceptance_criterion | `adv-reviewer` and `adv-engineer` prompts do not instruct leaf workers to ask the user/orchestrator via `question` for missing `TASK`, `PHASE`, `ATTEMPT`, or `WORKING DIRECTORY`; they return structured packet-defect failure for orchestrator recovery. | pass | Passed: src/adv-reviewer-asset.test.ts and src/adv-engineer-assets.test.ts assert missing packet identity fields produce packet_defect structured failure and forbid question/ask-orchestrator wording in relevant sections. |
| AC4 | acceptance_criterion | Asset tests fail if user-facing `question` wording returns for missing packet identity fields. | pass | RED evidence: focused tests failed before prompt changes because policy/packet_defect wording was absent. GREEN evidence: same tests passed after patch. |
| AC5 | acceptance_criterion | Focused asset tests and `pnpm run check` pass. | pass | Passed: pnpm exec vitest run src/adv-task-assets.test.ts src/adv-reviewer-asset.test.ts src/adv-engineer-assets.test.ts (3 files, 110 tests). Passed: pnpm run check. |
| C1 | constraint | Do not weaken `adv_subagent_report_submit` schemas. | respected | No changes to plugin/src/types/subagent-reports.ts or adv_subagent_report_submit schemas. |
| C2 | constraint | Do not add persisted report support for `adv-researcher` or `adv-tron`. | respected | No persisted report schema/support added for adv-researcher or adv-tron. |
| C3 | constraint | Do not redesign delegation routing. | respected | Changes limited to ADV prompt policy and asset tests; no delegation routing code changed. |
| DONT1 | avoidance | Do not make users provide `TASK`, `PHASE`, `ATTEMPT`, `sessionID`, or other packet identity values. | respected | Prompts now explicitly say packet identity values are not user questions; top-level says never ask user for them. |
| DONT2 | avoidance | Do not rely on prose-only guidance without tests. | respected | Prompt guidance backed by asset tests in adv-task-assets, adv-reviewer-asset, and adv-engineer-assets. |

