# Archive: Add CLI command bridges

**Change ID:** addCliCommandBridges
**Archived:** 2026-06-06T19:12:40.364Z
**Created:** 2026-06-05T14:43:37.008Z

## Tasks Completed

- ✅ Extract shared bin/lib helpers + refactor `adv status` to use them
  > Task checkpoint completed
- ✅ Add advance-meta spec law: rq-roadmapCliBridge01
  > Task checkpoint completed
- ✅ Create git-tracked CLI surface matrix doc + coverage test (AC1/AC2)
  > Task checkpoint completed
- ✅ GATE_ORDER cross-boundary parity test
  > Task checkpoint completed
- ✅ Implement bin/lib/roadmap.ts core (snapshot read + freshness + filter/sort + render)
  > Task checkpoint completed
- ✅ Wire `adv roadmap` subcommand into bin/adv dispatcher
  > Task checkpoint completed
- ✅ Roadmap snapshot-shape + freshness parity test
  > Task checkpoint completed
- ✅ Parameterized bridge-contract asset-test harness + registry no-removal guard (RED)
  > Task checkpoint completed
- ✅ Convert /adv-roadmap default path to a thin CLI bridge (GREEN)
  > Task checkpoint completed
- ✅ Update status bridge spec law + asset tests for live-default status
  > Task checkpoint completed
- ✅ Implement live Temporal-backed `adv status` default
  > Task checkpoint completed
- ⏭️ Verify live status end-to-end and update release-facing docs/comments
- ✅ Add status-live guard/parity regression tests
  > Task checkpoint completed
- ✅ Verify live status end-to-end and update release-facing docs/comments
  > Task checkpoint completed

## Specs Modified


## Wisdom Accumulated

- **[pattern]** CLI-bridge testing split (Advance repo): bin/ is Bun-runtime and is NOT in plugin/tsconfig (rootDir:./src). Importing bin/lib/*.ts into a plugin/src vitest test breaks `pnpm run typecheck` (TS6059 file-not-under-rootDir). Pattern: (1) unit-test bin logic with Bun's runner — `bin/lib/*.test.ts` run via `bun test bin/`, wired as a dedicated CI step (Bun already installed in CI via oven-sh/setup-bun); (2) cross-boundary contract/parity/coverage tests live in plugin/src as vitest and read bin files as TEXT (readFileSync + regex), importing only in-tree plugin constants — exactly how plugin/src/adv-status-cli-assets.test.ts works. Never import bin/lib into plugin tests.
- **[convention]** New CLI slash-command bridges in Advance follow the rq-statusCliBridge01 template by construction: (a) command body is a pure shell-output bridge `!`adv <subcmd> --no-color`` with verbatim/no-analysis/no-recommendations instructions and ZERO adv_* MCP tool mentions; (b) any "use the MCP tool for X" pointer goes in the CLI's own stdout, never the command file (otherwise the no-fanout asset test flags it); (c) a cloned advance-meta spec rq-<cmd>CliBridge01 (.1 inject/.2 no-fanout/.3 no-MCP-fallback); (d) coverage added to the parameterized plugin/src/cli-bridge-contract.test.ts table; (e) a registry no-removal guard (frozen ADV_TOOL_NAMES) ensures additive CLI work never silently drops an agent tool.
