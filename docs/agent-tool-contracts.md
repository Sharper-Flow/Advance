# Agent-Callable Tool Contracts

Use this checklist when ADV changes create or modify a sub-agent, command packet, or tool-call report path. Goal: schema, context packet, prompt instructions, specs, and tests change together.

## Contract Surfaces

| Surface             | Owns                                             | Required checks                                                                                                                     |
| ------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Schema              | Zod/type parser for tool input or report payload | Required fields are explicit; malformed input returns structural errors such as `INVALID_REPORT`                                    |
| Context packet      | Command text passed to worker                    | Packet exposes every schema-derived identity field the worker must submit, plus scope/done/stop/verification anchors for owned work |
| Prompt instructions | Agent file or sub-agent prompt                   | Worker is told how to map packet anchors into the tool payload and how to report scope drift / orchestrator actions structurally    |
| Transport           | Tool call vs scanner output                      | Typed workers call the tool; scanners return analysis JSON for orchestrator consumption                                             |
| Tests               | Asset/schema tests                               | Tests fail when schema-required fields are absent from packets or prompts                                                           |
| Specs               | `.adv/specs/*`                                   | Capability law pins packet/report distinctions that must not drift                                                                  |

## Required Checklist

Before shipping an agent-callable tool or sub-agent report contract:

1. **Schema:** identify required payload fields. For reports, preserve strict ingest; do not infer missing `change_id`, `task_id`, `phase`, `attempt`, `scope`, or `workdir_used` heuristically.
2. **Packet anchors:** add first-class packet fields for each required identity value.
   - `TASK` → `task_id`
   - `PHASE` → reviewer `phase`
   - `ATTEMPT` → report dedupe key and retry audit
   - `CHANGE` / `WORKING DIRECTORY` → scope and worktree grounding
   - `SCOPE KEY` → change-scoped optimized handoff reports (`adv-researcher`, `adv-tron`, orchestrator-submitted scanner bundles)
3. **Scope anchors:** add warn-first rollout anchors for bounded work:
   - `TASK_SCOPE`, `IN_SCOPE`, `OUT_OF_SCOPE`
   - `DONE_WHEN`, `STOP_WHEN`, `VERIFICATION`
4. **Prompt mapping:** update worker guidance so the agent copies packet values into the tool payload before exit and reports `scope_drift` plus `required_main_agent_actions` instead of hiding drift in prose.
5. **Transport lane:** classify the lane.
   - `worker`: typed persisted worker; must call `adv_subagent_report_submit`.
   - `optimized handoff`: typed persisted change-scoped worker (`adv-researcher`, `adv-tron`) with `scope.kind: "change"` and a structural `scope_key`.
   - `scanner`: non-persisted analysis worker; must not call `adv_subagent_report_submit` or write `task.subagent_reports[]`. Only the orchestrator may submit an `adv-scanner-bundle` synthesis.
6. **Tests:** add RED/GREEN asset or schema tests proving the packet and prompt contain required identity anchors and warn-first scope anchors.
7. **Specs/docs:** update the owning spec when the behavior is capability law, not incidental prose.

## ADV Report Contract Example

`adv-engineer` typed worker packet:

```text
WORKING DIRECTORY: {workdir}
CHANGE: {change-id} | {title}
TASK: {task-id} | {task-title}
ATTEMPT: {attempt-number}
TASK_SCOPE: {one-line implementation objective}
IN_SCOPE:
  - {owned files/findings/contract refs}
OUT_OF_SCOPE:
  - {boundaries, DONT/OOS refs, unrelated subsystems}
DONE_WHEN:
  - {task acceptance condition}
STOP_WHEN:
  - contract/security/release blocker, unsafe edit, or impossible verification
VERIFICATION:
  required_when_possible:
    - {task-specific test/lint/typecheck command}
  optional_additional_checks: true
EXPECTED OUTPUT: call adv_subagent_report_submit with ENGINEER_REPORT
```

`adv-reviewer` remediation packet adds `PHASE`:

```text
WORKING DIRECTORY: {workdir}
CHANGE: {change-id} | {title} | gate: review|release
TASK: {task-id} | {task-title}
PHASE: review|harden
ATTEMPT: {attempt-number}
TASK_SCOPE: scoped review or harden remediation
IN_SCOPE:
  - {finding-id}: {file}:{line} and directly affected local subsystem
OUT_OF_SCOPE:
  - unrelated findings, new features, agreement changes without orchestrator re-entry
DONE_WHEN:
  - listed finding(s) fixed or reported as blocked with evidence
STOP_WHEN:
  - contract/security/release blocker, scope conflict, unsafe edit, or impossible verification
VERIFICATION:
  required_when_possible:
    - {targeted test/lint/static check for fixed finding(s)}
  optional_additional_checks: true
EXPECTED OUTPUT: call adv_subagent_report_submit with REVIEWER_REPORT
```

Change-scoped optimized handoff packets add `SCOPE KEY` instead of `TASK`; examples include `researcher:design-validation`, `researcher:discovery-opportunity-scout`, and `tron:{target-slug}`. These workers submit typed change-scoped reports.

Review/harden `explore` scanners stay scanner lanes: they may receive `WORKING DIRECTORY`, `CHANGE`, and `ATTEMPT`, but return dimension-specific analysis JSON to the orchestrator instead of persisted reports. After synthesis, the orchestrator may submit one `adv-scanner-bundle` report with `SCOPE KEY: scanner-bundle:{review|harden}`.

## Recurrence Guard

If schema-required fields are missing from context packets or prompts, fix the contract instead of weakening the schema. Strict ingest returning `INVALID_REPORT` is correct; missing context is the bug. Missing scope/done/stop/verification anchors are warn-first rollout defects until the owning specs and asset tests promote them to stricter enforcement.
