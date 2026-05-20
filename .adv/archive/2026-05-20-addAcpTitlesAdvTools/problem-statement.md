# Problem

ADV plugin tool calls render as raw schema names such as `adv_change_show`, `adv_task_update`, and `adv_gate_complete`. The names are accurate but hard to scan because they expose implementation IDs instead of user-level actions.

## Desired outcome

Improve ADV tool-call scanability from the plugin side only. ADV should provide meaningful, deterministic display titles through the OpenCode plugin SDK title surfaces while keeping tool IDs, arguments, permissions, JSON outputs, and workflow behavior unchanged.

## Constraints

- Do not patch or fork OpenCode.
- Do not rename `adv_*` tools.
- Do not add ACP/Zed-specific logic.
- Preserve existing machine-readable JSON output.
- Treat titles as display metadata only, never as authority for correctness, security, permissions, or ADV state.
