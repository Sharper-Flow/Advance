# Archive Briefing Digest

**Change ID:** fixEpicTerminalProjection
**Title:** Fix epic terminal projection
**Status:** archived
**Generated:** 2026-07-10T06:47:08.830Z

## Identity Anchors

- CHANGE
- STATUS
- TERMINAL_GATE_SUMMARY
- Origin: adhoc

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

Showing 11 of 11 durable facts.

- **[archive_only_evidence]** sources: advance-epics spec rq-epicTerminalChildProjection01: Requires terminal child projection to move terminal_summary {status, completed_at} AND membership_status=terminal together, with no projection_missing/projection_stale/repair-needed markers. Scoped in prose to adv_epic_link_change; design generalizes the same invariant to the reducer as a superset.
- **[archive_only_evidence]** sources: epic-state.ts reducer applyEntryTerminalSummaryToState: Reducer currently writes only entry.terminal_summary and leaves membership_status untouched. Confirms the typed-state seam the design fixes.
- **[archive_only_evidence]** sources: epic.ts memberStatusForEntry renderer: Renderer treats membership_status linked|terminal as ok; other values fall to stale/target_unreachable/projection_missing. Renderer already uses membership_status as source of truth; no display override needed (KD1/DDC2).
- **[archive_only_evidence]** sources: epic.ts direct terminal link path: Direct archived/closed link calls setEntryTerminalSummary then setEntryMembershipStatus(terminal). Confirms KD3 redundancy claim after reducer normalization.
- **[archive_only_evidence]** sources: epic-state.ts membership reducer default: Membership reducer sets membership_status directly (547) and retarget default projection_pending (563-564). Confirms projection_pending is a real non-terminal starting state for DDC3 test coverage.
- **[archive_only_evidence]** sources: archive-gate.ts archive fan-out: Archive fan-out calls only setEntryTerminalSummary and preserves an explicit warning path on failure. Confirms both the summary-only seam and that KD2 explicit-failure behavior already exists and must be preserved.
- **[archive_only_evidence]** architecture_assessment: Design makes correctness structural at the Temporal reducer boundary (applyEntryTerminalSummaryToState), the canonical fix for an invariant that must hold across many callers. Source evidence confirms the split the design describes: reducer writes only terminal_summary (epic-state.ts:687-690) while the direct-link tool path additionally sets membership_status=terminal (epic.ts:391-402), and summary-only callers (archive-gate.ts:516-520, plus epic.ts:2997/3193) leave membership stale. Spec rq-epicTerminalChildProjection01 (spec.json:1142-1178) requires the two fields to move together; reducer enforcement means every present and future caller inherits the invariant, aligning with P33 (structural before heuristic) and repo convention that per-change/entry workflow state is source of truth. The renderer already keys on membership_status (epic.ts:112-141), so no display-only override is introduced, satisfying the agreement avoidance against masking drift. Explicit failure/warning paths (KD2) already exist at the tool/archive layer and are preserved. Spec-scope nuance: the prose invariant is written against adv_epic_link_change specifically; the design correctly generalizes it as a reducer-level superset rather than narrowing or contradicting it — no spec law is violated. One implementation note: the current reducer records idempotency AFTER the write (epic-state.ts:693), so adding membership_status=terminal in the same mutation block is replay-safe (DDC4).
- **[wisdom_candidate]** wisdom_candidates: [pattern] For Epic terminal projections, report-level repair success should check the typed membership_status value directly; derived display helpers may intentionally collapse multiple states into OK and can mask terminal-state inconsistencies.
- **[archive_only_evidence]** changes_made: plugin/src/tools/epic.ts: Tightened terminal projection consistency output so repaired:true requires typed membership_status === "terminal"; linked/other display-OK states now return repaired:false with warning.
- **[archive_only_evidence]** changes_made: plugin/src/tools/epic.test.ts: Added regression coverage for a terminal-summary repair response that still returns membership_status:"linked", proving display OK is not enough for repaired:true.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/temporal/epic-state.test.ts src/tools/epic.test.ts, pnpm run format:check, pnpm run typecheck results=pass — Targeted tests passed: 2 files, 138 tests. Prettier format check passed. TypeScript typecheck completed with exit code 0.

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| SC1 | success_criterion | pass |
| SC2 | success_criterion | pass |
| SC3 | success_criterion | pass |
| AC1 | acceptance_criterion | pass |
| AC2 | acceptance_criterion | pass |
| AC3 | acceptance_criterion | pass |
| AC4 | acceptance_criterion | pass |
| AC5 | acceptance_criterion | pass |
| AC6 | acceptance_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| C4 | constraint | respected |
| C5 | constraint | respected |
| C6 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |
| DONT4 | avoidance | respected |
| DONT5 | avoidance | respected |
| DONT6 | avoidance | respected |
| DONT7 | avoidance | respected |
| OOS1 | out_of_scope | respected |
| OOS2 | out_of_scope | respected |
| OOS3 | out_of_scope | respected |
| OOS4 | out_of_scope | respected |
| OOS5 | out_of_scope | respected |
| OOS6 | out_of_scope | respected |

## Unresolved Actions

None
