# Design — fixToolDriftCaptureFollowUps

Trivial config + state-capture change. No code logic. Two surgical edits, six ADV state mutations.

## Implementation

1. Edit `.opencode/agents/adv.md` — add `adv_subagent_report_submit: true` under the `# Tasks` block neighbors (alphabetical to existing `adv_run_test`).
2. Edit `.opencode/agents/adv-atc.md` — same addition in matching position.
3. Add 4 agenda items via `adv_agenda_add`.
4. Add 5 wisdom entries via `adv_wisdom_add`.
5. Run `pnpm test`, `./scripts/deploy-local.sh --check`.

## No design dimensions needed

- No architecture decisions
- No type/schema changes
- No new modules
- No replay-safety considerations
- No HITL tradeoffs
