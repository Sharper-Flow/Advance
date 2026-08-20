## Problem

`adv status --json` reports active changes that do not exist as valid canonical records, and every downstream consumer inherits the error.

Measured in the toolbox project (`3f9f88dbc6c65a2463945f1cfda1fc59794f411d`) on 2026-08-19:

- `adv status --json` run from `/home/jon/toolbox` returns **10** active changes.
- The ADV plugin store API returns **7**.
- `zellij-project-launcher --adv-changes /home/jon/toolbox` renders exactly the CLI's 10 rows — byte-for-byte the same set. The launcher is a faithful renderer; it is not the defect.

The 4 extra rows are `noteConcordStageInventory`, `diagnoseTailnetLag`, `addAdvResumeShortcut`, `addProviderToolSearch`.

## Impact

Operators pick work from these rows. A ghost row is unopenable work that consumes attention on every launcher invocation, and it is indistinguishable from real work in the picker. The count is also wrong everywhere it is quoted, so "how much is in flight" cannot be answered from the CLI.

This is not self-healing. Each of the four has persisted for weeks — the oldest quarantine event is dated 2026-08-02.

## Scope of the divergence

Not one bug with one cause. Four different canonical-record failures, one shared consequence:

| change | canonical record state |
|---|---|
| `diagnoseTailnetLag` | legacy flat file `changes/diagnoseTailnetLag.json`; no `changes/<id>/change.json` directory |
| `addAdvResumeShortcut` | same legacy flat shape |
| `noteConcordStageInventory` | quarantined 2026-08-02T00:54:19Z for `schema_error`, still under `.adv/quarantine/changes/` |
| `addProviderToolSearch` | `changes/<id>/change.json` present but fails `ChangeSchema.parse` — `subagent_reports[0].architecture_assessment` is 13791 chars against a 12000 lane bound |

In all four cases the summary shard under `summaries/<id>/` is intact and current.

## Not in scope

`removeRedundantMcp` was initially suspected of being wrongly hidden by the CLI. It is not. It is genuinely archived: all 7 gates done, phase9 done, PRs #198 and #200 merged, `releasedCommitSha` recorded. The CLI is correct to omit it. The plugin store's active-list still showing it is a separate stale-lifecycle defect tracked as toolbox backlog `bl-Ix9Sj6Hk`.
