# Contract Traceability

**Change ID:** fixToolArgSafety
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-05-22T15:41:30.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | Targeted regression and full suite passed after remediation. Evidence: plugin/src/utils/tool-arg-preflight.test.ts mixed blank update preflight; plugin/src/tools/change.test.ts mixed blank execute; plugin/src/storage/json.test.ts blank update no partial write. pnpm test: 226 files, 2920 tests passed. |
| AC2 | acceptance_criterion | pass | test | plugin/src/tools/change.test.ts verifies omitted update fields are passed as undefined; plugin/src/storage/json.test.ts verifies omitted update fields leave existing files unchanged. pnpm test passed. |
| AC3 | acceptance_criterion | pass | test | plugin/src/tools/change-origin.test.ts and plugin/src/utils/tool-arg-preflight.test.ts reject blank create narratives; review remediation added plugin/src/storage/json.test.ts scaffold blank guard. pnpm exec vitest run src/storage/json.test.ts src/storage/store-temporal/changes.test.ts passed (86 tests); pnpm test passed. |
| AC4 | acceptance_criterion | pass | test | plugin/src/tools/change-origin.test.ts covers roadmap requires issue, roadmap rejects source artifact, discovery/adhoc reject issue as specified, triage remains allowed. pnpm test passed. |
| AC5 | acceptance_criterion | pass | test | plugin/src/tools/change-origin.test.ts and plugin/src/utils/tool-arg-preflight.test.ts verify blank origin_source_artifact rejection with fields/hint. pnpm test passed. |
| AC6 | acceptance_criterion | pass | test | plugin/src/storage/store-temporal/changes.test.ts verifies origin seedState at workflow start and executiveSummary artifact metadata signaling after remediation; plugin/src/temporal/search-attributes.test.ts verifies AdvBacklogIssueNumber from origin. pnpm test passed. |
| AC7 | acceptance_criterion | pass | test | plugin/src/tools/change.test.ts and change-origin.test.ts assert error responses include offending fields and omit guidance; preflight formatter uses same message. pnpm test passed. |
| AC8 | acceptance_criterion | pass | test | Valid create/update/proposal compatibility covered by change-origin.test.ts, change.test.ts, tool-arg-preflight.test.ts, and full suite. pnpm run check passed; pnpm test passed; adv_change_validate strict passed with NO_DELTAS warning only. |
| C1 | constraint | respected | static_check | Review confirmed structural layers: Zod schemas, preflight validators, tool execute guards, storage guards in json.ts create/update, Temporal seedState in store-temporal/changes.ts, and tests. Remediation closed storage-create and executiveSummary metadata gaps. |
| C2 | constraint | respected | static_check | Validation scope is limited to narrative artifact fields and origin linkage fields in adv_change_create/update; no broad all-tool blank optional string policy was introduced. |
| C3 | constraint | respected | static_check | No implementation of broader all-ADV-tool blank optional string policy. Existing agenda deferral remains untouched. |
| C4 | constraint | respected | static_check | Source-level tests and checks passed in this session. Live OpenCode tool behavior still requires plugin build/deploy/session restart per repo gotcha; acceptance summary will call this out as caveat. |
| C5 | constraint | respected | static_check | Cross-repo review found all touched files under current repo paths (.adv/specs, plugin/src, CHANGELOG.md); no target_repo/target_path tasks or external repo mutations. |
| DONT1 | avoidance | respected | review | Blank provided destructive fields are rejected with explicit errors at preflight/tool/storage layers; no code path silently converts blanks to omitted values. |
| DONT2 | avoidance | respected | review | Structural validation and tests enforce behavior independent of agent prompt discipline. |
| DONT3 | avoidance | respected | review | No hand edits to ADV state projections; state changes flow through store/Temporal APIs and typed review matrix tooling. |
| DONT4 | avoidance | respected | review | No OpenCode SDK/schema conversion redesign. Existing tool-registry cast pattern remains; new validation is ADV-local. |
| DONT5 | avoidance | respected | review | Only adv_change_create/update and related storage/Temporal artifact metadata paths were changed; no redesign of every ADV tool schema. |
| DONT6 | avoidance | respected | review | No dedicated origin repair tool was added. Origin correctness is handled by forward-path create-time validation and Temporal seed-state persistence. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-b90800a8704c | C1, C2, C3, DONT4, DONT5 |  | DONT1, DONT2, DONT3, DONT4, DONT5, DONT6 |  |
| tk-2290392aab08 | AC1, AC2, AC7, C1, C2 | AC1, AC2, AC7 | DONT1, DONT2, DONT5 |  |
| tk-c6df750567b9 | AC3, AC4, AC5, AC7, AC8, C1, C2 | AC3, AC4, AC5, AC7, AC8 | DONT1, DONT2, DONT4, DONT5 |  |
| tk-1cee65bb2d9b | AC6, AC8, C1, DONT6 | AC6, AC8 | DONT3, DONT5, DONT6 |  |
| tk-150fb12907ff |  | AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8 | C1, C2, C3, C4, C5, DONT1, DONT2, DONT3, DONT4, DONT5, DONT6 |  |
