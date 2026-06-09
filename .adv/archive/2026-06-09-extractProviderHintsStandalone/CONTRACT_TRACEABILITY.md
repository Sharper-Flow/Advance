# Contract Traceability

**Change ID:** extractProviderHintsStandalone
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-06-09T21:32:25.673Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| C1 | constraint | pass | static_check | package.json has type:module, main:plugin.js. No tsconfig.json, no build step. Plain JS plugin at ~/toolbox/plugins/opencode-provider-hints/. |
| C2 | constraint | pass | static_check | opencode.jsonc updated: opencode-provider-hints listed at line 144 before Advance/plugin at line 145. |
| C3 | constraint | pass | static_check | Full ADV test suite passes: 3593 tests green. ADV system-block retains 5 domain sections. Plugin loads independently. |
| C4 | constraint | pass | static_check | rq-providerAdvSkinny01 in advance-meta.md rewritten for dual-plugin architecture. Scenario 3 now describes standalone plugin injection. |
| DONT1 | avoidance | respected | review | Plugin at ~/toolbox/plugins/opencode-provider-hints/ — no new GitHub repo created. |
| DONT2 | avoidance | respected | review | No changes to OpenCode core SystemPrompt.provider(). |
| DONT3 | avoidance | respected | review | Provider hint .md files copied verbatim to new plugin. Content unchanged. |
| DONT4 | avoidance | respected | review | No TypeScript build step. Plain JS plugin.js. |
| OOS1 | out_of_scope | missing | not_applicable |  |
| OOS2 | out_of_scope | missing | not_applicable |  |
| OOS3 | out_of_scope | missing | not_applicable |  |
| OOS4 | out_of_scope | missing | not_applicable |  |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-27170820a565 |  |  |  | Pre-contract task: created before standard rigor contract was minted |
| tk-3c2446e55571 |  |  |  | Pre-contract task: created before standard rigor contract was minted |
| tk-fbbec2dc241e |  |  |  | Pre-contract task: created before standard rigor contract was minted |
| tk-f4f936ae9f47 |  |  |  | Pre-contract task: created before standard rigor contract was minted |
| tk-ef2aeab06ded |  |  |  | Pre-contract task: created before standard rigor contract was minted |
| tk-2e0172be920d |  |  |  | Pre-contract task: created before standard rigor contract was minted |
| tk-b5fa76ac91f5 |  |  |  | Pre-contract task: created before standard rigor contract was minted |
| tk-e09f51f53c7d |  |  |  | Pre-contract task: created before standard rigor contract was minted |
| tk-a29ce6354a26 |  |  |  | Pre-contract task: created before standard rigor contract was minted |
| tk-71c5b9cdc427 |  |  |  | Pre-contract task: created before standard rigor contract was minted |
| tk-f66e7b735a9b |  |  |  | Pre-contract task: created before standard rigor contract was minted |
| tk-cd43f14e0f20 |  |  |  | Pre-contract task: created before standard rigor contract was minted |
| tk-fa5f9912d4ca |  |  |  | Pre-contract task: created before standard rigor contract was minted |
| tk-a2bb9262ef59 |  |  |  | Pre-contract task: created before standard rigor contract was minted |
| tk-3df67991d99a |  |  |  | Pre-contract task: created before standard rigor contract was minted |
| tk-d8780c972160 |  |  |  | Pre-contract task: created before standard rigor contract was minted |
| tk-1cf89dc0bd98 |  |  |  | Pre-contract task: created before standard rigor contract was minted |
| tk-ff8d72882989 |  |  |  | Pre-contract task: created before standard rigor contract was minted |
| tk-2b643c4ef90d |  |  |  | Pre-contract task: created before standard rigor contract was minted |
| tk-2b885cb053f4 |  |  |  | Pre-contract task: created before standard rigor contract was minted |
| tk-7118f9c60b65 |  |  |  | Pre-contract task: created before standard rigor contract was minted |
| tk-841da0e27efd |  |  |  | Pre-contract task: created before standard rigor contract was minted |
| tk-160af6a4748b |  |  |  | Pre-contract task: created before standard rigor contract was minted |
| tk-5d06be22eab2 |  |  |  | Pre-contract task: created before standard rigor contract was minted |
| tk-a57e4e6ecebc |  |  |  | Pre-contract task: created before standard rigor contract was minted |
| tk-8cf8ac5cd45f |  |  |  | Pre-contract task: created before standard rigor contract was minted |
| tk-8c352c960581 |  |  |  | Pre-contract task: created before standard rigor contract was minted |
| tk-b659862f9e7d |  |  |  | Pre-contract task: created before standard rigor contract was minted |
| tk-717141e64303 |  |  |  | Pre-contract task: created before standard rigor contract was minted |
