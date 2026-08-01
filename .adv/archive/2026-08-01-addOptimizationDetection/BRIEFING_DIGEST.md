# Archive Briefing Digest

**Change ID:** addOptimizationDetection
**Title:** Add optimization detection
**Status:** archived
**Generated:** 2026-08-01T21:28:27.219Z

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

Showing 100 of 174 durable facts (74 omitted).

- **[archive_only_evidence]** decisions: Implemented opt-scan as a zero-dependency local scanner mirroring arch-scan/slop-scan conventions — Project convention requires typed, deterministic CLI scanners under bin/lib/ and reserves Zod for plugin public schemas
- **[archive_only_evidence]** decisions: Left the evaluator as a stub that records detectors as skipped — The structural foundation task owns schema/registry/bridge/CLI; the next task implements the four deterministic detectors
- **[archive_only_evidence]** decisions: Guarded static candidates against measured evidence and measured-impact prose — AC3 requires static candidates to remain advisory and never assert speedup/latency/runtime impact without measurement evidence
- **[archive_only_evidence]** decisions: Used slop-scan coverage-state vocabulary and a v1 JSON envelope — Provides a stable, bounded intake for the optimizer and consistent coverage reporting with sibling scanners
- **[archive_only_evidence]** verification: bun test bin/lib/opt-scan (0) — 34 tests pass across schema, registry, scan, bridge, report
- **[archive_only_evidence]** verification: bun run bin/opt-scan.ts --format json --phase 1 bin/lib/opt-scan/__tests__ (0) — CLI emits v1 JSON envelope with four skipped detectors
- **[archive_only_evidence]** verification: bun run bin/opt-scan.ts --format json /nonexistent/path_12345 (1) — CLI exits 1 with bridge degraded coverage for missing repo
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: opt-scan-foundation-1
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: opt-scan-cli-1
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: opt-scan-cli-degraded-1
- **[archive_only_evidence]** verification: bun test bin/lib/opt-scan (0) — 65 tests / 242 assertions passed on current rebased branch
- **[archive_only_evidence]** decisions: Implemented a single self-contained evaluator module rather than splitting per-detector logic — Preserves zero-dependency bin/lib scanner architecture; registry stays the declarative source of truth while evaluator holds deterministic, bounded regex + context guards
- **[archive_only_evidence]** decisions: Updated registry patterns to require actual calls for worker_startup_pressure and to match compute-like prefixes for cache_opportunity — Reduces false-positive imports and lets the evaluator apply the family-specific evidence requirements without duplicating trigger logic
- **[archive_only_evidence]** decisions: Made cache_opportunity reject unless source evidence shows immutable identity, ownership, and invalidation — Fulfills the explicit contract requirement to reject unclear cache cases rather than emit speculative candidates
- **[archive_only_evidence]** decisions: Added proximity-based deduplication for collection-chain and cache-function candidates — Multi-line chains and compute-heavy functions can trigger multiple adjacent regex hits; dedup keeps one advisory candidate per logical site
- **[archive_only_evidence]** verification: bun test bin/lib/opt-scan (0) — 46 pass, 0 fail across opt-scan suite (evaluator + registry + scan + bridge + schema + report + detectors + fixtures)
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/adv-optimizer-assets.test.ts src/adv-arch-scan-assets.test.ts src/adv-slop-scan-assets.test.ts (0) — 39 pass, 0 fail across ADV optimizer/arch/slop asset tests
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_ms9d6ekt_b8e46a02
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_ms9d5hyp_f8b87920
- **[archive_only_evidence]** decisions: Implemented optimizer candidate intake as a separate `bin/lib/opt-scan/intake.ts` module — Keeps `bin/opt-scan.ts` a thin shell, mirrors the existing bridge/report split, and makes intake policy unit-testable.
- **[archive_only_evidence]** decisions: Reused `validateOptimizationCandidate` as the first validation gate — Avoids duplicating field/cross-field validation and inherits the existing static/measured guard that forbids runtime-gain claims on static candidates.
- **[archive_only_evidence]** decisions: Added intake-specific policy rules only for trigger evidence and cache ownership/invalidation — Preserves the optimizer safety boundary: unclear correctness ownership or cache invalidation is rejected, while non-cache candidates only need schema-valid, trigger-backed evidence.
- **[archive_only_evidence]** decisions: Rendered an explicit read-only safety note in every intake report — Satisfies the requirement to make no automatic source edits, cache/state creation, and to retain the optimizer's read-only safety boundary.
- **[archive_only_evidence]** decisions: Wired `--intake <path>` (with `-` for stdin) into the existing `bin/opt-scan.ts` CLI — Provides a single optimizer-side entry point that accepts external candidate JSON without changing the default scan behavior.
- **[archive_only_evidence]** verification: bun test /home/jon/.local/share/opencode/worktree/bdf259aa162ae192af5b18899ccdc653b085528d/change/addOptimizationDetection/bin/lib/opt-scan/intake.test.ts (0) — 12 new intake tests pass: valid static/cache intake, evidence preservation, recommendation/verification rendering, and rejection for missing cache ownership/invalidation, static measured evidence, runtime-gain prose, missing trigger, and malformed input.
- **[archive_only_evidence]** verification: bun test /home/jon/.local/share/opencode/worktree/bdf259aa162ae192af5b18899ccdc653b085528d/change/addOptimizationDetection/bin/lib/opt-scan/ (0) — Full opt-scan suite (58 tests across 7 files) passes with no regressions.
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_ms9dww3y_158a047f
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_ms9dxb3d_14b2a413
- **[archive_only_evidence]** decisions: Replaced IntakeResult.evidence_roles with IntakeResult.evidence carrying full OptimizationEvidence records — AC4 requires the optimizer intake to preserve the typed candidate's cited source evidence, not just role names.
- **[archive_only_evidence]** decisions: Updated text renderer to emit each evidence record as '[role] file:line — matchedSignal' — Keeps the minimal read-only output human-readable while surfacing the exact source citation and signal that triggered the candidate.
- **[archive_only_evidence]** decisions: Updated JSON renderer to include the full evidence array unchanged — JSON consumers need machine-readable access to the preserved evidence for downstream review or rendering.
- **[archive_only_evidence]** decisions: Added exact file/line assertions to acceptance and rejection tests — Ensures the remediation is locked: any future regression that drops evidence fields will fail tests.
- **[archive_only_evidence]** verification: bun test /home/jon/.local/share/opencode/worktree/bdf259aa162ae192af5b18899ccdc653b085528d/change/addOptimizationDetection/bin/lib/opt-scan/intake.test.ts (0) — 12 intake tests pass; assertions verify full evidence records (file/line/matchedSignal) are preserved on acceptance and on rejection paths.
- **[archive_only_evidence]** verification: bun test /home/jon/.local/share/opencode/worktree/bdf259aa162ae192af5b18899ccdc653b085528d/change/addOptimizationDetection/bin/lib/opt-scan/ (0) — Full opt-scan suite (58 tests across 7 files) passes with no regressions.
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_ms9e5z8i_3b3d5b38
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_ms9e6j0v_b4f2ebc1
- **[archive_only_evidence]** decisions: Defined Tron optimization-candidate schemas in plugin/src/types/subagent-reports.ts mirroring opt-scan V1 contract but omitting measured fields — Keeps the plugin schema authoritative and Zod-strict while preserving opt-scan evidence shape without cross-importing bin/lib into plugin/src
- **[archive_only_evidence]** decisions: Added a prose superRefine guard against speedup/latency/runtime-impact claims in static candidates — Enforces the task's advisory-static constraint structurally at the report ingest boundary
- **[archive_only_evidence]** decisions: Kept command/agent/skill integration read-only and optional — Tron does not run opt-scan or generate candidates; it only consumes validated static candidates supplied by the orchestrator, preserving Tron's read-only boundary
- **[archive_only_evidence]** decisions: Regenerated plugin/schemas/change.schema.json after Zod change — pnpm run schemas:check failed stale until pnpm run schemas:generate produced the updated public schema
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/adv-tron-assets.test.ts src/types/subagent-reports.test.ts src/optimized-handoff-assets.test.ts src/manifest.test.ts src/manifest-doc-drift.test.ts src/cli-surface-matrix.test.ts (0) — 149 tests pass
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/validator/clarify-readiness.test.ts src/validator/prep-readiness.test.ts src/validator/required-obligation-regression.test.ts src/validator/review-readiness.test.ts src/validator/acceptance-readiness.test.ts src/validator/release-readiness.test.ts src/validator/task-status-consistency.test.ts (0) — 93 validator tests pass
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/types/recovery-audit-roundtrip.test.ts src/subagent-reports-spec-assets.test.ts src/optimized-handoff-assets.test.ts src/skill-loading-policy-assets.test.ts (0) — 62 related tests pass
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_ms9f3to6_f3f86baf
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_ms9fh8cz_82af94f3
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_ms9fi67s_1436a5f1
- **[archive_only_evidence]** decisions: isStartupFile now tests basename(relPath) instead of the full relative path — Prevents directory names like 'worker-startup-pressure-negative' from falsely matching the startup regex
- **[archive_only_evidence]** decisions: Test artifacts are excluded in collectFiles by __tests__/__mocks__ segments and .test/.spec/.itest basenames — Keeps the deterministic scanner bounded and avoids tripping on its own tests/fixtures without pruning fixture roots
- **[archive_only_evidence]** decisions: CACHE_INVALIDATION_RE drops bare 'cache'/'memo' and keeps explicit policy vocabulary plus variants — V1 contract requires actual invalidation policy evidence; generic ownership words were inflating false positives
- **[archive_only_evidence]** verification: bun test /home/jon/.local/share/opencode/worktree/bdf259aa162ae192af5b18899ccdc653b085528d/change/addOptimizationDetection/bin/lib/opt-scan/__tests__/detectors.test.ts /home/jon/.local/share/opencode/worktree/bdf259aa162ae192af5b18899ccdc653b085528d/change/addOptimizationDetection/bin/lib/opt-scan/scan.test.ts /home/jon/.local/share/opencode/worktree/bdf259aa162ae192af5b18899ccdc653b085528d/change/addOptimizationDetection/bin/lib/opt-scan/registry.test.ts /home/jon/.local/share/opencode/worktree/bdf259aa162ae192af5b18899ccdc653b085528d/change/addOptimizationDetection/bin/lib/opt-scan/intake.test.ts /home/jon/.local/share/opencode/worktree/bdf259aa162ae192af5b18899ccdc653b085528d/change/addOptimizationDetection/bin/lib/opt-scan/bridge.test.ts /home/jon/.local/share/opencode/worktree/bdf259aa162ae192af5b18899ccdc653b085528d/change/addOptimizationDetection/bin/lib/opt-scan/schema.test.ts (0) — 59 pass, 0 fail, 223 expect() calls across 6 opt-scan test files
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_ms9hf923_0378c55e
- **[unresolved_action]** required_main_agent_actions: Create the normal task checkpoint and continue review-gate aggregation; reviewer agents cannot mutate ADV task state.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] Root-level bin/lib Bun suites are not discoverable through `bin/oc-test targeted -- bin/lib/opt-scan`, which runs Vitest from plugin/; run the scoped Bun command directly for opt-scan verification.
- **[archive_only_evidence]** changes_made: bin/lib/opt-scan/evaluator.ts: Collapsed two unreachable ternaries to typed reachable constants without changing evaluation behavior.
- **[archive_only_evidence]** changes_made: bin/lib/opt-scan/__tests__/detectors.test.ts: Added regression coverage proving sync I/O inside function and class bodies in worker.ts emits no startup-pressure candidate.
- **[archive_only_evidence]** changes_made: bin/lib/opt-scan/__tests__/fixtures/repeated-boundary-work-positive/README.md: Corrected scope and trigger line-map entries to actual fixture lines.
- **[archive_only_evidence]** changes_made: bin/lib/opt-scan/__tests__/fixtures/repeated-boundary-work-negative/README.md: Corrected rejected trigger line-map entry to actual fixture line.
- **[archive_only_evidence]** changes_made: bin/lib/opt-scan/__tests__/fixtures/avoidable-collection-work-positive/README.md: Corrected chained-call line range to actual fixture lines.
- **[archive_only_evidence]** changes_made: bin/lib/opt-scan/__tests__/fixtures/avoidable-collection-work-negative/README.md: Corrected rejected map-call line entry to actual fixture line.
- **[archive_only_evidence]** changes_made: bin/lib/opt-scan/__tests__/fixtures/worker-startup-pressure-positive/README.md: Corrected top-level sync-I/O trigger line-map entry to actual fixture line.
- **[archive_only_evidence]** changes_made: bin/lib/opt-scan/__tests__/fixtures/cache-opportunity-positive/README.md: Corrected ownership, invalidation, identity, and trigger line-map entries to actual fixture lines.
- **[archive_only_evidence]** changes_made: bin/lib/opt-scan/__tests__/fixtures/cache-opportunity-negative/README.md: Corrected rejected computation trigger line-map entry to actual fixture line.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- bin/lib/opt-scan, bun test bin/lib/opt-scan, git diff --check results=pass — The oc-test wrapper command exited 1 because its plugin/ Vitest configuration finds no bin/lib tests. The required direct command `bun test bin/lib/opt-scan` passed: 63 tests, 0 failures, 236 expectations in 487ms. `git diff --check` produced no whitespace errors.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- bin/lib/opt-scan
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bun test bin/lib/opt-scan
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check
- **[archive_only_evidence]** verification: targeted adv-tron-assets and subagent-reports suites (0) — 76 tests passed on current rebased branch
- **[archive_only_evidence]** verification: full smoke (0) — full smoke passed on current rebased branch
- **[report_follow_up]** follow_ups: Resolve unrelated trunk smoke blockers: prettier formatting in plugin/src/tools/worktree/index.ts and 3 unused eslint-disable warnings in plugin/src/utils/manifest-frontmatter.ts so bin/oc-test smoke goes green.
- **[unresolved_action]** required_main_agent_actions: Confirm whether the unrelated trunk formatting/lint warnings should be fixed in this change or handled by the existing fix-trunk-ci-repair worktree-adhoc branch before treating smoke as fully green.
- **[archive_only_evidence]** decisions: Repaired the disk-projection test harness instead of modifying spec-deltas.ts — The reported TS2304 missing-symbol failure was already resolved in the current worktree (destructure of setCachedChange/persistStateToDisk is present at spec-deltas.ts:108-114). The remaining in-scope failure was the disk-projection test mock missing persistStateToDisk, which caused a runtime TypeError when add() invoked the dependency.
- **[archive_only_evidence]** verification: pnpm --dir plugin exec vitest run src/storage/store-temporal/spec-deltas.disk-projection.test.ts (1) — Red phase: reproduced missing persistStateToDisk runtime failure in spec-delta disk-projection test harness
- **[archive_only_evidence]** verification: pnpm --dir plugin exec vitest run src/storage/store-temporal/spec-deltas.disk-projection.test.ts (0) — Green phase: disk-projection test passes after restoring persistStateToDisk mock
- **[archive_only_evidence]** verification: pnpm --dir plugin run typecheck (0) — Verify phase: tsc --noEmit passes for the storage/spec-delta surface
- **[archive_only_evidence]** verification: pnpm --dir plugin exec vitest run src/storage/store-temporal/spec-deltas.test.ts src/storage/store-temporal/spec-deltas.disk-projection.test.ts (0) — All 12 spec-delta focused tests pass
- **[archive_only_evidence]** verification: bin/oc-test smoke (1) — Smoke is currently blocked by unrelated trunk formatting issue in src/tools/worktree/index.ts and 3 lint warnings in src/utils/manifest-frontmatter.ts; these are outside the spec-delta storage scope
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_ms9jzlpi_fbe678be
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_ms9k33ox_2b4d83d8
- **[unresolved_action]** required_main_agent_actions: Task completion recording was blocked by stage-v2 evidence policy: static_check requires a reviewer-owned review_evidence_ref. The git checkpoint is committed (sha 2ff08563f7bbb323e46085915142d13add6b6e00). Please mark tk-3a27ddb19332 done with the appropriate review evidence, or route to a reviewer.
- **[archive_only_evidence]** verification: pnpm prettier --check src/tools/worktree/index.ts (0) — All matched files use Prettier code style
- **[archive_only_evidence]** verification: bin/oc-test smoke (0) — Smoke passed: 98 tests passed; 3 pre-existing eslint warnings in plugin/src/utils/manifest-frontmatter.ts only
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msajcvlq_46cf9548
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msajfl2k_b56711cd
- **[archive_only_evidence]** verification: tests_run=git show --format= --find-renames --check 2ff08563, pnpm --dir plugin exec prettier --check src/tools/worktree/index.ts, bin/oc-test smoke results=pass — Commit 2ff08563 changes only plugin/src/tools/worktree/index.ts: two TypeScript union-type line rewraps (4 additions, 2 deletions); git whitespace check passed. Exact-file Prettier check passed. Smoke completed successfully: 2 files, 98 tests passed. Smoke reported 3 nonfatal pre-existing eslint warnings in unrelated plugin/src/utils/manifest-frontmatter.ts; 0 lint errors.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git show --format= --find-renames --check 2ff08563
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir plugin exec prettier --check src/tools/worktree/index.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test smoke
- **[archive_only_evidence]** verification: tests_run=Prettier exact check: plugin/src/tools/worktree/index.ts (tr_msamr59g_ce509754), Smoke suite: 98 tests (tr_msakbjv4_ac677c83), git diff --check results=pass — Reviewer-owned static-check evidence: tr_msamr59g_ce509754 reports exact Prettier passing for plugin/src/tools/worktree/index.ts on the current rebased branch. Smoke evidence tr_msakbjv4_ac677c83 reports 98 tests passing. Local git diff --check passed; git status and file-specific numstat were empty, confirming no uncommitted non-formatting change in this task scope.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: Prettier exact check: plugin/src/tools/worktree/index.ts (tr_msamr59g_ce509754)
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: Smoke suite: 98 tests (tr_msakbjv4_ac677c83)
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check
- **[unresolved_action]** required_main_agent_actions: Task completion recording requires reviewer-owned review_evidence_ref for the stage-v2 static_check route; the orchestrator or reviewer should supply review evidence or adjust the evidence policy to mark the task done
- **[archive_only_evidence]** decisions: Removed only the unused `getChangeHandle` and `markPoisonedWorkflowForChange` imports, leaving all other imports and behavior unchanged — Scope is import-only cleanup; both symbols had no references in index.ts and are still used elsewhere in the subsystem, so they remain exported from their source modules
- **[archive_only_evidence]** verification: pnpm exec eslint src/storage/store-temporal/index.ts (0) — No ESLint errors or warnings for the modified file
- **[archive_only_evidence]** verification: bin/oc-test smoke (0) — Smoke passed: schemas:check, typecheck, manifest:check, frontmatter, test isolation, lockfile policy, lint, format:check, and 2 test files / 98 tests all green
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msapep2i_4b080af0
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msaphpau_92dfa999
- **[unresolved_action]** required_main_agent_actions: After the active peer `bin/oc-test full` completes, rerun `bin/oc-test smoke` in the change worktree and record its terminal result.
- **[unresolved_action]** required_main_agent_actions: No source changes required unless the rerun identifies a deterministic failure in the scoped file.
- **[archive_only_evidence]** verification: tests_run=pnpm exec eslint src/storage/store-temporal/index.ts, bin/oc-test smoke (120-second timeout), bin/oc-test smoke (600-second timeout), rg -n -w 'getChangeHandle|markPoisonedWorkflowForChange' plugin/src/storage/store-temporal/index.ts results=fail — Exact-file ESLint exited 0 with no output. Commit 66cc0e23 removes only `getChangeHandle` and `markPoisonedWorkflowForChange`; exact-word searches found neither symbol in index.ts. `isPoisonedWorkflowForChange` remains imported and used at lines 383, 476, and 974. First smoke run reached formatting but exceeded 120 seconds; second exceeded 600 seconds before test output. Process inspection showed an active peer `bin/oc-test full` plus fresh Temporal test-server processes.

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| AC1 | acceptance_criterion | pass |
| AC2 | acceptance_criterion | pass |
| AC3 | acceptance_criterion | pass |
| AC4 | acceptance_criterion | pass |
| AC5 | acceptance_criterion | pass |
| AC6 | acceptance_criterion | pass |
| AC7 | acceptance_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| C4 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |
| DONT4 | avoidance | respected |

## Unresolved Actions

- verification_missing: No durable adv_run_test evidence found for run_id: opt-scan-foundation-1
- verification_missing: No durable adv_run_test evidence found for run_id: opt-scan-cli-1
- verification_missing: No durable adv_run_test evidence found for run_id: opt-scan-cli-degraded-1
- verification_missing: No durable adv_run_test evidence found for run_id: tr_ms9d6ekt_b8e46a02
- verification_missing: No durable adv_run_test evidence found for run_id: tr_ms9d5hyp_f8b87920
- verification_missing: No durable adv_run_test evidence found for run_id: tr_ms9dww3y_158a047f
- verification_missing: No durable adv_run_test evidence found for run_id: tr_ms9dxb3d_14b2a413
- verification_missing: No durable adv_run_test evidence found for run_id: tr_ms9e5z8i_3b3d5b38
- verification_missing: No durable adv_run_test evidence found for run_id: tr_ms9e6j0v_b4f2ebc1
- verification_missing: No durable adv_run_test evidence found for run_id: tr_ms9f3to6_f3f86baf
- verification_missing: No durable adv_run_test evidence found for run_id: tr_ms9fh8cz_82af94f3
- verification_missing: No durable adv_run_test evidence found for run_id: tr_ms9fi67s_1436a5f1
- verification_missing: No durable adv_run_test evidence found for run_id: tr_ms9hf923_0378c55e
- Create the normal task checkpoint and continue review-gate aggregation; reviewer agents cannot mutate ADV task state.
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- bin/lib/opt-scan
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bun test bin/lib/opt-scan
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check
- Confirm whether the unrelated trunk formatting/lint warnings should be fixed in this change or handled by the existing fix-trunk-ci-repair worktree-adhoc branch before treating smoke as fully green.
- verification_missing: No durable adv_run_test evidence found for run_id: tr_ms9jzlpi_fbe678be
- verification_missing: No durable adv_run_test evidence found for run_id: tr_ms9k33ox_2b4d83d8
- Task completion recording was blocked by stage-v2 evidence policy: static_check requires a reviewer-owned review_evidence_ref. The git checkpoint is committed (sha 2ff08563f7bbb323e46085915142d13add6b6e00). Please mark tk-3a27ddb19332 done with the appropriate review evidence, or route to a reviewer.
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msajcvlq_46cf9548
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msajfl2k_b56711cd
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git show --format= --find-renames --check 2ff08563
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir plugin exec prettier --check src/tools/worktree/index.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test smoke
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: Prettier exact check: plugin/src/tools/worktree/index.ts (tr_msamr59g_ce509754)
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: Smoke suite: 98 tests (tr_msakbjv4_ac677c83)
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check
- Task completion recording requires reviewer-owned review_evidence_ref for the stage-v2 static_check route; the orchestrator or reviewer should supply review evidence or adjust the evidence policy to mark the task done
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msapep2i_4b080af0
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msaphpau_92dfa999
- After the active peer `bin/oc-test full` completes, rerun `bin/oc-test smoke` in the change worktree and record its terminal result.
- No source changes required unless the rerun identifies a deterministic failure in the scoped file.
