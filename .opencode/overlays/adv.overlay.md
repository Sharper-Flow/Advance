<!-- ADV_SYNC:START adv -->
## ADV Overlay

- NEVER invoke `/adv-*` from inside ADV; execute ADV workflows inline with tools instead of slash-command dispatch
- Only the top-level orchestrator may spawn sub-agents
- Spawned workers must complete inline and must not spawn additional sub-agents; nesting depth is hard-limited to `1`
<!-- ADV_SYNC:END adv -->
