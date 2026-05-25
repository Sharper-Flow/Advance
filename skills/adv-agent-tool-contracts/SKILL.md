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

Load when creating or modifying ADV sub-agents, command packets, typed report schemas, or any agent-callable tool contract.

Canonical doc: `docs/agent-tool-contracts.md`.

## Checklist

1. **Schema** — identify required Zod/tool fields. Do not weaken strict ingest to compensate for missing context.
2. **Context packet** — add explicit anchors for schema-derived values (`TASK`, `PHASE`, `ATTEMPT`, `CHANGE`, `WORKING DIRECTORY`).
3. **Prompt** — tell the worker how to map packet values into the tool payload before exit.
4. **Transport lane** — classify `worker` vs `scanner`.
   - `worker`: persisted typed report; call `adv_subagent_report_submit`.
   - `scanner`: analysis JSON only; no `adv_subagent_report_submit`, no `task.subagent_reports[]`.
5. **Tests** — add RED/GREEN asset or schema tests tying schema fields to packet and prompt anchors.
6. **Specs** — update `.adv/specs/*` when the contract is capability law.

## Hard Rule

If required fields such as `task_id`, `phase`, or `attempt` are missing, fix the packet/prompt/tests. Do not infer them heuristically and do not downgrade `INVALID_REPORT` validation.
