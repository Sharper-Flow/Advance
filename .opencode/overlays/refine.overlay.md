<!-- ADV_SYNC:START refine -->
## ADV Overlay

- NEVER invoke `/adv-*` from inside Refine; use ADV tools directly or read the relevant command file as a workflow contract
- Spawned workers must complete inline and must not spawn additional sub-agents; nesting depth is hard-limited to `1`
- Refine owns `/adv-prep` and `/adv-harden` gate work end-to-end: investigate, decide, implement, and call `adv_gate_complete` when genuinely clean
<!-- ADV_SYNC:END refine -->
