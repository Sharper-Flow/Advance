# Acceptance

Reviewed at: 2026-07-21T12:50:00.000Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | **SC1**: Defect-origin change proposals carry an explicit Root Cause Analysis section before the proposal gate completes. | pass | adv-problem.md, adv-proposal.md, adv-task.md updated. |
| SC2 | success_criterion | **SC2**: Bypass of RCA on defect-origin changes is documented and visible, never silent. | pass | Bypass rationale template in adv-proposal.md. |
| SC3 | success_criterion | **SC3**: Non-defect origins (idea shaping, planned features, Epic promotion, backlog promotion) are unaffected by the new requirement. | pass | No changes to /adv-idea, /adv-epic. |
| SC4 | success_criterion | **SC4**: `/adv-task` fast-track retains its purpose for well-understood changes but explicitly refuses to skip RCA for undiagnosed defects. | pass | adv-task.md Phase 1 guard. |
| AC1 | acceptance_criterion | **AC1**: `.opencode/command/adv-proposal.md` Pre-flight section contains language requiring defect-origin RCA evidence (or explicit bypass rationale) before Phase 1 problem statement agreement. | pass | adv-problem-assets.test.ts. |
| AC2 | acceptance_criterion | **AC2**: `.opencode/command/adv-task.md` Quick Contract and Phase 1 contain language rejecting defect-origin invocations that lack RCA, with a hint to run `/adv-problem` first. | pass | adv-task-assets.test.ts. |
| AC3 | acceptance_criterion | **AC3**: `.opencode/agents/adv.md` Step 1 "Understand Intent" routing table clarifies defect/bug triggers that route to `/adv-problem` before any proposal-creation path. | pass | adv-instructions-assets.test.ts. |
| AC4 | acceptance_criterion | **AC4**: `.opencode/command/adv-problem.md` Output section lists "Root cause (if defect origin)" as part of the triage summary structure. | pass | adv-problem.md Output bullet. |
| AC5 | acceptance_criterion | **AC5**: `ADV_INSTRUCTIONS.md` HITL Boundary table and pre-implementation phase section reflect the RCA requirement for defect-origin work. | pass | ADV_INSTRUCTIONS.md HITL extended. |
| AC6 | acceptance_criterion | **AC6**: `.adv/specs/advance-workflow/spec.json` adds a new requirement `rq-defectOriginRca01` with at least 2 scenarios covering: (a) defect-origin `/adv-proposal` invocation must carry RCA evidence or document explicit rationale; (b) `/adv-task` defect-origin invocation must carry RCA or defer to `/adv-problem` first. | pass | Spec delta recorded. |
| AC7 | acceptance_criterion | **AC7**: `plugin/src/manifest.ts` documentation comment on the `prerequisites` field clarifies that the array is metadata-only (no runtime enforcement); no behavioral code change. | pass | manifest.test.ts regex. |
| AC8 | acceptance_criterion | **AC8**: Instruction-text regex tests (`adv-instructions-assets.test.ts`, `adv-problem-assets.test.ts`, `adv-task-assets.test.ts`) updated to assert presence of RCA-requirement language. | pass | 8 new regex tests. |
| AC9 | acceptance_criterion | **AC9**: `pnpm run check` exits 0; targeted asset-test suites pass. | pass | pnpm run check exit 0. |
| C1 | constraint | **C1**: Light touch (user direction) — advisory + manifest documentation level only; no runtime hard-block; no Temporal/workflow-level enforcement. | respected | No runtime hard-block. |
| C2 | constraint | **C2**: `prerequisites` field in `plugin/src/manifest.ts` remains pure metadata; no runtime gate added; only documentation updated. | respected | manifest.ts doc-comment only. |
| C3 | constraint | **C3**: `origin_kind` schema on `adv_change_create` remains optional; no Zod schema tightening (avoid breaking legacy writes). | respected | No Zod schema edits. |
| C4 | constraint | **C4**: Provider hints package (`~/.local/share/opencode-provider-hints/providers/*.md`) is NOT modified in this change — cross-repo; tracked as separate follow-up. | respected | No provider hints modified. |
| C5 | constraint | **C5**: `/adv-idea` and `/adv-epic` entry-point disambiguation is NOT in scope — different intents. | respected | No /adv-idea or /adv-epic changes. |
| C6 | constraint | **C6**: Spec extension must integrate with existing `advance-workflow` requirements (e.g., `rq-problemSpecLaw01`, `rq-taskSpecLaw01`). | respected | rq-defectOriginRca01 alongside existing. |
| DONT1 | avoidance | **DONT1**: Do NOT add a runtime hard-block or new Temporal/workflow enforcement layer for RCA — light touch. | respected | No runtime hard-block. |
| DONT2 | avoidance | **DONT2**: Do NOT modify provider hints content in this change — cross-repo follow-up. | respected | Provider hints unchanged. |
| DONT3 | avoidance | **DONT3**: Do NOT tighten `origin_kind` Zod schema (would break legacy writes and require recovery paths). | respected | No schema tightening. |
| DONT4 | avoidance | **DONT4**: Do NOT silently extend RCA requirement to non-defect origins (idea shaping, planned features, Epics, backlog promotion). | respected | Defect-origin scope only. |
| DONT5 | avoidance | **DONT5**: Do NOT regress post-proposal chain (clarify/research/discover/design/prep already strict). | respected | No workflow chain regressions. |
| DONT6 | avoidance | **DONT6**: Do NOT modify `tool-registry.ts`, `tool-role-policy.ts`, or agent manifests — out of scope. | respected | No tool-registry edits. |
| OOS1 | out_of_scope | **OOS1**: Provider hints content updates (cross-repo follow-up change to `opencode-provider-hints` package). | missing |  |
| OOS2 | out_of_scope | **OOS2**: Runtime hard-block on command invocation (excluded by user "light" direction). | missing |  |
| OOS3 | out_of_scope | **OOS3**: Routing table refactor for non-defect intents. | missing |  |
| OOS4 | out_of_scope | **OOS4**: `/adv-idea` and `/adv-epic` disambiguation work. | missing |  |
| OOS5 | out_of_scope | **OOS5**: `origin_kind` schema additions (e.g., `defect_repair` enum value) — would require migration story. | missing |  |

