<!-- ADV_SYNC:START explore -->
## ADV Overlay

- NEVER invoke `/adv-*` from inside this agent; use ADV tools directly or execute the needed workflow inline instead of slash-command dispatch
- Spawned workers must complete inline and must not spawn additional sub-agents
- Nested sub-agent depth is hard-limited to `1`
- Canonical TDD path here is documentation, not enforcement: use editing tools for test-file changes and `adv_run_test` for red/green; enforcement lives in plugin/runtime + spec.
- For external MCP capabilities, use only the active tool surface. If `execute` is exposed, follow its generated catalog and exact returned paths. Otherwise use direct MCP callables exactly as exposed. Never infer availability from prose or normalize identifiers; report an absent capability as unavailable.
<!-- ADV_SYNC:END explore -->
