# Agreement — fixToolDriftCaptureFollowUps

## Objectives

1. Eliminate the 2 tool drift warnings flagged by `deploy-local.sh --fix` for `adv_subagent_report_submit`.
2. Capture the 4 explicit OOS follow-ups from `removePositionalArtifactApi` as agenda items so they remain visible.
3. Capture 5 durable wisdom entries (patterns + gotchas) from the just-archived change.

## Acceptance Criteria

- **AC1.** `adv_subagent_report_submit: true` present in `.opencode/agents/adv.md` tools block.
- **AC2.** `adv_subagent_report_submit: true` present in `.opencode/agents/adv-atc.md` tools block.
- **AC3.** `./scripts/deploy-local.sh --check` returns zero tool drift warnings naming `adv_subagent_report_submit`.
- **AC4.** 4 new agenda items present in `adv_agenda_list`, one per OOS follow-up.
- **AC5.** 5 wisdom entries present (3 patterns + 2 gotchas) attached to this change.
- **AC6.** `pnpm test` passes (allowlist additions are config-only — no behavior change).

## Constraints

- **C1.** No source code changes outside `.opencode/agents/*.md` allowlists.
- **C2.** Use existing agenda categories (`feature`, `bugfix`, `refactor`, `tests`) — no schema additions.
- **C3.** Wisdom entries are durable learnings about Temporal/ADV patterns; not change-specific summaries.
- **C4.** Worktree isolation (P32) — all edits run from the per-change worktree.

## Avoidances

- **A1.** Don't actually implement any of the captured follow-ups in this change — just capture.
- **A2.** Don't modify the canonical `ADV_INSTRUCTIONS.md` or `AGENTS.md` — agenda items don't need policy docs.
- **A3.** Don't add new tools to the registry — just allowlist existing ones.
