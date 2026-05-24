# Agreement

## Objectives

- Remove false-positive drift warning for `adv_subagent_report_submit` on primary agents.
- Keep `adv_subagent_report_submit` available to leaf subagents that submit reports.
- Preserve strict drift detection for tools primary agents should expose.

## Acceptance Criteria

- AC1: `./scripts/deploy-local.sh --check` treats `adv_subagent_report_submit` as not required for `adv.md` and `adv-atc.md`.
- AC2: The fix does not add `adv_subagent_report_submit` to primary agent allowlists.
- AC3: Existing subagent assets still require/expose `adv_subagent_report_submit` for `adv-engineer` and `adv-reviewer`.
- AC4: Tests cover the role-aware drift validation behavior.

## Constraints

- C1: Do not weaken drift validation for ordinary primary-agent ADV tools.
- C2: Keep validation structural and deterministic, not prose-only.

## Avoidances

- DONT1: Do not solve by adding leaf-only submit capability to primary agents.
- DONT2: Do not disable tool drift validation globally.

## Sign-Off

Approved by user reply: `fix` after diagnosis that the warning is validator overreach.