# Contract Traceability

**Change ID:** removeCompensatingAntiPatterns
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-08-03T03:22:11.153Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | storage/json.ts now has exactly one project-config access (:180), readFile (:190), and JSON.parse (:200), all inside parseProjectConfigFile. Both loadProjectConfig and loadProjectConfigWithDiagnostics delegate and switch on result.kind with no independent read or parse. Verified by adv-verifier PART 4 and enforced by the structural assertion in json.test.ts:145-171. |
| SC2 | success_criterion | pass | review | parseGhJson returns the empty|ok|malformed union; all six release-finalization call sites (638, 708, 1170, 1242, 1372, 1545) branch on it with exhaustive switches plus assertNever. Malformed responses carry parser diagnostics; empty does not. Covered by the new malformed-vs-empty test and the discoverMergedPr test in commit 43ea36ab. |
| SC3 | success_criterion | pass | review | The only guard removed in the repaired scope was the diskChecker try/catch around existsSync, which cannot throw for string arguments (DEP0187 applies to invalid argument types only; join() always yields a string). Verified against Node documentation by the independent design validator. No other unreachable guard remains in the three touched files. |
| SC4 | success_criterion | pass | review | agreement.md carries the durable evidence-backed classification table for all 7 candidates, including the 4 retained as legitimate defense and the 1 that was not a defect, each with its owning-mechanism basis, spec reference, and git provenance. |
| AC1 | acceptance_criterion | pass | test | parseProjectConfigFile owns access, readFile, JSON.parse, and ProjectConfigSchema validation exactly once; both public functions are thin adapters. Red run tr_msclhrxd_fb8da10b failed on the pre-refactor duplicate-boundary assertion; green run tr_mscljol0_1bfaf4f1 passed. Commit c0169a6f. |
| AC2 | acceptance_criterion | pass | test | New test drives one malformed project.json through both entry points and asserts loadProjectConfig throws while loadProjectConfigWithDiagnostics reports read_error carrying the same underlying message. Strengthened at acceptance review (commit 43ea36ab) from a structural assertion to a behavioral message-equivalence assertion. Green run tr_mscljol0_1bfaf4f1. |
| AC3 | acceptance_criterion | pass | test | Full storage/json.test.ts passes 85/85 including the pre-existing malformed-JSON throw case; run tr_mscllp5i_758eb380. No existing assertion was moved or relaxed — confirmed in the ENGINEER_REPORT for tk-988675d8b6cc. |
| AC4 | acceptance_criterion | pass | test | parseJson and its bare catch { return undefined } are fully removed; parseGhJson at git-finalize.ts:475 returns the discriminated GhJsonParse union with assertNever at :488. Verified by adv-verifier PART 4 (zero remaining parseJson references). Commit 6072ba23. |
| AC5 | acceptance_criterion | pass | test | New test stubs runGh to return status 0 with non-JSON stdout and asserts the malformed result is distinguishable from the empty-stdout result at the call site. Red run tr_mscltk3c_08048c68 failed on exactly this assertion with 128 existing tests passing; green run tr_msclxnf1_445191c3 passed 129/129. |
| AC6 | acceptance_criterion | pass | test | All six former parseJson call sites branch on the typed union with exhaustive switches and default assertNever. POLICY_DETECTION_FAILED and NO_MERGED_PR_FOUND remain reachable; PR_STATE_UNPARSEABLE gained first-ever coverage. Acceptance reviewer added an explicit discoverMergedPr test proving NO_MERGED_PR_FOUND survives the rewrite for both malformed and empty input (commit 43ea36ab). |
| AC7 | acceptance_criterion | pass | test | diskChecker try/catch removed; existsSync called directly. plugin/src/tools/_adapters.test.ts passes 48/48 with assertions unmodified, run tr_mscm2sfm_7000e53f. Commit 35b5be3a. |
| AC8 | acceptance_criterion | pass | test | adv-verifier PART 2: git diff trunk...HEAD touches exactly five files. All ten protected surfaces return zero diff lines, including resume-freshness-resolver.ts, terminal-history.ts, routing-guard.ts, and mcp-server/degradation.ts. Within index.ts the sibling visibilityLister (414-419) and workflowStateGetter (428-433) catches are confirmed unchanged. No test covering candidates 4-7 changed behavior. |
| AC9 | acceptance_criterion | pass | test | pnpm run check exit 0 (runId tr_mscm6s7r_64b197c2). Full suite via bin/oc-test full: 537 files passed, 8242 tests passed, 0 failed, exit 0. Diff-scoped grep for added eslint-disable, @ts-ignore, @ts-expect-error, or as any returned no matches; the 4 pre-existing no-explicit-any warnings sit in files with zero diff lines versus trunk. |
| C1 | constraint | respected | static_check | Each repair fixed the owning mechanism first. json.ts: the shared classifier was introduced before the duplicate branches were deleted. git-finalize.ts: parseGhJson and the exhaustive call-site switches replaced parseJson in the same change rather than deleting the catch alone. index.ts: no mechanism repair was owed because the guard was proven dead, not compensating. |
| C2 | constraint | respected | static_check | Every removal ships with executable verification: json.ts red/green tr_msclhrxd_fb8da10b and tr_mscljol0_1bfaf4f1; git-finalize.ts red/green tr_mscltk3c_08048c68 and tr_msclxnf1_445191c3; index.ts verify tr_mscm2sfm_7000e53f with 48/48 unchanged assertions. |
| C3 | constraint | respected | static_check | Retained defenses are documented in place: the index.ts diskChecker replacement carries an inline comment explaining why existsSync needs no guard, and design.md plus agreement.md record the retention basis for candidates 4, 5, 6 and the non-defect finding for candidate 7. |
| DONT1 | avoidance | respected | review | No repo-wide sweep occurred. Only three scoped repairs landed across three production files; the remaining bare catches in the codebase are untouched, confirmed by the five-file diff. |
| DONT2 | avoidance | respected | review | No codemod, lint-rule-driven mass edit, or catch-all cleanup. Each edit was hand-written against a named owning mechanism. The six loadProjectConfig callers were deliberately left untouched and recorded as a follow-up rather than swept. |
| DONT3 | avoidance | respected | review | No abstraction unifying candidates 5 and 6 was created. Discovery proved resume-freshness-resolver.ts and archive/terminal-history.ts share only surface resemblance — an advisory taxonomy versus a storage-format migration boundary — and both files have zero diff lines. |
| DONT4 | avoidance | respected | review | Zero diff lines in temporal/retry-wrapper.ts, temporal/service.ts, temporal/runtime-manager.ts, temporal/operations.ts, mcp-server/degradation.ts, tool-registry.ts, and tools/checkpoint.ts. Verified individually by adv-verifier PART 2. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-988675d8b6cc | AC1, SC1 | AC2, AC3 | C1, C2, DONT2 |  |
| tk-ac6c2d6e9918 | AC4, SC2 | AC5, AC6 | C1, C2 |  |
| tk-e368824d72f2 | AC7, SC3 |  | C1, DONT1 |  |
| tk-858e09f2c109 |  | AC8, AC9, SC4 | DONT1, DONT2, DONT3, DONT4 |  |
