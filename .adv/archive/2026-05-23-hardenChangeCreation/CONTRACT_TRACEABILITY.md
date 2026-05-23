# Contract Traceability

**Change ID:** hardenChangeCreation
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-05-23T20:53:14.226Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | Regression matrix covers minimal valid ad hoc adv_change_create payload; focused tests passed (71) and full suite passed (2995). |
| AC2 | acceptance_criterion | pass | test | Preflight rejects blank proposal/design/origin_source_artifact with field diagnostics; tool-arg-preflight tests passed. |
| AC3 | acceptance_criterion | pass | test | Ad hoc origin placeholder/issue linkage regression rows reject invalid origin fields; change-origin and preflight tests passed. |
| AC4 | acceptance_criterion | pass | test | Roadmap origin without issue number remains rejected by origin matrix tests; focused tests passed. |
| AC5 | acceptance_criterion | pass | test | Triage with optional source artifact remains accepted in origin matrix coverage; focused tests passed. |
| AC6 | acceptance_criterion | pass | test | Discovery with origin_issue_number remains rejected by existing origin regression coverage; focused tests passed. |
| AC7 | acceptance_criterion | pass | test | Existing origin tests included in focused run; src/tools/change-origin.test.ts passed. |
| AC8 | acceptance_criterion | pass | test | Blank target_path rejected for create and target-aware tools; regression rows added after review and passed. |
| AC9 | acceptance_criterion | pass | test | source_project/source_change_id without target_path and blank source values with target_path are rejected by preflight matrix tests. |
| AC10 | acceptance_criterion | pass | test | parent_change_id blank/sentinel values rejected by preflight matrix tests. |
| AC11 | acceptance_criterion | pass | test | scope_repos empty array normalizes to omission in preflight matrix tests. |
| AC12 | acceptance_criterion | pass | test | Required content/execution fields (summary, task content, wisdom content, test command, worktree branch) reject blank values in parameterized tests. |
| AC13 | acceptance_criterion | pass | test | Optional durable/audit/path/linkage strings reject blanks through explicit FIELD_POLICIES; tests cover target_path, evidence, recovery, and linkage fields. |
| AC14 | acceptance_criterion | pass | test | Record values for task cancellation reasons and supersededBy reject blanks in preflight tests. |
| AC15 | acceptance_criterion | pass | test | Empty-array/object behavior is explicit in FIELD_POLICIES; scope_repos empty array is omitted, other placeholder handling rejects unless explicitly allowed. |
| AC16 | acceptance_criterion | pass | test | Regression matrix includes minimal valid ad hoc payload case; tests passed. |
| AC17 | acceptance_criterion | pass | test | Regression matrix includes ad hoc blank/zero origin placeholder cases; tests passed. |
| AC18 | acceptance_criterion | pass | test | Regression matrix includes blank artifact field cases; tests passed. |
| AC19 | acceptance_criterion | pass | test | Regression coverage includes roadmap/triage/discovery origin constraints via preflight and change-origin tests. |
| AC20 | acceptance_criterion | pass | test | Regression matrix includes target/source/lineage placeholder cases, including review-added target-aware fields. |
| AC21 | acceptance_criterion | pass | test | Regression matrix includes empty scope_repos normalization case; tests passed. |
| AC22 | acceptance_criterion | pass | test | Representative all-tools traps covered for task, gate, approval, cancellation, wisdom, run-test, worktree, conformance, agenda, contract, Temporal, and status fields. |
| AC23 | acceptance_criterion | pass | test | adv_change_create schema/description was updated with canonical minimal payload guidance and omission instruction. |
| AC24 | acceptance_criterion | pass | test | Preflight error formatting includes field names and canonical_minimal_payload for create failures; tool-arg-preflight tests passed. |
| AC25 | acceptance_criterion | pass | test | Design records GPT-class, Claude-class, and GLM/open-weights/other provider matrix. |
| AC26 | acceptance_criterion | pass | test | Design matrix columns include provider path, placeholder pattern reproduced, classification, and design response/follow-up. |
| AC27 | acceptance_criterion | pass | test | Placeholder/cross-field validation centralized in pure tool-arg-preflight helpers with registry handoff through normalizedArgs. |
| AC28 | acceptance_criterion | pass | test | Registry normalized-args tests and execute parity coverage prove preflight and execute behavior align; focused and full tests passed. |
| C1 | constraint | respected | static_check | rq-backlogCoord08 origin constraints preserved; change-origin tests passed. |
| C2 | constraint | respected | static_check | Structural preflight policies, Zod schema validation, registry normalizedArgs, and regression tests own correctness; no prose-only enforcement. |
| C3 | constraint | respected | static_check | Minimal ad hoc create path remains covered and discoverable through tests and diagnostics. |
| C4 | constraint | respected | static_check | Provider differences recorded as evidence only; runtime behavior remains provider-agnostic structural validation. |
| C5 | constraint | respected | static_check | Sentinel handling is explicit field policy; heuristics do not own persistence/workflow/audit decisions. |
| C6 | constraint | respected | static_check | Policy coverage targets durable state, audit, workflow transition, path, external execution, and semantic-filter fields across ADV tools. |
| DONT1 | avoidance | respected | review | origin_issue_number: 0 remains invalid in origin/placeholder tests. |
| DONT2 | avoidance | respected | review | Blank artifact fields reject before mutation; tests verify no blank artifact persistence path. |
| DONT3 | avoidance | respected | review | Invalid ad hoc origin linkage rejected by preflight/origin tests. |
| DONT4 | avoidance | respected | review | Cross-project target_path and confirmationEvidence blanks reject structurally; auditability preserved. |
| DONT5 | avoidance | respected | review | Review found deterministic field diagnostics; no real validation errors hidden by broad normalization. |
| DONT6 | avoidance | respected | review | Sentinel normalization limited to explicit omission-equivalent policy; audit/path/linkage defaults reject. |
| DONT7 | avoidance | respected | review | adv_change_create API not split; change stayed within tool-boundary hardening scope. |
| DONT8 | avoidance | respected | review | Provider runtime hints were not redesigned; provider matrix only informed validation design. |
| DONT9 | avoidance | respected | review | Approval evidence, recovery evidence, gate actor, command strings, paths, issue numbers, and IDs reject placeholders unless explicitly omission-equivalent; tests cover representative fields. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-07df67737bb8 | AC2, AC3, AC5, AC6, AC8, AC9, AC10, AC11, AC13, AC15, AC27, AC28 | AC27, AC28 | C1, C2, C3, C4, C5, C6, DONT1, DONT4, DONT5, DONT6, DONT8, DONT9 |  |
| tk-0d2ef9f82020 | AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC9, AC10, AC11, AC23, AC24 | AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC9, AC10, AC11, AC23, AC24 | C1, C2, C3, C4, C5, C6, DONT1, DONT2, DONT3, DONT4, DONT5, DONT6, DONT7, DONT8, DONT9 |  |
| tk-c327b6b27d24 | AC12, AC13, AC14, AC15, AC22, AC27, AC28 | AC12, AC13, AC14, AC15, AC22, AC27, AC28 | C1, C2, C3, C4, C5, C6, DONT4, DONT5, DONT6, DONT8, DONT9 |  |
| tk-973f6b2348cf | AC7, AC27, AC28 | AC7 | C1, C2, C3, C4, C5, C6, DONT1, DONT4, DONT5, DONT6, DONT8, DONT9 |  |
| tk-713b481b7c84 | AC16, AC17, AC18, AC19, AC20, AC21, AC22 | AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC9, AC10, AC11, AC12, AC13, AC14, AC15, AC16, AC17, AC18, AC19, AC20, AC21, AC22, AC23, AC24, AC27, AC28 | C1, C2, C3, C4, C5, C6, DONT1, DONT2, DONT3, DONT4, DONT5, DONT6, DONT7, DONT8, DONT9 |  |
| tk-029c815e76be | AC25, AC26 | AC23, AC24, AC25, AC26, AC27, AC28 | C1, C2, C3, C4, C5, C6, DONT1, DONT2, DONT3, DONT4, DONT5, DONT6, DONT7, DONT8, DONT9 |  |
