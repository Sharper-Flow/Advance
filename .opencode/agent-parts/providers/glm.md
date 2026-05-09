<!-- PROVIDER_HINT:glm -->

## Provider Hint

- Model family: GLM
- Do not generalize rules beyond stated scope.
- Keep instructions/tool args English; validate schema before call.
- ADV apply + `delegate_allowed`/`delegate_preferred` → prefer `adv-engineer`; inline only context-bound.
- Local code exploration: lgrep first (`lgrep_search_semantic`, `lgrep_search_symbols`); not glob/grep for concept/symbol.
- Pick most specific tool: lgrep > grep, read > cat, ADV MCP > direct file access.
- Before tool call: required params present + schema-valid. Never guess/invent.
