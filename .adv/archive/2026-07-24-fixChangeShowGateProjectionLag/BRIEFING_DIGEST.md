# Archive Briefing Digest

**Change ID:** fixChangeShowGateProjectionLag
**Title:** Fix change-show gate projection lag
**Status:** archived
**Generated:** 2026-07-24T19:34:00.415Z

## Identity Anchors

- CHANGE
- STATUS
- TERMINAL_GATE_SUMMARY

## Archive Digest

**Status:** archived

| Gate | Status |
| --- | --- |
| proposal | done |
| discovery | done |
| design | done |
| planning | done |
| execution | done |
| acceptance | done |
| release | pending |

## Epic Context

No Epic membership

## Durable Facts

Showing 7 of 7 durable facts.

- **[archive_only_evidence]** decisions: Invalidate the change cache after every confirmed planning-gate completion. — The refresh readback can cache a stale pre-signal snapshot; universal invalidation makes subsequent reads fetch durable gate state.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/gate.test.ts (1) — RED: regression test failed before the implementation; cached planning gate remained pending.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/gate.test.ts (0) — GREEN: 63 gate-tool tests passed after unconditional invalidation.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/gate.test.ts (0) — VERIFY: final regression test and all 63 gate-tool tests passed.
- **[archive_only_evidence]** decisions: Added cache invalidation to the standard non-planning completion path. — The AC2 discovery-gate readback test exposed that only the planning completion path invalidated a re-poisoned cache.
- **[archive_only_evidence]** decisions: Did not alter archive status transition invalidation. — Temporal changes.save already invalidates before archived-status save and refreshes its cache from terminal workflow state.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/change.test.ts src/tools/worktree/index-delete.test.ts (0) — Passed: 2 test files, 198 tests.

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| AC1 | acceptance_criterion | pass |
| AC2 | acceptance_criterion | pass |
| AC3 | acceptance_criterion | pass |
| AC4 | acceptance_criterion | pass |
| AC5 | acceptance_criterion | pass |
| AC6 | acceptance_criterion | pass |
| SC1 | success_criterion | pass |
| SC2 | success_criterion | pass |
| SC3 | success_criterion | pass |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |
| DONT4 | avoidance | respected |

## Unresolved Actions

None
