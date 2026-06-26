# Contract Traceability

**Change ID:** addAcWarrantGuard
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-06-25T14:52:36.219Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Catch moved to mint: contract-mint.ts throws CONTRACT_UNRESOLVED_WARRANT before persistence; tool-registry.surface.test.ts proves live-surface rejection of a nonexistent surface. |
| SC2 | success_criterion | pass | review | adv-discover.md 'Reproduction Finding Classification' section + rq-acWarrant01 require broken_capability|unwarranted_operation|unverified tagging; ac-warrant-guard-assets.test.ts asserts presence. |
| SC3 | success_criterion | pass | review | Proportionality: behavioral criteria with no warrant tag mint unchanged (contract-mint.test.ts AC3 test). |
| AC1 | acceptance_criterion | pass | test | contract-mint.test.ts AC1 + tool-registry.surface.test.ts: tool:adv_change_archive#target_path → CONTRACT_UNRESOLVED_WARRANT fail-fast. |
| AC2 | acceptance_criterion | pass | test | contract-mint.test.ts AC2 + surface test: tool:adv_change_status_repair#target_path resolves; item.warrants recorded; [warrant:] tag stripped. |
| AC3 | acceptance_criterion | pass | test | contract-mint.test.ts: behavioral criteria with no warrant tag mint unchanged (no lookup needed). |
| AC4 | acceptance_criterion | pass | test | ac-warrant-guard-assets.test.ts: adv-discover.md classification + forbid-unwarranted-seeding + warrant-declaration assertions pass (6/6). |
| AC5 | acceptance_criterion | pass | test | ac-warrant-guard-assets.test.ts: advance-workflow spec.json contains rq-acWarrant01 with body + scenarios (incl. CONTRACT_UNRESOLVED_WARRANT, unwarranted_operation). |
| AC6 | acceptance_criterion | pass | test | fixStaleCloseVisibility contract.items AC6 readback confirms status-repair cross-project routing only + adv_change_archive no-target_path-by-design rationale; reviewer confirmed. |
| AC7 | acceptance_criterion | pass | test | pnpm run check PASS (schemas/typecheck/isolation/lockfile/lint/format); affected suites green incl. spec-citation-invariant and discover-asset suites; reviewer reran clean. |
| C1 | constraint | respected | static_check | All edits in worktree change/addAcWarrantGuard; no deployed runtime artifact edits; git status clean. |
| C2 | constraint | respected | static_check | Warrant verified structurally via live getToolSurface() lookup, not prose heuristic (P33). |
| C3 | constraint | respected | static_check | Proportional: only capability-presuming criteria carry warrants; behavioral untouched (AC3). |
| C4 | constraint | respected | static_check | Existing warrant-less agreements still mint (AC3); new rq-acWarrant01 additive, no spec contradiction. |
| C5 | constraint | respected | static_check | No heuristic NLP inference of presumed capability; only declared warrants verified. |
| DONT1 | avoidance | respected | review | Failed repro != requirement: classification rule + warrant-declaration enforce this. |
| DONT2 | avoidance | respected | review | Hedge not hardened: unverified classification blocks seeding must-work criteria. |
| DONT3 | avoidance | respected | review | Design validator not sole catch: mint-time structural check + discovery classification layers added. |
| DONT4 | avoidance | respected | review | No warrant ceremony on behavioral criteria (C3 + AC3 proportionality test). |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-08ed7b8aee47 | AC1, AC2, AC3, SC1, SC3 |  | C2, C3, C5, DONT4 |  |
| tk-f8130f25fee5 | AC1, AC2, SC1 |  | C2 |  |
| tk-ab385375bda3 | AC4, AC5, SC2 |  | DONT1, DONT2, DONT3 |  |
| tk-8ec73d25e071 | AC6 |  |  | ADV artifact correction (agreement text + contract re-mint), not code; verified by contract readback. |
| tk-5bf126b4f829 |  | AC7 | C1 |  |
