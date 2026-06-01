---
name: adv-agent-tool-contracts
description: "ADV agent-callable tool contract checklist — keep schemas, command context packets, prompt instructions, specs, and tests aligned. Use when creating or modifying ADV sub-agents, command packets, report schemas, or agent-callable tools."
keywords:
  [
    "agent-tool-contract",
    "subagent-report",
    "context-packet",
    "adv_subagent_report_submit",
    "schema-packet-prompt",
  ]
license: MIT
metadata:
  priority: high
---

## When to Load This Skill

Load when creating or modifying ADV sub-agents, command packets, typed report schemas, or any agent-callable tool argument contract.

Canonical doc: `docs/agent-tool-contracts.md`.

## Checklist

1. **Schema** — identify required Zod/tool fields. Do not weaken strict ingest to compensate for missing context.
2. **Tool preflight** — classify placeholder-sensitive args in `FIELD_POLICIES`; malformed calls must fail as `INVALID_TOOL_ARGS` before handlers, signals, shell commands, or writes.
3. **Context packet** — add explicit anchors for schema-derived values (`TASK`, `PHASE`, `ATTEMPT`, `CHANGE`, `WORKING DIRECTORY`).
4. **Prompt** — tell the worker how to map packet values into the tool payload before exit.
5. **Transport lane** — classify `worker` vs `scanner`.
   - `worker`: persisted typed report; call `adv_subagent_report_submit`.
   - `scanner`: analysis JSON only; no `adv_subagent_report_submit`, no `task.subagent_reports[]`.
6. **Tests** — add RED/GREEN asset, preflight, or schema tests tying required fields/policies to packet, prompt, and registry behavior.
7. **Specs** — update `.adv/specs/*` when the contract is capability law.

## Hard Rule

If required fields such as `task_id`, `phase`, or `attempt` are missing, fix the packet/prompt/tests. If placeholders reach an agent-callable tool boundary, fix `FIELD_POLICIES`/preflight tests. Do not infer values heuristically, downgrade `INVALID_REPORT`, or accept blank audit/evidence fields.
