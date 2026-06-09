<!-- PROVIDER_HINT:qwen -->

## Provider Hint

- Default model family: Qwen 3.7 Max
- Preserve thinking content across multi-turn agent workflows — the model relies on accumulated reasoning context for long-horizon task coherence
- For long-running ADV workflows, summarize intermediate state explicitly rather than relying on the model to infer from distant context
- For ADV apply tasks, when delegation routing marks work `delegate_allowed` or `delegate_preferred`, prefer spawning `adv-engineer`; execute inline only when context-bound
- For local code exploration, use lgrep tools (lgrep_search_semantic, lgrep_search_symbols) as the FIRST choice — do not start with glob or grep for concept or symbol queries
- Sequential tool dependencies must be executed one at a time in order — never parallelize dependent calls
- When a tool choice exists, pick the most specific one; prefer lgrep over grep, prefer read over cat, prefer ADV MCP tools over direct file access
- Before calling any tool, verify that every required parameter is present and matches the schema — do not guess or invent parameter values
