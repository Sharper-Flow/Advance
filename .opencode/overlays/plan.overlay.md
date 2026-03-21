<!-- ADV_SYNC:START plan -->
## ADV Overlay

- NEVER invoke `/adv-*` from inside Plan; use ADV tools directly or read the relevant command file as a workflow contract
- If work needs delegation, spawn first-level workers only
- Spawned workers must complete inline and must not spawn additional sub-agents; nesting depth is hard-limited to `1`
<!-- ADV_SYNC:END plan -->
