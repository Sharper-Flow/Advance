# Contract Traceability

**Change ID:** addTypedPhaseDirectives
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-08-04T21:08:17.407Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Directive arrives intact inside the phase-plan tool result (change.test.ts contentHash-completeness assertion) — the exact payload the OpenCode TUI renders as one collapsed entry. Live visual confirmation deferred to post-deploy per design + T7 reclassification; surfaced at acceptance checkpoint, no user objection. |
| SC2 | success_criterion | pass | review | Collapsed tool results are expandable in the TUI (discovery rendering evidence, sst/opencode sources + binary 1.18.13); directive content is complete in the result (47,324 chars verified vs sha256 hash). |
| SC3 | success_criterion | pass | review | Gate outcome unchanged: no workflow/gate mutation paths touched (assembler pure; replay-determinism 15/15 without patch marker). Acceptance review READY 0 findings. |
| SC4 | success_criterion | pass | review | Directive content is happy-path-only (registry holds only the entered-branch procedure); non-entered branch instructions are not emitted (AC2 identity behavior proven in phase-directive.test.ts). |
| AC1 | acceptance_criterion | pass | test | withPhaseDirective attaches PHASE_DIRECTIVES['adv-review'] when plan.kind==='actionable' && plan.command==='adv-review' (phase-directive.test.ts 9/9; change.test.ts attach integration, runId tr_msf4qex2_2df3c432). |
| AC2 | acceptance_criterion | pass | test | directive field exists only on ActionablePhasePlanSchema (structural exclusion); assembler returns identity for non-actionable variants (phase-directive.test.ts). Blocking reason still surfaced by plan. |
| AC3 | acceptance_criterion | pass | test | Launcher decision-table row: read error -> bounded retry x2 -> halt + surface failure (adv-review.md; anchor asserted in phase-directive-launcher.test.ts). |
| AC4 | acceptance_criterion | pass | test | Launcher decision-table row: fail-once-then-retry-success -> proceed normally (adv-review.md; anchor asserted in phase-directive-launcher.test.ts). |
| AC5 | acceptance_criterion | pass | test | phase-directive-launcher.test.ts AC5 strict-subset check: FALLBACK BEGIN/END-delimited inline fallback verified token-subset of directive content; drift fails the check. |
| AC6 | acceptance_criterion | pass | test | phase-directive-launcher.test.ts AC6 no-duplication check: launcher inspected for directive-supplied procedure; manual duplication rejected (directive-first concat order). |
| AC7 | acceptance_criterion | pass | test | Composed-surface helper readCommandSurface retargeted 10 pinned-invariant suites; all previously pinned phrases/fenced blocks still satisfied — 397/397 across 16 suites (runId tr_msf4qex2_2df3c432); matrix-uniqueness suite asserts directive content directly. |
| AC8 | acceptance_criterion | pass | test | Replay-determinism suite 15/15 unmodified; no PHASE_PLAN_VERSION bump, no wf.patched marker (runId tr_msf2gnl8). |
| C1 | constraint | respected | static_check | Branch diff review: no tool-registry additions, no new include flag (lean shaping consumes the existing include map). Zero new ADV tools. |
| C2 | constraint | respected | static_check | No PHASE_PLAN_VERSION bump, no wf.patched; replay suite 15/15 passes unmodified. |
| C3 | constraint | respected | static_check | phase-directive-content.ts is host-only; workflow-bundle-boundary.test.ts guard appended asserts the authored registry is unreachable from the worker bundle root. |
| C4 | constraint | respected | static_check | Inline fallback retained as strict subset (AC5 check); launcher remains functional when directive read unavailable (fallback path in decision table). |
| C5 | constraint | respected | static_check | Directive content ported verbatim-token from the prior launcher; launcher protocol anchors asserted by phase-directive-launcher.test.ts. |
| DONT1 | avoidance | respected | review | Branch diff contains no subtask:true usage (reviewer diff audit). |
| DONT2 | avoidance | respected | review | Recovery/reference material relocated into the delimited fallback and decision table, not deleted (adv-review.md 142 lines retain fallback + protocol). |
| DONT3 | avoidance | respected | review | withPhaseDirective is a pure function (no I/O, no gate mutation); directive is read-only plan projection data. No completion path consumes it. |
| DONT4 | avoidance | respected | review | Diff touches only plugin/ and .opencode/command/; no opencode core packages patched. |
| DONT5 | avoidance | respected | review | No skill('adv-review-methodology') reintroduced in launcher or elsewhere in the diff. |
| OOS1 | out_of_scope | not_applicable | not_applicable | Other lifecycle commands (prep/apply/harden/archive) conversion explicitly deferred past pilot; not attempted in branch diff. |
| OOS2 | out_of_scope | not_applicable | not_applicable | Out-of-scope item per approved agreement; not attempted in branch diff (acceptance reviewer diff audit). |
| OOS3 | out_of_scope | not_applicable | not_applicable | Cross-file dedup of Target Resolution/Key Tools recorded as follow-up candidate; not attempted in branch diff. |
| OOS4 | out_of_scope | not_applicable | not_applicable | Out-of-scope item per approved agreement; not attempted in branch diff (acceptance reviewer diff audit). |
| OOS5 | out_of_scope | not_applicable | not_applicable | Out-of-scope item per approved agreement; not attempted in branch diff (acceptance reviewer diff audit). |
| OOS6 | out_of_scope | not_applicable | not_applicable | Out-of-scope item per approved agreement; not attempted in branch diff (acceptance reviewer diff audit). |
| OOS7 | out_of_scope | not_applicable | not_applicable | Out-of-scope item per approved agreement; not attempted in branch diff (acceptance reviewer diff audit). |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-ffbaca27b78f | AC2 | AC8 | C2 |  |
| tk-632b3c245c80 | AC1 |  | C3, C5, DONT5 |  |
| tk-5c1ffe982cfe | AC1, AC2 |  | DONT3 |  |
| tk-1a877ceaabc8 | AC7 |  | C5 |  |
| tk-32c36d2df4b3 | AC1 | AC2 | C1 |  |
| tk-ebb3c179ef23 | AC3, AC4, AC5, AC6 |  | C4, C5, DONT1, DONT2, DONT5 |  |
| tk-ebf051cbf450 |  | SC1, SC2, SC3, SC4 | DONT4 |  |
