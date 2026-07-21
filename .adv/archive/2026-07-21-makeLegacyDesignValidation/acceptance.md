# Acceptance

Reviewed at: 2026-07-20T19:42:00.000Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| AC1 | acceptance_criterion | **AC1 (read tolerance):** A `change.json` whose historical `subagent_reports` contain string-form `researcher:design-validation` blockers passes `ChangeSchema.parse` on read with no superRefine failure. The other three researcher superRefine invariants (pass→confidence, fail→≥1 blocker, design-validation→applicable judgement) still hold. | pass | AC1 verified: subagent-reports.test.ts updated assertion + multi-string round-trip. 56 tests pass. RunId tr_mrtm37nv_a246d77d. |
| AC2 | acceptance_criterion | **AC2 (archive-through):** `adv_change_archive` completes for such a change — conflict inventory loads, bundle is written, status transitions to `archived`, spec deltas apply — with no `poisoned_history` recovery and no direct `change.json` edits. | pass | AC2 verified: subagent-reports.archive-through.test.ts fixture passes. ChangeSchema.parse accepts wedged shape. |
| AC3 | acceptance_criterion | **AC3 (write-path strictness preserved):** A **new** `adv_subagent_report_submit` design-validation report containing a string blocker is still rejected with the existing *"new design-validation blockers require typed contract IDs, in-scope remediation, and source evidence"* message plus offending indices. | pass | AC3 verified: handler tests (rejection + C7 ordering + scope isolation). All pass. |
| AC4 | acceptance_criterion | **AC4 (other read paths):** `adv_change_show` / `adv_task_show` / `adv_gate_complete` on such a change surface no schema error attributable to string design-validation blockers. | pass | AC4 verified: structurally via AC1. All read tools use ChangeSchema.parse. |
| AC5 | acceptance_criterion | **AC5 (regression tests):** New tests reproduce AC1 (read round-trip), AC2 (archive-through on a fixture matching the wedged shape), and AC3 (write rejection with offending indices). | pass | AC5 verified: bin/oc-test targeted, 241 tests green across 9 files. |
| C1 | constraint | **C1:** Do NOT weaken the typed-blocker requirement for new design-validation submissions (enforcement relocates from schema to submit tool; rejection semantics are preserved). | respected | C1 respected: handler relocates check with identical failure shape. |
| C2 | constraint | **C2:** Do NOT weaken or remove the other three researcher `superRefine` checks. | respected | C2 respected: sibling superRefine checks preserved verbatim. |
| C3 | constraint | **C3:** Read tolerance only — do NOT silently rewrite, coerce, or normalize historical blocker text at read time. Original strings must be preserved verbatim in state. | respected | C3 respected: no coercion; tests assert verbatim preservation. |
| C4 | constraint | **C4:** Single strict enforcement point for new submissions is the normal `adv_subagent_report_submit` tool (handler `executeSubmit`). The `_recovery-writers.ts` path stays tolerant — recovery is inherently for already-poisoned data and already uses a loose structural interface. | respected | C4 respected: recovery writer unchanged; uses loose interface. |
| C5 | constraint | **C5:** Do NOT bundle with `fixPoisonedRecovery` or re-open #258 (`fixRecoverySchemaDrift`) scope. Separate contract, ships independently. | respected | C5 respected: no bundled scope; 5 commits within relocation. |
| C6 | constraint | **C6:** Do NOT introduce a heuristic that could mask genuinely malformed new reports. The new write-boundary check is a strict equality (`typeof blocker === "string"` → reject) over a precisely scoped scope prefix. | respected | C6 respected: strict equality check; no heuristic. |
| C7 | constraint | **C7:** Ordering — the new string-blocker write-boundary check must run BEFORE the existing AC13 unknown-contract-IDs check, because bare strings have no `contract_ids` field and would crash the `.flatMap` otherwise. | respected | C7 respected: string check before AC13 flatMap; ordering test proves it. |
| DONT1 | avoidance | No data migration tool, no repair tool, no on-disk rewrite. Immutable history simply becomes readable. | respected | DONT1 respected: no migration tool or on-disk rewrite. |
| DONT2 | avoidance | No new exported schema symbol or public API surface — internal relocation only. | respected | DONT2 respected: no new exported symbol or public API. |
| DONT3 | avoidance | No spec delta: `rq-subagentReports24` already mandates the proposed boundary; spec law stays as-is. | respected | DONT3 respected: no spec delta; rq-subagentReports24 unchanged. |
| DONT4 | avoidance | Do NOT touch `fixPoisonedRecovery` or broader poisoned-history recovery work (separate contract). | respected | DONT4 respected: no fixPoisonedRecovery changes; recovery code untouched. |
| DONT5 | avoidance | Do NOT migrate/coerce the wedged Vision `fixPlaywrightSessionIsolation` reports to typed form — they stay verbatim, just become readable. | respected | DONT5 respected: no Vision report migration/coercion; reports stay verbatim. |
| DONT6 | avoidance | Do NOT re-open #258 schema-error surfacing or `recovery_audit` drift (already shipped). | respected | DONT6 respected: no #258 re-opening; schema-error surfacing untouched. |

