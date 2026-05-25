# Design

## Approach

Small instruction-contract hardening.

1. Update top-level `.opencode/agents/adv.md` Sub-Agent Policy:
   - Required typed worker packet anchors.
   - Orchestrator-owned identity fields.
   - Missing packet identity fields are internal defects, not user questions.
2. Update leaf workers:
   - `adv-reviewer`: missing `TASK`, `PHASE`, `ATTEMPT`, or `WORKING DIRECTORY` yields structured packet-defect failure in final response / intended report payload for orchestrator recovery; no `question` call.
   - `adv-engineer`: same for `TASK`, `ATTEMPT`, `WORKING DIRECTORY`.
3. Update asset tests:
   - Assert top-level ADV policy contains orchestrator-owned packet field rule.
   - Assert leaf worker prompts do not contain `ask the orchestrator` / `question` guidance for missing packet identity fields.

## Verification

- Focused asset tests around ADV agent/worker prompt contracts.
- `pnpm run check`.