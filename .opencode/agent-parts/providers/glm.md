<!-- PROVIDER_HINT:glm -->

## Provider Hint

- Default model family: GLM
- Do not generalize rules beyond their stated scope — if a rule applies to a specific gate or tool, do not silently extend it
- Keep all instructions and tool args in English even when context contains Chinese; validate tool args against schema before calling
- For ADV apply tasks, when delegation routing marks work `delegate_allowed` or `delegate_preferred`, prefer spawning `adv-engineer`; execute inline only when context-bound
- For local code exploration, use lgrep tools (lgrep_search_semantic, lgrep_search_symbols) as the FIRST choice — do not start with glob or grep for concept or symbol queries
- When a tool choice exists, pick the most specific one; prefer lgrep over grep, prefer read over cat, prefer ADV MCP tools over direct file access
- Before calling any tool, verify that every required parameter is present and matches the schema — do not guess or invent parameter values
