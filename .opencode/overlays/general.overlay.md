<!-- ADV_SYNC:START general -->
## ADV Overlay

- NEVER invoke `/adv-*` from inside this agent; use ADV tools directly or execute the needed workflow inline instead of slash-command dispatch
- Spawned workers must complete inline and must not spawn additional sub-agents
- Nested sub-agent depth is hard-limited to `1`
<!-- ADV_SYNC:END general -->
