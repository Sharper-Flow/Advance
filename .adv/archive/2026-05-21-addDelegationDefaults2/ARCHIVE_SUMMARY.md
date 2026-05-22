# Archive: Establish delegation defaults

**Change ID:** addDelegationDefaults2
**Archived:** 2026-05-21T06:47:58.489Z
**Created:** 2026-05-21T00:30:47.221Z

## Tasks Completed

- ✅ Create delegation-defaults spec
  > Created .adv/specs/delegation-defaults/spec.json with 6 requirements mapping to AC1-AC6: matrix coverage, mode classification, agent/boundary spec, wide scan delegation, worker report fields, test coverage. 17 scenarios total.
- ✅ Create delegation-matrix coverage test
  > Created delegation-matrix.test.ts with 12 tests: 9-step coverage (rq-delDefaults01), valid mode enum (rq-delDefaults02), agent existence/boundaries (rq-delDefaults03), specific assignments matching design D2, phantom/primary exclusion, and cross-reference consistency with command contracts (rq-delDefaults06). Handles global agents (explore, general) vs repo-local agents.
- ✅ Extend phantom-subagent-roster test for primary agents
  > Extended phantom-subagent-roster.test.ts: added PRIMARIES constant (adv, plan, build, adv-atc), PrimaryFinding type, scanForPrimaries function with compound-name-safe regex, 11 new test cases across ACTIVE_SURFACES, pinned PRIMARIES list test. Fixed buildPatterns to use negative lookahead for compound names.
- ✅ Consolidate ADV_INSTRUCTIONS.md delegation guidance
  > Consolidated 4 scattered delegation sections in ADV_INSTRUCTIONS.md into single Delegation Defaults reference block. Replaced Sub-Agent Orchestration table, inline-only list, and redundant prose with spec reference + summary table. Kept delegation routing priority table (task-level) and agent roster table (factual inventory). Added rq-delDefaults01-04 citations. Updated inline-only list to include /adv-reflect.
- ✅ Verify all tests pass
  > Verified: pnpm run check passes (typecheck + lint + format all clean). 55 tests pass across all affected files. delegation-defaults spec (6 requirements) listed by adv_spec. No regressions in citation invariant or existing asset tests.

## Specs Modified


## Wisdom Accumulated

- **[pattern]** When a spec claims to be the single source of truth for a routing matrix, tests should parse the spec’s machine-readable matrix rather than duplicating the expected matrix as a fixture.
