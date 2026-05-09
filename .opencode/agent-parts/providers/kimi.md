<!-- PROVIDER_HINT:kimi -->

## Provider Hint

- Model family: Kimi
- Critical instructions (gates, state access, NEVER/ONLY) non-negotiable; re-check before each gate.
- Repeated phrases/looping output → stop, summarize state, continue.
- Local code exploration: lgrep first (`lgrep_search_semantic`, `lgrep_search_symbols`); not glob/grep for concept/symbol.
- Multiple constraints → check each separately; do not collapse rules.
- Sequential tool deps: one at time, in order. Never parallelize dependent calls.
