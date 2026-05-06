# Migration Dry-Run Report — Signal-Driven Architecture Cutover

**Date:** 2026-05-06
**Change:** `refactorChangeWorkflowsSignal`
**Task:** T26 (M5)
**Script:** `plugin/scripts/migrate-to-signal-architecture.ts --dry-run`
**Project ID:** `bdf259aa162ae192af5b18899ccdc653b085528d`

## Result

PASS — all 8 active changes (7 listed in T26 plus `refactorChangeWorkflowsSignal` itself) load successfully and produce well-formed signal replay plans. No errors, no schema mismatches, no missing fields surfaced.

## Per-change replay plan summary

| Change ID                          | Plan Steps | Signal Steps | Marker Steps |
| ---------------------------------- | ---------: | -----------: | -----------: |
| `addagentmeshandinrepoarchive`     |         34 |           23 |           11 |
| `cleanupzombierunningworkflows`    |         13 |            2 |           11 |
| `makeAdvTaskEvidenceFallback`      |         29 |           18 |           11 |
| `reconcilechangelistsourcesoftr`   |         13 |            2 |           11 |
| `reconcilesessionlistwithdiagno`   |         13 |            2 |           11 |
| `refactorChangeWorkflowsSignal`    |         98 |           87 |           11 |
| `removeBunTypesMainTsconfig`       |         23 |           12 |           11 |
| `singleworkerperprojectpolicy`     |         13 |            2 |           11 |

Total: 8 changes, 236 plan steps (158 signal + 88 marker).

Marker steps are constant at 11 per change (docs / tasks / 7 gates / wisdom / final), as expected from `buildMigrationReplayPlan`.

## Acceptable losses (per `migration-replay.ts` ACCEPTABLE_LOSSES)

- Per-phase TDD evidence text folded into verification placeholders.
- Per-attempt `error_recovery` on completed/cancelled tasks not replayed as workflow history.
- v1 workflow event history is not represented in the signal-state model.
- `seenIdempotencyKeys` intentionally dropped.

## Mismatch handling

No mismatches surfaced. T27 (execute) may proceed when scheduled.

## Next steps

- T27: Execute migration with `--execute` after worker restart so each change starts fresh in the signal-driven workflow with `TERMINATE_EXISTING` policy.
- T28: Delete migration tooling post-execution (script, change-import, migrate-cleanup, marker signal/query).
