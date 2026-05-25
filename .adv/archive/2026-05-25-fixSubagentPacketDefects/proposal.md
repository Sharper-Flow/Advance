# Fix subagent packet defects

## Why

A spawned `adv-reviewer` asked the user via the `question` tool for missing ADV Context Packet fields: `TASK` id and `ATTEMPT` number. These are orchestrator-owned fields. Users must never be asked to supply packet identity values for sub-agent reports.

## What Changes

- Make the top-level ADV sub-agent policy explicit: typed worker prompts must include `WORKING DIRECTORY`, `CHANGE`, `TASK`, `ATTEMPT`; `adv-reviewer` typed worker prompts also include `PHASE`.
- Add failure-handling policy: if a typed worker reports missing packet identity fields, the orchestrator must retry with a corrected packet or continue inline; it must not surface the worker's `question` to the user.
- Update `adv-reviewer` / `adv-engineer` prompts so missing packet fields produce a structured packet-defect failure to the orchestrator, not a user-facing question.
- Add asset tests to catch recurrence.

## Success Criteria

- No ADV leaf worker prompt tells a sub-agent to ask the user/orchestrator via `question` for missing packet identity fields.
- Top-level ADV prompt owns `TASK`, `PHASE`, `ATTEMPT`, and `WORKING DIRECTORY` packet defects as internal orchestration defects.
- Focused asset tests and `pnpm run check` pass.

## Scope

Instruction/prompt/test guardrail fix only. No schema weakening. No delegation redesign.