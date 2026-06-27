# Contract Traceability

**Change ID:** fixReleaseRepair
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-06-27T19:38:39.940Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Typed ADV tools now cover release-repair recovery paths; no direct external-state file edit path added. Review attempt 2 READY. |
| SC2 | success_criterion | pass | review | Targeted release-repair suite passed: 80 tests across tool-registry.surface, design-concern, _recovery-writers, gate.release-enforcement, gate, change.status-repair. |
| SC3 | success_criterion | pass | review | Recovery responses include _recoveryMutation/recovered/reconciliation warning or recoveryReason metadata; reviewer verified auth blockers resolved. |
| AC1 | acceptance_criterion | pass | test | design-concern tests passed in targeted suite; active workflow path uses designConcernDispositionedSignal + cache refresh and does not call recovery writer. |
| AC2 | acceptance_criterion | pass | test | design-concern recovery tests passed; completed/poisoned path writes latest-wins disposition with recovery audit and returns recovery marker/warning. |
| AC3 | acceptance_criterion | pass | test | design-concern tests reject blank/imprecise evidence, blank reason, unknown task IDs, generic failures, and accepted_debt by schema/validation. |
| AC4 | acceptance_criterion | pass | test | gate tests and gate.release-enforcement tests passed; remediation added imprecise recoveryEvidence rejection and preserves readiness/finalization blockers. |
| AC5 | acceptance_criterion | pass | test | change.status-repair tests passed; status repair gates on all gates done + archive bundle, requires precise evidence + recoveryReason, verifies read-after-write, returns recovered metadata. |
| AC6 | acceptance_criterion | pass | test | change.status-repair target_path tests passed; target repair keeps confirmation/serviceability rules and dry-run remains non-mutating. |
| AC7 | acceptance_criterion | pass | test | tool-registry.surface test passed; getToolSurface exposes adv_design_concern_disposition args target_path, recoveryMode, recoveryEvidence, recoveryReason. |
| AC8 | acceptance_criterion | pass | test | Final targeted release-repair suite passed: 80 tests. pnpm run check passed. pnpm run build passed. |
| C1 | constraint | respected | static_check | Gate/status repair still require all gates, readiness/finalization proof, and status readback before archived reporting. |
| C2 | constraint | respected | static_check | Recovery paths now fail closed for generic/imprecise evidence and require explicit audit reason/evidence before projection. |
| C3 | constraint | respected | static_check | Validation is structural: Zod enums, typed recovery writers, precise evidence classifier, gate readiness checks, readback verification, deterministic tests. |
| C4 | constraint | respected | static_check | Source behavior verified with targeted tests, pnpm run check, and pnpm run build; live runtime reload/deploy remains required for deployed tool-code behavior. |
| C5 | constraint | respected | static_check | Target-path tests passed; untrusted target mutation still requires target_confirmed and confirmationEvidence via target store routing. |
| DONT1 | avoidance | respected | review | DesignConcernDispositionSchema, task-existence validation, gate readiness, and status-repair invariants remain in code paths. |
| DONT2 | avoidance | respected | review | Generic/imprecise failures rejected by design-concern, gate, and status repair tests; no projection mutation on rejected cases. |
| DONT3 | avoidance | respected | review | Gate release-enforcement and readiness tests passed; normal active workflow signal/readiness behavior preserved. |
| DONT4 | avoidance | respected | review | DESIGN_CONCERN_DISPOSITIONS excludes accepted_debt; tests verify unsupported disposition verbs are rejected. |
| DONT5 | avoidance | respected | review | Target project mutation tests passed with target_confirmed/confirmationEvidence requirements intact. |
| DONT6 | avoidance | respected | review | Recovery writes stay behind typed _recovery-writers helpers; no direct ADV external-state read/write path added. |
| OOS1 | out_of_scope | respected | not_applicable | No broad redesign of Temporal workflow completion, archive finalization, or gate status storage; changes are validation/metadata/test scoped. |
| OOS2 | out_of_scope | respected | not_applicable | Originating pokeedge state was not mutated. |
| OOS3 | out_of_scope | respected | not_applicable | No generic disk-projection fallback added; new tests reject generic/imprecise recovery evidence. |
| OOS4 | out_of_scope | respected | not_applicable | No worktree cleanup, Epic projection, reflection, or status WIP performance changes made. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-16f8661e8103 | SC1, SC2, SC3, C1, C2, C3 | AC8 | DONT2, DONT3, DONT6, OOS3 |  |
| tk-04d6ce1181a0 | AC7, C3 | AC7, AC8 | DONT6, OOS3 |  |
| tk-7754055a590d | AC1, AC2, AC3, C2, C3 | AC1, AC2, AC3, AC8 | DONT1, DONT2, DONT4, DONT6, OOS3 |  |
| tk-c7a54e188084 | AC4, AC5, AC6, C1, C5 | AC4, AC5, AC6, AC8 | DONT2, DONT3, DONT5, OOS1, OOS3 |  |
| tk-2f1c090d9d0d |  | SC1, SC2, SC3, AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, C1, C2, C3, C4, C5 | DONT1, DONT2, DONT3, DONT4, DONT5, DONT6, OOS1, OOS2, OOS3, OOS4 |  |
