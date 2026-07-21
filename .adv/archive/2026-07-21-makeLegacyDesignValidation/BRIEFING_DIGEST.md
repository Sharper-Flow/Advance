# Archive Briefing Digest

**Change ID:** makeLegacyDesignValidation
**Title:** Make legacy design-validation blockers read-tolerant
**Status:** archived
**Generated:** 2026-07-21T21:04:48.825Z

## Identity Anchors

- CHANGE
- STATUS
- TERMINAL_GATE_SUMMARY

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

Showing 39 of 39 durable facts.

- **[report_follow_up]** follow_ups: The provided red/green command used `-t "requires applicable design-validation"`, which did not match any test name in this file (Vitest skipped all 55 tests). I reran with the actual test name that contains L428-430: `-t "enforces researcher judgement consistency with validation status"`.
- **[archive_only_evidence]** decisions: Replaced the literal check-3 block with a relocation comment rather than a blank deletion — Preserves the rationale for future maintainers and explicitly documents why schema-time rejection must not be restored, per rq-subagentReports24.1
- **[archive_only_evidence]** verification: cd plugin && npx vitest run src/types/subagent-reports.test.ts -t "enforces researcher judgement consistency with validation status" 2>&1 | tail -40 (0) — before-edit: targeted test passes (asserts check-3 rejects string design-validation blocker)
- **[archive_only_evidence]** verification: cd plugin && npx vitest run src/types/subagent-reports.test.ts -t "enforces researcher judgement consistency with validation status" 2>&1 | tail -40 (0) — after-edit: same test fails at L430 expecting /typed contract IDs/ throw — expected, proves removal took effect
- **[archive_only_evidence]** verification: cd plugin && npx tsc --noEmit 2>&1 | tail -20 (0) — tsc --noEmit clean, no TypeScript errors introduced
- **[archive_only_evidence]** decisions: Inserted string-blocker check before the AC13 unknown-contract-ID flatMap in executeSubmit — Preserves C7 ordering: the AC13 guard silently maps bare strings to [], so a dedicated string check must run first or new string blockers would persist through normal signaling.
- **[archive_only_evidence]** verification: cd plugin && npx vitest run src/tools/subagent-report.test.ts -t "PROBE: design-validation handler rejects string blockers" 2>&1 | tail -40 (0) — RED: probe failed (1 test failed) — string blocker slipped through to report success before edit (output.success: true, reportId returned)
- **[archive_only_evidence]** verification: cd plugin && npx vitest run src/tools/subagent-report.test.ts -t "PROBE: design-validation handler rejects string blockers" 2>&1 | tail -40 (0) — GREEN: probe passed — string blocker now rejected with error message, code INVALID_REPORT, and details.stringBlockerIndices [0]
- **[archive_only_evidence]** verification: cd plugin && npx tsc --noEmit 2>&1 | tail -20 (0) — tsc --noEmit clean — no TypeScript errors in plugin
- **[archive_only_evidence]** verification: cd plugin && npx vitest run src/tools/subagent-report.test.ts -t "design-validation handler rejects typed blockers with unknown contract IDs" 2>&1 | tail -40 (0) — Existing AC13 unknown-contract-IDs test still passes — new string check runs before it and does not affect typed-blocker cases
- **[archive_only_evidence]** decisions: Used existing file-scope `researcher:temporal-docs` for scope-isolation test instead of `researcher:architecture-validation`. — The file already uses `researcher:temporal-docs` as a researcher scope; handler has no special handling for non-design-validation scopes, so it is equivalent and avoids inventing an unseen key.
- **[archive_only_evidence]** verification: cd plugin && npx vitest run src/tools/subagent-report.test.ts -t "design-validation handler" 2>&1 | tail -40 (0) — 5 passed (AC13 + AC3 string-blocker + C7 ordering + scope isolation + typed-accepted tests); 57 skipped
- **[archive_only_evidence]** verification: cd plugin && npx tsc --noEmit 2>&1 | tail -20 (0) — TypeScript emits no diagnostics
- **[archive_only_evidence]** decisions: Defined applicableJudgement locally inside the new AC1 test — The original applicableJudgement was scoped inside the existing it() block; keeping the existing test verbatim required defining the judgement in the new test rather than hoisting it
- **[archive_only_evidence]** decisions: Added a file-level minimalValidChange fixture instead of reusing another test file's — No existing fixture in subagent-reports.test.ts; defining it here keeps the test self-contained and avoids cross-file coupling
- **[archive_only_evidence]** verification: npx vitest run src/types/subagent-reports.test.ts -t "enforces researcher judgement consistency with validation status" 2>&1 | tail -40 (0) — RED evidence: test failed at L430 before edits (expected throw not thrown; schema now accepts string blockers)
- **[archive_only_evidence]** verification: npx vitest run src/types/subagent-reports.test.ts -t "enforces researcher judgement consistency with validation status" 2>&1 (0) — GREEN: updated assertion passes; sibling checks 1/2/4 still pass
- **[archive_only_evidence]** verification: npx vitest run src/types/subagent-reports.test.ts -t "preserves multiple legacy string design-validation blockers" 2>&1 (0) — AC1: multi-string legacy blockers round-trip through ChangeSchema.parse
- **[archive_only_evidence]** verification: npx tsc --noEmit 2>&1 | tail -20 (0) — TypeScript clean
- **[archive_only_evidence]** verification: npx vitest run src/types/subagent-reports.test.ts 2>&1 (0) — All 56 tests in subagent-reports.test.ts pass
- **[archive_only_evidence]** verification: pnpm run check 2>&1 | tail -50 (0) — Full check passes: schemas, typecheck, manifests, lint, format
- **[archive_only_evidence]** decisions: Created a new test file instead of editing subagent-reports.test.ts — tk-cbb5da8dc864 (AC1) is not yet in the worktree; a new file avoids future merge conflicts and follows the same import/helper pattern.
- **[archive_only_evidence]** verification: cd plugin && npx vitest run src/types/subagent-reports.archive-through.test.ts -t "ChangeSchema accepts a change with legacy string design-validation blockers matching the wedged" 2>&1 | tail -40 (0) — AC2 fixture test passes (1/1)
- **[archive_only_evidence]** verification: cd plugin && npx tsc --noEmit 2>&1 | tail -20 (0) — TypeScript check clean across plugin
- **[report_follow_up]** follow_ups: Packet used TASK/CONTEXT/VALIDATION DIMENSIONS rather than the exact TASK_SCOPE/IN_SCOPE/OUT_OF_SCOPE/DONE_WHEN/STOP_WHEN/VERIFICATION anchor headings; identity anchors were complete, so validation proceeded without inferring additional scope.
- **[research_citation]** sources: Researcher report schema and existing schema test: ResearcherSubagentReportSchema.superRefine contains four checks; check 3 rejects string blockers for design-validation scopes. Existing test coverage at plugin/src/types/subagent-reports.test.ts lines 415-451 explicitly expects that schema-time rejection. (https://github.com/Sharper-Flow/Advance/blob/main/plugin/src/types/subagent-reports.ts#L541-L604)
- **[research_citation]** sources: Submit-handler write boundary: executeSubmit parses first, loads the change, then performs the AC13 approved-contract-ID check. Its flatMap explicitly maps string blockers to an empty array, so strings do not crash the current AC13 check. (https://github.com/Sharper-Flow/Advance/blob/main/plugin/src/tools/subagent-report.ts#L728-L780)
- **[research_citation]** sources: Recovery writer: RecoverySubagentReport is a loose structural interface; saveRecoveredSubagentReport accepts it directly and does not parse through ResearcherSubagentReportSchema. (https://github.com/Sharper-Flow/Advance/blob/main/plugin/src/tools/_recovery-writers.ts#L292-L306)
- **[research_citation]** sources.omitted: 2 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Existing pattern: a shared Zod schema handles both persisted reads and new-submit parsing, while check 3 imposes a new-write policy on every parse (https://github.com/Sharper-Flow/Advance/blob/main/plugin/src/types/subagent-reports.ts#L541-L604). Reference pattern for this repository: legacy normalization/read compatibility remains separate from strict submit ingestion (https://github.com/Sharper-Flow/Advance/blob/main/plugin/src/types/subagent-reports.ts#L875-L881), and rq-subagentReports24.1 names adv_subagent_report_submit as the new-report enforcement boundary (https://github.com/Sharper-Flow/Advance/blob/main/.adv/specs/subagent-reports/spec.json#L1181-L1193). Chosen relocation is architecturally correct and simpler than migration, coercion, or poisoned-history recovery. Deviation in design completeness is material: an existing test explicitly pins schema-time string rejection, contrary to the design's no-existing-test/no-change claim (https://github.com/Sharper-Flow/Advance/blob/main/plugin/src/types/subagent-reports.test.ts#L415-L451). Spec-law implication: no spec delta is needed, but implementation cannot satisfy AC1/AC5 until that test is deliberately rewritten. C7's required error precedence remains testable, but its crash rationale is inaccurate because current flatMap already guards strings (https://github.com/Sharper-Flow/Advance/blob/main/plugin/src/tools/subagent-report.ts#L761-L769).
- **[unresolved_action]** validation.blockers: Design misses an existing test that explicitly expects ResearcherSubagentReportSchema.parse to reject a design-validation string blocker with /typed contract IDs/. Removing check 3 will fail that test, so the stated test plan and 'no changes expected' inventory cannot satisfy AC1/AC5 as written.
- **[unresolved_action]** validation.blockers: C7/design says bare strings would crash the existing AC13 flatMap, but current handler explicitly branches on typeof blocker === "string" and returns [], so no contract_ids dereference occurs. Ordering is still required to preserve AC3's specific string-blocker rejection before unknown-ID diagnostics, not to prevent a crash.
- **[unresolved_action]** required_main_agent_actions: Record this READY review as acceptance evidence and complete the acceptance gate through the owning orchestration workflow.
- **[unresolved_action]** required_main_agent_actions: Leave unrelated recovery/#258 and fixPoisonedRecovery work untouched.
- **[wisdom_candidate]** wisdom_candidates: [pattern] Legacy persisted-state compatibility is safest as a tolerant reader with strict validation at the normal write boundary; preserve original legacy values verbatim and test the boundary ordering against later typed-only checks.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/types/subagent-reports.test.ts src/types/subagent-reports.archive-through.test.ts src/tools/subagent-report.test.ts src/subagent-reports-spec-assets.test.ts, cd plugin && npx tsc --noEmit, git diff --check HEAD~5..HEAD results=pass — Focused suite: 4 files, 141 tests passed (5.11s). TypeScript compiler exited 0 with no output. Diff check clean. Reviewed 5 commits (0835b734..cc425e9e): only schema/handler and focused tests changed; no spec delta. Researcher schema retains pass→confidence, fail→blocker, and applicable-judgement checks at subagent-reports.ts:557-597; removed check-3 is explicitly relocated. executeSubmit rejects strictly typeof blocker === string at subagent-report.ts:755-782 before AC13 flatMap at :787-792, returning exact message and indices. AC1 preserves three legacy strings through ChangeSchema.parse; AC2 fixture parses wedged acceptance-done shape and preserves strings; AC3 and C7 tests assert exact error, [0], no signal, and mixed-blocker ordering. Change show/gate use activeStore.changes.get; temporal terminal/reseed disk reads validate through storage/json.ts:518 ChangeSchema.parse, while task query reads workflow state seeded from the same valid Change shape. Recovery writer remains structural/tolerant at _recovery-writers.ts:330-421.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/types/subagent-reports.test.ts src/types/subagent-reports.archive-through.test.ts src/tools/subagent-report.test.ts src/subagent-reports-spec-assets.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: cd plugin && npx tsc --noEmit
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check HEAD~5..HEAD

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| AC1 | acceptance_criterion | pass |
| AC2 | acceptance_criterion | pass |
| AC3 | acceptance_criterion | pass |
| AC4 | acceptance_criterion | pass |
| AC5 | acceptance_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| C4 | constraint | respected |
| C5 | constraint | respected |
| C6 | constraint | respected |
| C7 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |
| DONT4 | avoidance | respected |
| DONT5 | avoidance | respected |
| DONT6 | avoidance | respected |

## Unresolved Actions

- Design misses an existing test that explicitly expects ResearcherSubagentReportSchema.parse to reject a design-validation string blocker with /typed contract IDs/. Removing check 3 will fail that test, so the stated test plan and 'no changes expected' inventory cannot satisfy AC1/AC5 as written.
- C7/design says bare strings would crash the existing AC13 flatMap, but current handler explicitly branches on typeof blocker === "string" and returns [], so no contract_ids dereference occurs. Ordering is still required to preserve AC3's specific string-blocker rejection before unknown-ID diagnostics, not to prevent a crash.
- Record this READY review as acceptance evidence and complete the acceptance gate through the owning orchestration workflow.
- Leave unrelated recovery/#258 and fixPoisonedRecovery work untouched.
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/types/subagent-reports.test.ts src/types/subagent-reports.archive-through.test.ts src/tools/subagent-report.test.ts src/subagent-reports-spec-assets.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: cd plugin && npx tsc --noEmit
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check HEAD~5..HEAD
