# Acceptance

Reviewed at: 2026-06-09T21:32:25.673Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| C1 | constraint | **Toolbox pattern**: Plain JS, no TypeScript build step (matches `opencode-claude-max`) | pass | package.json has type:module, main:plugin.js. No tsconfig.json, no build step. Plain JS plugin at ~/toolbox/plugins/opencode-provider-hints/. |
| C2 | constraint | **Plugin order**: New plugin must register before ADV in `opencode.jsonc` for correct injection order | pass | opencode.jsonc updated: opencode-provider-hints listed at line 144 before Advance/plugin at line 145. |
| C3 | constraint | **No breaking changes**: Existing ADV functionality must continue to work | pass | Full ADV test suite passes: 3593 tests green. ADV system-block retains 5 domain sections. Plugin loads independently. |
| C4 | constraint | **Spec compliance**: Must update `rq-providerAdvSkinny01` to reflect new architecture | pass | rq-providerAdvSkinny01 in advance-meta.md rewritten for dual-plugin architecture. Scenario 3 now describes standalone plugin injection. |
| DONT1 | avoidance | Do not create a new GitHub repository (use toolbox location) | respected | Plugin at ~/toolbox/plugins/opencode-provider-hints/ — no new GitHub repo created. |
| DONT2 | avoidance | Do not modify OpenCode core's `SystemPrompt.provider()` (out of scope) | respected | No changes to OpenCode core SystemPrompt.provider(). |
| DONT3 | avoidance | Do not change provider hint content (only move location) | respected | Provider hint .md files copied verbatim to new plugin. Content unchanged. |
| DONT4 | avoidance | Do not introduce TypeScript build step in new plugin | respected | No TypeScript build step. Plain JS plugin.js. |
| OOS1 | out_of_scope | OpenCode core provider hint system (beast.txt, anthropic.txt, etc.) | missing |  |
| OOS2 | out_of_scope | Provider hint content authoring or improvement | missing |  |
| OOS3 | out_of_scope | Community plugin distribution (can promote later if interest grows) | missing |  |
| OOS4 | out_of_scope | Structural enforcement of plugin order (trust config) | missing |  |

