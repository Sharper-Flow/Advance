# Agent-Callable Tool Contracts

Use this checklist when ADV changes create or modify a sub-agent, command packet, or tool-call report path. Goal: schema, context packet, prompt instructions, specs, and tests change together.

## Contract Surfaces

| Surface | Owns | Required checks |
|---|---|---|
| Schema | Zod/type parser for tool input or report payload | Required fields are explicit; malformed input returns structural errors such as `INVALID_REPORT` |
| Context packet | Command text passed to worker | Packet exposes every schema-derived identity field the worker must submit |
| Prompt instructions | Agent file or sub-agent prompt | Worker is told how to map packet anchors into the tool payload |
| Transport | Tool call vs scanner output | Typed workers call the tool; scanners return analysis JSON for orchestrator consumption |
| Tests | Asset/schema tests | Tests fail when schema-required fields are absent from packets or prompts |
| Specs | `.adv/specs/*` | Capability law pins packet/report distinctions that must not drift |

## Required Checklist

Before shipping an agent-callable tool or sub-agent report contract:

1. **Schema:** identify required payload fields. For reports, preserve strict ingest; do not infer missing `task_id`, `phase`, or `attempt` heuristically.
2. **Packet anchors:** add first-class packet fields for each required identity value.
   - `TASK` → `task_id`
   - `PHASE` → reviewer `phase`
   - `ATTEMPT` → report dedupe key and retry audit
   - `CHANGE` / `WORKING DIRECTORY` → scope and worktree grounding
3. **Prompt mapping:** update worker guidance so the agent copies packet values into the tool payload before exit.
4. **Transport lane:** classify the lane.
   - `worker`: typed persisted worker; must call `adv_subagent_report_submit`.
   - `scanner`: non-persisted analysis worker; must not call `adv_subagent_report_submit` or write `task.subagent_reports[]`.
5. **Tests:** add RED/GREEN asset or schema tests proving the packet and prompt contain required anchors.
6. **Specs/docs:** update the owning spec when the behavior is capability law, not incidental prose.

## ADV Report Contract Example

`adv-engineer` typed worker packet:

```text
WORKING DIRECTORY: {workdir}
CHANGE: {change-id} | {title}
TASK: {task-id} | {task-title}
ATTEMPT: {attempt-number}
EXPECTED OUTPUT: call adv_subagent_report_submit with ENGINEER_REPORT
```

`adv-reviewer` remediation packet adds `PHASE`:

```text
WORKING DIRECTORY: {workdir}
CHANGE: {change-id} | {title} | gate: review|release
TASK: {task-id} | {task-title}
PHASE: review|harden
ATTEMPT: {attempt-number}
EXPECTED OUTPUT: call adv_subagent_report_submit with REVIEWER_REPORT
```

Review/harden `explore` scanners stay scanner lanes: they may receive `WORKING DIRECTORY`, `CHANGE`, and `ATTEMPT`, but return dimension-specific analysis JSON to the orchestrator instead of persisted reports.

## Recurrence Guard

If schema-required fields are missing from context packets or prompts, fix the contract instead of weakening the schema. Strict ingest returning `INVALID_REPORT` is correct; missing context is the bug.
