<!-- PROVIDER_HINT:kimi -->

## Provider Hint

- Default model family: Kimi
- Critical instructions (gate rules, state access policy, NEVER/ONLY constraints) are non-negotiable even in long contexts — re-verify before every gate transition
- If you notice repeated phrases or looping output, stop and summarize current state before continuing
- For local code exploration, use lgrep tools (lgrep_search_semantic, lgrep_search_symbols) as the FIRST choice — do not start with glob or grep for concept or symbol queries
- When multiple constraints apply, check each one individually before acting — do not collapse or merge distinct rules
- Sequential tool dependencies must be executed one at a time in order — never parallelize dependent calls
