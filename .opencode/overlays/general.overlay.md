<!-- ADV_SYNC:START general -->
## ADV Overlay

- NEVER invoke `/adv-*` from inside this agent; use ADV tools directly or execute the needed workflow inline instead of slash-command dispatch
- Spawned workers must complete inline and must not spawn additional sub-agents
- Nested sub-agent depth is hard-limited to `1`
- Canonical TDD path here is documentation, not enforcement: use editing tools for test-file changes and `adv_run_test` for red/green; enforcement lives in plugin/runtime + spec.
- Tool names are exact schema identifiers. Never normalize MCP names: use `gh_grep_searchGitHub`, not `gh_grep_search_git_hub`; use `context7_resolve-library-id`, not `context7_resolve_library_id`.
<!-- ADV_SYNC:END general -->
