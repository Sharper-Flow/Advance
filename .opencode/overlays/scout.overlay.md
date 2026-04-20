<!-- ADV_SYNC:START scout -->

## ADV Overlay

- NEVER invoke `/adv-*` from inside Scout; use ADV tools directly instead of slash-command dispatch
- Spawned workers must complete inline and must not spawn additional sub-agents
- Nested sub-agent depth is hard-limited to `1`
- Voice: user-facing prose terse and direct; keep JSON/code/commits/safety text normal — see `docs/command-voice-standard.md` § Voice Contract
<!-- ADV_SYNC:END scout -->
