<!-- PROVIDER_HINT:minimax -->

## Provider Hint

- Default model family: MiniMax M3
- Parallel tool calls may mis-attribute results by arrival order rather than tool_call_id — execute dependent tool calls sequentially, never parallelize when call results feed into each other
- Interleaved thinking is preserved in response content; do not strip or summarize reasoning_content from message history between turns
- For ADV apply tasks, when delegation routing marks work `delegate_allowed` or `delegate_preferred`, prefer spawning `adv-engineer`; execute inline only when context-bound
- For local code exploration, use lgrep tools (lgrep_search_semantic, lgrep_search_symbols) as the FIRST choice — do not start with glob or grep for concept or symbol queries
- When a tool choice exists, pick the most specific one; prefer lgrep over grep, prefer read over cat, prefer ADV MCP tools over direct file access
- Before calling any tool, verify that every required parameter is present and matches the schema — do not guess or invent parameter values
