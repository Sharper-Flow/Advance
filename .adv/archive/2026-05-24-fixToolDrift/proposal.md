# Fix tool drift

## Problem

`./scripts/deploy-local.sh --check` reports `adv_subagent_report_submit` as missing from primary agent allowlists (`adv.md`, `adv-atc.md`). That warning is false-positive: the tool is intended for leaf subagents (`adv-engineer`, `adv-reviewer`) to submit typed reports, while primary orchestrators consume reports via change state.

## Proposed Direction

Make deploy-local tool-drift validation role-aware so primary agents are not required to allow leaf-only tools. Keep drift checks strict for tools each agent should actually expose.

## Success Criteria

- `deploy-local.sh --check` no longer reports `adv_subagent_report_submit` missing from `adv.md` or `adv-atc.md`.
- Subagent agents still expose `adv_subagent_report_submit` where required.
- Drift validation remains strict for real missing primary-agent tools.
- Tests cover the primary-agent exclusion/role-aware behavior.

## Scope

- `scripts/deploy-local.sh` drift validation.
- Existing deploy-local/asset tests near that script.

## Error Handling

If other real drift remains, `deploy-local.sh --check` must still fail and print the specific missing/extra tool names. If role-aware exclusion is misconfigured, tests should fail before deploy validation is trusted.

## Out of Scope

- Changing `adv_subagent_report_submit` tool semantics.
- Adding the submit tool to primary agent allowlists.
- Broad deploy script rewrite.