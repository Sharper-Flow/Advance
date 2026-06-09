<!-- PROVIDER_HINT:qwen -->

## Provider Hint

- Default model family: Qwen 3.7 Max
- Preserve thinking content across multi-turn agent workflows — the model relies on accumulated reasoning context for long-horizon task coherence. Loss of prior reasoning degrades task coherence
- For long-running ADV workflows, summarize intermediate state explicitly rather than relying on the model to infer from distant context
- ALWAYS emit a tool call after reasoning about needing one in a thinking block. NEVER describe what the tool would return or fabricate results from reasoning alone
- For ADV apply tasks, when delegation routing marks work `delegate_allowed` or `delegate_preferred`, prefer spawning `adv-engineer`; execute inline only when context-bound
- For local code exploration, use lgrep tools (lgrep_search_semantic, lgrep_search_symbols) as the FIRST choice — do not start with glob or grep for concept or symbol queries
- NEVER parallelize dependent tool calls — if tool B needs tool A's output, wait for A's result before calling B
- Parallel tool calls are for independent operations only — never run the same command multiple times in parallel; make one call, wait for the result, then decide next steps
- When a tool choice exists, pick the most specific one; prefer lgrep over grep, prefer read over cat, prefer ADV MCP tools over direct file access
- Before calling any tool, verify that every required parameter is present and matches the schema — do not guess or invent parameter values
- Call each tool exactly once per distinct operation — never duplicate identical calls in parallel or sequentially
- Parallel batches: every file path, search query, and command must be unique across the batch — no exceptions
- Tool call failed or returned unexpected results? Diagnose root cause before retrying — never blindly repeat
