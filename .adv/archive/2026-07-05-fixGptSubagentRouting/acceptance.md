# Acceptance

Reviewed at: 2026-07-04T19:11:15.115Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | GPT ADV sessions have clear provider guidance for when to spawn existing workers for research/discovery, scans, implementation, and verify bursts. | pass | GPT provider hint updated in toolbox gpt.md with cross-gate/multi-file/cross-cutting worker guidance; reviewer verdict READY. |
| SC2 | success_criterion | GPT provider-hint delegation cues are protected by deterministic tests. | pass | Toolbox provider-hints tests now assert GPT apply-task cue, cross-gate/research cue, and no primary/phantom routing; npm test passed 21 tests. |
| SC3 | success_criterion | Ready-task routing metadata is visible in bounded formatted output when present. | pass | Advance formatter/task tests verify bounded delegation_hint/frontend metadata projection; targeted tests passed 216 tests. |
| SC4 | success_criterion | Delivery notes distinguish source/test verification from live-session behavior requiring provider-hint deploy plus OpenCode restart. | pass | Final verification task and acceptance notes state live OpenCode behavior requires provider-hint deploy + restart/fresh session before runtime claim. |
| AC1 | acceptance_criterion | GPT provider hint includes GLM-parity baseline delegation guidance for multi-gate, multi-file, or cross-cutting ADV work, while preserving orchestrator-owned authority boundaries. | pass | Toolbox gpt.md updated with GLM-parity baseline and main-orchestrator authority boundary; toolbox npm test passed 21 tests after assertions. |
| AC2 | acceptance_criterion | Provider-hints tests fail if GPT loses minimum ADV delegation cues: apply-task delegation cue, cross-gate/research cue, and no primary/phantom agent routing. | pass | test/plugin.test.js includes GPT content assertions for apply cue, cross-gate/research cue, and forbidden primary/phantom routing; npm test passed 21 tests. |
| AC3 | acceptance_criterion | `adv_task_ready` formatted ready output exposes only bounded routing metadata keys needed for delegation decisions, including `delegation_hint` and `frontend` when present. | pass | tool-formatters/task tests verify formatted ready output exposes delegation_hint/frontend when present; bin/oc-test targeted suite passed 216 tests. |
| AC4 | acceptance_criterion | `adv_task_ready` preserves existing raw ready-task payload compatibility; missing metadata remains valid and formats cleanly. | pass | Task tests verify raw ready[] compatibility and missing metadata clean formatting; bin/oc-test targeted suite passed 216 tests. |
| AC5 | acceptance_criterion | Content edits are GPT-only unless discovery/design finds a blocking parity issue in another provider; non-GPT providers may be audited but are not required to change. | pass | Content edits in toolbox are limited to providers/gpt.md and tests; non-GPT provider hints unchanged. |
| AC6 | acceptance_criterion | Coordinated delivery covers `advance` and `~/toolbox` source surfaces, with repo-scoped verification for each touched repo. | pass | Advance verification passed: bin/oc-test targeted suite 216 tests and pnpm run check. Toolbox verification passed: npm test 21 tests. |
| AC7 | acceptance_criterion | Final release notes state whether live OpenCode behavior was verified in a fresh/restarted session; if not, they explicitly call out deploy/restart required. | pass | Verification task explicitly records live OpenCode behavior not verified in-session; provider-hint deploy + OpenCode restart/fresh session required. |
| C1 | constraint | Specs are laws; durable routing invariants must be represented in the appropriate capability spec. | respected | delegation-defaults spec updated and tests added; no prose-only durable invariant. |
| C2 | constraint | Provider hint selection must remain based on structured provider/model context, not free-text model-name guessing. | respected | provider-hints plugin mapping remains structured providerID-based; plugin.js not changed to free-text guessing. |
| C3 | constraint | Worker routing must preserve the allowed ADV sub-agent roster and typed report contracts. | respected | Provider-hint test forbids primary/phantom routing; existing worker roster preserved; no new worker contract introduced. |
| C4 | constraint | Mutating implementation work must use isolated worktrees for each repo being changed. | respected | Advance work used ADV worktree change/fixGptSubagentRouting; toolbox work used ad-hoc worktree fix/gpt-subagent-routing. |
| C5 | constraint | Focus provider-hint content edits on GPT for this change unless design finds a blocking inconsistency that affects the approved criteria. | respected | Provider content edit is GPT-only; non-GPT hints audited but not modified. |
| DONT1 | avoidance | Do not create new sub-agent identities. | respected | No new sub-agent identities added; changes use existing adv-researcher/adv-engineer terms only. |
| DONT2 | avoidance | Do not route primary agents (`adv`, `plan`, `build`) as sub-agents. | respected | Tests forbid primary/phantom routing; GPT hint does not route adv/plan/build as sub-agents. |
| DONT3 | avoidance | Do not delegate orchestrator-owned authority: user checkpoints, artifact synthesis, ADV state mutation, scope-drift decisions, or gate completion. | respected | GPT hint explicitly keeps task/gate/archive/release authority with main orchestrator. |
| DONT4 | avoidance | Do not make sub-agent spawning fully automatic or runtime-enforced without orchestrator judgment. | respected | Design and implementation add guidance/metadata visibility only; no runtime auto-spawn enforcement added. |
| DONT5 | avoidance | Do not revive provider-specific ADV runtime agents such as `adv-gpt` or `adv-claude`. | respected | No provider-specific ADV runtime agents added or revived. |
| DONT6 | avoidance | Do not claim live-session behavior changed unless provider hints were deployed and OpenCode was restarted or otherwise freshly loaded. | respected | Runtime behavior not claimed as live-verified; deploy/restart requirement recorded. |
| OOS1 | out_of_scope | Creating new sub-agent identities. | not_applicable | No new sub-agent identities created; out of scope respected. |
| OOS2 | out_of_scope | Changing nested sub-agent depth policy. | not_applicable | Nested sub-agent depth policy unchanged. |
| OOS3 | out_of_scope | Reworking the full ADV gate lifecycle. | not_applicable | ADV gate lifecycle unchanged. |
| OOS4 | out_of_scope | Changing OpenCode model routing defaults beyond provider-hint/delegation behavior needed for this issue. | not_applicable | OpenCode model routing defaults unchanged. |
| OOS5 | out_of_scope | Required content edits for non-GPT provider hints. | not_applicable | Non-GPT provider hint content not edited. |

