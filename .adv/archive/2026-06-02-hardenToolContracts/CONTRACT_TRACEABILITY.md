# Contract Traceability

**Change ID:** hardenToolContracts
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-06-02T00:04:00.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | Generated schemas from Zod registry; schemas:check in local check and CI. Targeted suite 317 tests and pnpm run check passed. |
| AC2 | acceptance_criterion | pass | test | Schema URL asset test scans specs/scaffolds for retired anomalyco host; targeted suite passed. |
| AC3 | acceptance_criterion | pass | test | FIELD_POLICIES audited matrix and live registry drift guard passed. |
| AC4 | acceptance_criterion | pass | test | Tool registry tests verify INVALID_TOOL_ARGS before handler execution for malformed high-risk calls. |
| AC5 | acceptance_criterion | pass | test | Preflight tests cover omit/reject behavior for blank optional placeholders and audit/evidence fields. |
| AC6 | acceptance_criterion | pass | test | Sub-agent report schema and ingest tests reject missing identity as INVALID_REPORT. |
| AC7 | acceptance_criterion | pass | test | Agent/tool contract and subagent-report asset tests pin packet/prompt/doc/spec anchors. |
| AC8 | acceptance_criterion | pass | test | Targeted suite 317 tests, pnpm run check, bin/oc-test full, pnpm run build, and adv_change_validate 0 errors passed. |
| C1 | constraint | respected | static_check | Zod remains authoritative via schema-registry z.toJSONSchema renderer. |
| C2 | constraint | respected | static_check | Zod v4 native z.toJSONSchema is used; no alternate generator added. |
| C3 | constraint | respected | static_check | tool-registry SDK as any cast was not removed. |
| C4 | constraint | respected | static_check | Scope stayed on high-risk paths and drift guards, not all-tools rewrite. |
| C5 | constraint | respected | static_check | Schema generation deterministic and CI-checkable through schema tests, schemas:check, and CI step. |
| C6 | constraint | respected | static_check | All changes were in Advance worktree; cross-repo scanner found single-repo scope only. |
| DONT1 | avoidance | respected | review | INVALID_REPORT strictness tests passed. |
| DONT2 | avoidance | respected | review | Report identity fields remain explicit; no heuristic inference found. |
| DONT3 | avoidance | respected | review | Blank audit/approval/recovery/evidence fields reject in preflight tests. |
| DONT4 | avoidance | respected | review | Correctness-critical args are enforced by FIELD_POLICIES, registry preflight, Zod validation, and tests. |
| DONT5 | avoidance | respected | review | No broad gate redesign, lgrep/Vision performance, DB maintenance, or worktree cleanup rewrite. |
| DONT6 | avoidance | respected | review | No #138/#136 fix work performed. |
| OOS1 | out_of_scope | not_applicable | not_applicable | Full all-tools validation migration out of scope. |
| OOS2 | out_of_scope | not_applicable | not_applicable | Broad command-packet lint out of scope. |
| OOS3 | out_of_scope | not_applicable | not_applicable | Sub-agent report schema redesign out of scope. |
| OOS4 | out_of_scope | not_applicable | not_applicable | Unrelated tool performance optimization out of scope. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-60834f9112c3 | AC1, C1, C2, C5 | AC1 | DONT4 |  |
| tk-3cd32b209b7b | AC2 | AC2 | C5, DONT4 |  |
| tk-d3a0b19f168e | AC3, AC5 | AC3, AC5 | C4, DONT3, DONT4 |  |
| tk-88603a7cdf2c | AC4, AC5 | AC4, AC5 | C4, DONT3, DONT4 |  |
| tk-050e9b3f509c | AC6, AC7 | AC6, AC7 | DONT1, DONT2, DONT4, OOS2, OOS3 |  |
| tk-301330fdc801 | C1, C2, C5 | AC7 | DONT4 |  |
| tk-26fd938199f6 |  | AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8 | C1, C2, C3, C4, C5, DONT1, DONT2, DONT3, DONT4, DONT5, DONT6, OOS1, OOS2, OOS3, OOS4 |  |
