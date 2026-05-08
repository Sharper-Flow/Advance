# Archive: Caveman-compress ADV instruction surfaces

**Change ID:** cavemanCompressAdvInstruction
**Archived:** 2026-05-08T19:50:37.088Z
**Created:** 2026-05-08T19:19:00.635Z

## Tasks Completed

- ✅ T1 — Document caveman/terse composition in `docs/command-voice-standard.md`: add concise rules showing terse/caveman-lite as wording-density layer over existing prose-load reduction templates; preserve exact contract-token exceptions. Verification: targeted asset test or existing docs assertion covers new rule.
  > Added `### Terse/caveman-lite composition` to command voice standard and asset test asserting composition wording and exact contract-token preservation.
- ✅ T2 — Add phrase-preservation and compression-guard tests for `ADV_INSTRUCTIONS.md`: assert critical safety/workflow tokens survive compression and composition docs exist; avoid brittle prose snapshots. Verification: tests fail before docs/compression where possible, pass after.
  > Added `ADV_INSTRUCTIONS.md compression guards` asset test and matching `### Instruction Compression Guard` text preserving exact contract tokens through compression.
- ✅ T3 — Compress `ADV_INSTRUCTIONS.md` using approved design: tables/fragments over paragraphs; remove duplication; keep exact tool names, gates, statuses, commands, `MUST`/`NEVER`, approval boundaries, cancellation/archive clarity, JSON/code examples. Verification: focused asset tests pass and line count decreases under guard.
  > Compressed `ADV_INSTRUCTIONS.md` from 953 to 868 lines by reducing sub-agent, skill, command/skill boundary, and worktree sections into tables/fragments while preserving tested contract tokens and safety wording.
- ✅ T4 — Update post-compression budget/sync artifacts and verify: adjust `.opencode/token-budgets.json` baseline to new `ADV_INSTRUCTIONS.md` line count if reduced, run focused tests, run `./scripts/sync-global.sh --fix`, then `./scripts/sync-global.sh --check`. Verification: all commands pass; no runtime code/schema/state changes.
  > Task checkpoint completed

## Specs Modified


## Wisdom Accumulated

- **[gotcha]** `scripts/sync-global.sh --fix/--check` reports canonical primary checkout path for ADV_INSTRUCTIONS.md prompt scoping even when invoked from an ADV worktree. Worktree-local instruction edits are not loaded into live global provider prompts until merge/archive sync + OpenCode restart.
