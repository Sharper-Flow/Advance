# Archive: Add epic list CLI

**Change ID:** addEpicListCli
**Archived:** 2026-06-26T04:54:42.900Z
**Created:** 2026-06-26T03:18:57.239Z

## Tasks Completed

- ✅ Add Epic CLI spec law and docs surface
  > Added rq-epicCliList01 to advance-epics spec and mirror docs, bumped spec version/date, and documented `bin/adv epic list --json` in AGENTS.md/SETUP.md. Requirement pins read-only, worker-free, fail-closed Temporal Visibility Epic list JSON behavior and no-mutation namespace constraints.
- ✅ Implement Epic list CLI helper with unit tests
  > Added `bin/lib/epic-list.ts` with stable live/failure payload builders, `listEpicIdsFromVisibility`, and `loadLiveEpicIds` using `createTemporalClientBundle`, `listEpicWorkflowIds`, bounded timeout, and connection close in finally. Added Bun tests for payload shape, fail-closed metadata, project-prefix filtering, and Visibility-list failure behavior.
- ✅ Wire `adv epic list --json` dispatcher and help
  > Updated `bin/adv` to dispatch read-only nested `epic list --json`, require JSON mode, emit fail-closed JSON for non-git and Temporal/list failures, return live success payload through `bin/lib/epic-list`, and update help/exit-code text. Added Bun dispatcher tests for help, live JSON success, non-JSON usage, unknown nested commands, and non-git fail-closed JSON.
- ✅ Add structural read-only guard for Epic CLI namespace
  > Added an explicit `EPIC_READ_ONLY_SUBCOMMANDS` allowlist in `bin/adv` and expanded `plugin/src/cli-bridge-contract.test.ts` with a guard proving the Epic CLI namespace only allows read-only list dispatch, uses `listEpicWorkflowIds`, and avoids per-Epic `getHandle` queries or file reads.
- ✅ Run integrated CLI Epic list verification
  > Task checkpoint completed

## Specs Modified


## Wisdom Accumulated

- **[pattern]** When adding a nested read-only CLI namespace, pair dispatcher support with an explicit allowlist constant and a static cli-bridge-contract test that forbids mutation verbs and checks the helper uses Visibility/list APIs rather than workflow handle queries or file reads.
