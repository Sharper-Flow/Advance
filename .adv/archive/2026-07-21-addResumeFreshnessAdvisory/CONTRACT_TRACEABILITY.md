# Contract Traceability

**Change ID:** addResumeFreshnessAdvisory
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-21T15:20:00.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | resolver emits findings via fetchChangeContextSnapshot before snapshot render; pipeline test tk-338d015a8ee6 scenario 2 confirms stale change triggers advisory |
| SC2 | success_criterion | pass | review | AC1 trigger guard skips resolver when lastActivityAgeMinutes <= 60; pipeline test scenario 1 verifies zero store calls + no Freshness line for fresh change |
| SC3 | success_criterion | pass | review | DDC1-8 caps enforced in resume-freshness-resolver.ts (RESUME_FRESHNESS_BUDGET_MS=8000, SIBLING_OVERLAP_SCAN_CAP=50, ARCHIVED_SINCE_SCAN_CAP=50, CODEBASE_DRIFT_COMMIT_CAP=100); primary-only invocation bound in status-enrich.ts |
| SC4 | success_criterion | pass | review | ResumeFreshnessLabel type in resume-freshness.ts verbatim from /adv-coordinate taxonomy; no new labels introduced |
| AC1 | acceptance_criterion | pass | test | RESUME_FRESHNESS_TRIGGER_MINUTES=60; resolveResumeFreshness entrypoint returns skipped:true when <=60; pipeline test scenario 5 confirms 60min=skip vs 61min=fire boundary |
| AC2 | acceptance_criterion | pass | test | ResumeFreshnessCode type union enumerates exactly 4 codes; resolver tests emit each code; freshness_limited fallback covered in 3 entrypoint tests |
| AC3 | acceptance_criterion | pass | test | advisory is informational; resolver never calls gate mutation tools; pipeline test scenario 2 confirms snapshot renders normally after resolver runs |
| AC4 | acceptance_criterion | pass | test | resolver code path uses only store.changes.get/list (read-only); appendResumeFreshnessRecommendation never invokes adv_change_close; resolver tests verify no store mutator calls |
| AC5 | acceptance_criterion | pass | test | plugin/src/utils/context-snapshot.ts imports only from ./workflow-directive (existing); ContextSnapshotResumeFreshness defined as local structural type to avoid storage import |
| AC6 | acceptance_criterion | pass | test | resumeFreshness is optional field; buildChangeContextSnapshot accepts it; formatter renders nothing when undefined; 52 existing formatter tests still pass + 6 new tests confirm field handling |
| AC7 | acceptance_criterion | pass | test | resume-freshness-resolver.test.ts covers each code (sibling_overlap HIGH+MEDIUM, archived_duplicate HIGH+skip-parent, codebase_drift freshness_limited fallback), fresh-skip path, budget timeout path |
| AC8 | acceptance_criterion | pass | test | resolver uses store.changes.list({}) and list({includeArchived:true}) — both current-project scoped by Store invariant; no target_path routing in resolver |
| AC9 | acceptance_criterion | pass | test | resolveResumeFreshness is stateless (no module-level cache, no persistence layer); same input produces same output; no dismissal memory fields |
| AC10 | acceptance_criterion | pass | test | formatContextSnapshot 4-stage rule: dropOutcomes at optionalCount>=2, dropCurrent at >=3, dropSpacerOrWisdom at >=4; Freshness retained as last shed; context-snapshot.test.ts 4-optional scenario verifies <=10 lines |
| AC11 | acceptance_criterion | pass | test | appendResumeFreshnessRecommendation emits only when exactly one repo_backed_fact archived_duplicate; snippet requires user to run adv_change_close with approvedByUser:true + approvalEvidence; status-enrich.test.ts wording-guard test asserts no 'one-click'/'button-click' |
| C1 | constraint | respected | static_check | no new gate added; advisory is informational only; resolver cannot block gate transitions (no gate mutation calls) |
| C2 | constraint | respected | static_check | intersectFileLists extracted from validator/file-overlap.ts; execGit reused from utils/git.ts; pushStatusRecommendation reused from status-enrich.ts; no greenfield detection primitives |
| C3 | constraint | respected | static_check | hard caps: DDC2 50 siblings, DDC3 50 archives, DDC4 100 commits, DDC1 8s budget, DDC8 primary-only; ~3-5 calls per stale resume |
| C4 | constraint | respected | static_check | RESUME_FRESHNESS_TRIGGER_MINUTES=60 matches existing 'hot' band boundary in appendRecencyRecommendation |
| C5 | constraint | respected | static_check | plugin/src/utils/context-snapshot.ts has no storage imports; resolver lives in plugin/src/storage/resume-freshness-resolver.ts |
| C6 | constraint | respected | static_check | formatContextSnapshot preserves 10-line cap in all combinations; 4-stage shed rule tested including 4-optional case |
| C7 | constraint | respected | static_check | ResumeFreshnessCode is fixed union type; labels are from inherited taxonomy; no LLM classification in resolver |
| DONT1 | avoidance | respected | review | no adv_gate_complete calls in resolver or recommendation emitter; advisory cannot block |
| DONT2 | avoidance | respected | review | 7 existing primitives reused (taxonomy, intersectFileLists, execGit, pushStatusRecommendation, appendRecencyRecommendation pattern, fetchChangeContextSnapshot plumbing, buildChangeContextSnapshot signature extension) |
| DONT3 | avoidance | respected | review | resolver only invokes store.changes.get/list (read-only); no close/supersede/task/gate mutations fired from advisory path |
| DONT4 | avoidance | respected | review | no persisted dismissal state; resolveResumeFreshness is pure function of (store, changeId, input) |
| DONT5 | avoidance | respected | review | no target_path routing in resolver or injectors; current-project store only |
| DONT6 | avoidance | respected | review | formatContextSnapshot hard 10-line cap; 4-stage shed rule structurally bounds all combinations |
| DONT7 | avoidance | respected | review | appendResumeFreshnessRecommendation emits copy-pasteable snippet only; user must invoke adv_change_close themselves; wording uses 'one-command accept' never 'one-click'; wording-guard test enforces |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-5bbd701b42ca | AC2 |  | C5, C7 |  |
| tk-eecf04f7df59 | AC3, AC11 |  | DONT1, DONT3, DONT7 |  |
| tk-57c0973b03f5 |  |  | C2 |  |
| tk-78ac237d8630 | AC2, AC8 |  | C2, C3, DONT2, DONT5 |  |
| tk-b87896ac4738 | AC2, AC8 |  | C2, C3, DONT2, DONT5 |  |
| tk-c315acd9e7ea | AC5, AC6, AC10 |  | C5, C6, DONT6 |  |
| tk-96cede0a416a | AC2 |  | C2, C3, DONT2 |  |
| tk-36b013f11ad8 | AC1, AC2, AC4, AC7, AC9 |  | C2, C3, C4, C7, DONT2, DONT3, DONT4 |  |
| tk-11fbea40c938 | AC1, AC6 |  | C2, C3, DONT5 |  |
| tk-5e9b6c11a473 | AC11 |  | C2, DONT7 |  |
| tk-338d015a8ee6 |  | AC1, AC2, AC3, AC4, AC6, AC7 | C3 |  |
| tk-8e87f1a1938c | AC3, AC4, AC9 |  | C1, C4, C6, C7, DONT1, DONT3, DONT4, DONT6 |  |
