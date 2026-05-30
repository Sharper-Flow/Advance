# Executive Summary — fixToolDriftCaptureFollowUps

## Outcome

Pre-existing tool drift fixed; `removePositionalArtifactApi` follow-ups captured as durable agenda + wisdom entries.

## What Was Built

- `.opencode/agents/adv.md` — `adv_subagent_report_submit: true` added to tools allowlist under new `# Sub-agent reports` section
- `.opencode/agents/adv-atc.md` — same addition
- 4 agenda items capturing OOS follow-ups from previous change:
  - `ag-Cvrxx_sV` — Migrate subagent reports from disk to Temporal (refactor, low)
  - `ag-QOzsyfa1` — Stale-file cleanup of orphaned disk markdown (refactor, low)
  - `ag-c6qUjqyK` — Project-level state migration evaluation (feature, backlog)
  - `ag-s5YBZdCR` — Per-session XDG wrapper script (feature, low)
- 5 wisdom entries:
  - `ws-N8RANu` (pattern) — State-mutation rejection over throw in Temporal signal handlers
  - `ws-sUIrsT` (pattern) — Compile-time invariant locks via const-true type assertion
  - `ws-Xq5md5` (convention) — Explicit ordered arrays over Object.entries() for determinism
  - `ws-L3D2Jb` (gotcha) — TS interface overloads require impl satisfaction at compile time
  - `ws-4BexSl` (gotcha) — mockResolvedValueOnce breaks silently when migrations add earlier callers

## What Was Verified

- Worktree `grep` confirms both files carry the new allowlist line
- Asset tests pass (22 files / 299 tests)
- `pnpm run check` clean (typecheck + lint + format)
- 5 task checkpoints committed on `change/fixToolDriftCaptureFollowUps`

## Notes

- Wisdom entry content has cosmetic XML-tag noise from a `<parameter>` syntax error during creation — learning content is intact and discoverable. The `promote: true` flag was misparsed in the same syntax error, so entries are scoped to this change only. If cross-change visibility is desired, a follow-up can re-add cleaner versions.
- `deploy-local.sh --check` still reports drift until the deployed runtime copy at `/home/jon/.local/share/Advance/` is refreshed via `deploy-local.sh --fix` after CMPR.

## Remaining Concerns

None blocking. The deploy-local re-sync is the standard post-archive step.
