# Archive Briefing Digest

**Change ID:** fixChangeReadTimeouts
**Title:** Fix change read timeouts
**Status:** archived
**Generated:** 2026-08-02T23:01:34.334Z

## Identity Anchors

- CHANGE
- STATUS
- TERMINAL_GATE_SUMMARY
- Origin: discovery

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

Showing 54 of 54 durable facts.

- **[archive_only_evidence]** decisions: Bounded external-dependency enrichment with mapWithConcurrency (cap 4) and withTimeout per-item (2s) and total (5s) budgets — Prevents unbounded Promise.all of external store opens from hanging adv_change_show; timeouts degrade to same-shape warning summaries instead of failing the core read.
- **[archive_only_evidence]** decisions: Bounded clarify-readiness persistence with a 1s withTimeout wrapper in persistClarifyFindings — The read path was awaiting a disk write; a slow write now returns best-effort so the core change read is never blocked.
- **[archive_only_evidence]** decisions: Left the change.ts handler operation order unchanged and did not touch release bundle guard tasks — Task constraint: preserve timeout ordering and avoid release bundle guard changes; only internal helper budgets were added.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/external-dependency-status.test.ts src/tools/change/clarify-readiness.test.ts src/tools/change.worker-free.test.ts src/tools/change-show-enrichment.test.ts (0) — 15 tests passed: bounded external-dependency enrichment, clarify persistence timeout, worker-free core read, and change-show handler shape preservation
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/change.test.ts src/tools/status-enrich.test.ts (0) — 189 tests passed, no regressions in change or status-enrich paths
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msc17hw8_bb468de5
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msc1887f_bf5d38b3
- **[archive_only_evidence]** decisions: Centralized the loaded-bundle release preflight in plugin-bundle-manifest.ts as getPluginBundleReleasePreflightError and called it from the top of adv_change_archive's runArchive. — Reuses the existing freshness model, keeps the refusal narrow to release time, and leaves the advisory [ADV:PLUGIN_BUNDLE_STALE] system/status health output unchanged.
- **[archive_only_evidence]** verification: bash /tmp/opencode/red-preflight-run.sh (1) — red run: archive preflight test fails when the stale-bundle guard is disabled (expected failure)
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/change.test.ts --testNamePattern "AC4: blocks archive release preflight" (0) — green run: archive preflight correctly refuses a stale loaded bundle with code PLUGIN_BUNDLE_STALE_RELEASE_PREFLIGHT
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/plugin-bundle-manifest.test.ts (0) — green run: plugin-bundle-manifest preflight helper tests pass (stale/current/unknown)
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/change.test.ts --testNamePattern "adv_change_archive" (0) — green run: all 38 adv_change_archive tests pass, no regression
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_mscbonyr_709972cc
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_mscbphvh_425f6f50
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_mscbmmc0_1036d6eb
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_mscbn62g_6855ce8a
- **[archive_only_evidence]** decisions: Reused existing TemporalReadContext instead of inventing a new deadline abstraction — rq-boundedAuthoritativeRead01 already provides aggregate budget, per-member cap, circuit breaker, and hydration stats; composing subreads through it keeps the fix minimal and consistent with other bounded reads
- **[archive_only_evidence]** decisions: Wrapped subreads in a local createChangeShowSubreadRunner helper instead of spreading deadline checks inline — Keeps change.ts readable, centralizes deadline/circuit-breaker logic, and makes testing the degradation path deterministic
- **[archive_only_evidence]** verification: ../bin/oc-test targeted -- src/tools/change.test.ts src/tools/change-show-enrichment.test.ts (0) — 163 tests pass across change and change-show-enrichment suites
- **[archive_only_evidence]** verification: ../bin/oc-test smoke (0) — 98 tests pass, schemas/typecheck/lint/format:check green except pre-existing manifest-frontmatter lint warnings
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_mscb2uyv_a98d57a3
- **[archive_only_evidence]** decisions: Replaced production console.error in subread runner with logger.debug and only increment the circuit-breaker on TemporalQueryTimeoutError — Genuine fast errors (ENOENT, parse) must not be classified as unresponsive members or trip the CB; only actual timeouts degrade the aggregate read.
- **[archive_only_evidence]** decisions: Added optional persist flag to applyClarifyReadinessToChangeOutput and pass persist:false from adv_change_show — AC3 requires no Temporal mutation on the read path while preserving persistence for non-read callers.
- **[archive_only_evidence]** decisions: Aligned buildExternalDependencyStatus default per-item/total budgets to 1500ms and preserved partial results on total deadline — The 2000/5000ms inner budgets were dead inside the 1500ms adv_change_show outer cap; preserving already-satisfied deps avoids incorrectly rewriting them as warnings.
- **[archive_only_evidence]** decisions: Added omittedIds to HydrationStats and used omitted instead of boundedOmitted in the change-show subread runner — boundedOmitted was overloaded for deadline/CB omission counts; a typed omittedIds field and omitted count eliminate Record<string, unknown> drift.
- **[archive_only_evidence]** decisions: Attached hydrationStats in the artifactOnly branch before early return — The degraded-read metadata must be surfaced for artifact-only output too.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/change-show-enrichment.test.ts src/tools/external-dependency-status.test.ts src/tools/change/clarify-readiness.test.ts src/tools/change.test.ts (0) — 172 targeted tests pass after final subread timeout-vs-error fix
- **[archive_only_evidence]** verification: bin/oc-test full (0) — Full unit suite passes
- **[archive_only_evidence]** verification: pnpm run check (0) — schemas/typecheck/manifests/frontmatter/lint/format checks pass
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msce8s84_deaa7e55
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msce72jt_218bdac9
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msce20zv_6e64c796
- **[unresolved_action]** required_main_agent_actions: Remove the `[DEBUG]` console.error at plugin/src/tools/change.ts:197 before release (prod-readiness-1). One-line fix; should not require reenter.
- **[unresolved_action]** required_main_agent_actions: Decide AC3 disposition (ac3-1/ac3-2). Present the scope-drift finding to the user via Tier A inline approval per docs/scope-discovery-protocol.md: either (a) remove/defer the clarify persistence write so adv_change_show is genuinely read-only and strengthen the regression test, or (b) amend AC3 wording to permit bounded best-effort persistence.
- **[unresolved_action]** required_main_agent_actions: On approve + reenter → adv_change_reenter fromGate: design (the clarify persistence change touches Affected Components), then re-run /adv-design → /adv-prep → resume /adv-review.
- **[unresolved_action]** required_main_agent_actions: On split → adv_change_create parent_change_id: fixChangeReadTimeouts for the clarify read-path purity work, and record AC3 as fast-follow with evidence on this change.
- **[unresolved_action]** required_main_agent_actions: Fix the typed-classification defects (ac2-1, ac2-2, contract-1): classify subread failure cause, gate `deadlineExceeded` and the circuit-breaker streak on genuine timeout/abort classes only, and give `omittedIds` a declared home in the HydrationStats contract rather than shipping untyped drift through Record<string, unknown>.
- **[unresolved_action]** required_main_agent_actions: Preserve partial results in the external-dependency total-timeout path (ac1-1) so already-satisfied dependencies are not rewritten as warnings.
- **[unresolved_action]** required_main_agent_actions: Attach hydrationStats to the artifactOnly early-return branch (ac1-2).
- **[unresolved_action]** required_main_agent_actions: Add the design-mandated deterministic whole-show timeout test at the production 8000ms budget with all subreads wedged, asserting completion inside the 10s tool ceiling (ac5-1), and bring loadProposalForContext / normalize* / fileExists inside the shared deadline.
- **[unresolved_action]** required_main_agent_actions: Confirm with the user that the restart-only remediation string satisfies DONT1 (question-1).
- **[unresolved_action]** required_main_agent_actions: Do not archive until prod-readiness-1 and the AC3 disposition are resolved — acceptance gate should not complete on current evidence.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] Bounded-read wrappers that catch ALL errors conflate two different failure classes. If a subread runner records every failure as an 'unresponsive member', fast deterministic errors (ENOENT, parse failures) trip the circuit breaker and get reported as deadline/timeout degradations. Classify the error before feeding a circuit breaker or setting a `deadlineExceeded` flag — otherwise the typed classification added for diagnosability becomes actively misleading.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] A regression test asserting 'no workflow calls were made' proves nothing if the test also mocks out every code path capable of making a workflow call. When writing negative-assertion tests for a read-path purity property, verify the mock surface does not include the exact function under suspicion — the assertion must be able to fail.
- **[wisdom_candidate]** wisdom_candidates: [pattern] Stale-bundle detection: emit an opaque generation token BEFORE bundling, embed it into the bundle via a build-time `define`, and record it in an atomic sidecar manifest written LAST (temp+rename). Compare embedded-vs-manifest generation at runtime. File content hashes stay diagnostic-only — generation equality is the staleness authority. This survives mtime-preserving deploys, which mtime comparison does not.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] Nested timeout budgets silently become dead code. If an inner function defaults to a 5000ms total budget but every caller wraps it in a 1500ms cap, the inner degraded-result path is unreachable and its structured output shape never surfaces. When adding an outer bound, check whether it invalidates an inner one and either thread the remaining budget down or delete the inner layer.
- **[unresolved_action]** scope_drift: finish_owned_scope_then_report: AC3 requires routine change reads to issue no workflow queries or signals. `adv_change_show` still reaches `persistClarifyFindings`, which calls `store.changes.get()` + `store.changes.save()` — a Temporal mutation on a read path. The change bounded this to 1000ms rather than removing it. C4 ('must not ADD workflow signals or Temporal mutations to routine read paths') is not literally violated because the write pre-dates this change, but AC3 asserts a post-change property that is unmet. Closing AC3 requires changing clarify-findings persistence semantics (making show read-only, or relocating persistence to a mutation path) — a behavior change to a subsystem the agreement does not enumerate under Affected Components. Review was read-only per spawn scope; no edits were applied.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/tools/change-show-enrichment.test.ts src/plugin-bundle-manifest.test.ts src/tools/change/clarify-readiness.test.ts src/tools/external-dependency-status.test.ts, bin/oc-test targeted -- src/tools/change.test.ts, pnpm run lint results=pass — Focused enrichment/manifest suites: 4 files, 40 tests passed (6.12s). change.test.ts: 1 file, 159 tests passed (12.71s). `pnpm run lint`: 0 errors, 3 pre-existing warnings in src/utils/manifest-frontmatter.ts (untouched by this change). All existing assertions are green — the blocking findings are correctness/coverage gaps the current suite does not assert, not test failures. Separately, `adv_change_show` with include flags returned ToolExecutionTimeout against the deployed (pre-fix) bundle during this review, reproducing the change's originating symptom; the fix is not yet deployed so this is not evidence against the branch.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tools/change-show-enrichment.test.ts src/plugin-bundle-manifest.test.ts src/tools/change/clarify-readiness.test.ts src/tools/external-dependency-status.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tools/change.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm run lint
- **[archive_only_evidence]** verification: tests_run=git diff --check trunk...HEAD, bin/oc-test targeted -- src/tools/change-show-enrichment.test.ts src/tools/change/clarify-readiness.test.ts src/tools/external-dependency-status.test.ts src/tools/change.test.ts results=pass — Diff is whitespace-clean and targeted suite passed: 4 files, 172 tests, exit 0 (6.82s). Source review confirms: read-path clarify calls use persist:false; circuit breaker records only TemporalQueryTimeoutError; omittedIds is typed separately from boundedOmitted; artifactOnly writes hydrationStats before returning; dependency deadline preserves assigned results; and the 8s fake-timer regression test exists.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check trunk...HEAD
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tools/change-show-enrichment.test.ts src/tools/change/clarify-readiness.test.ts src/tools/external-dependency-status.test.ts src/tools/change.test.ts

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| SC1 | success_criterion | pass |
| SC2 | success_criterion | pass |
| AC1 | acceptance_criterion | pass |
| AC2 | acceptance_criterion | pass |
| AC3 | acceptance_criterion | pass |
| AC4 | acceptance_criterion | pass |
| AC5 | acceptance_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| C4 | constraint | respected |
| DONT1 | avoidance | respected |

## Unresolved Actions

- verification_missing: No durable adv_run_test evidence found for run_id: tr_msc17hw8_bb468de5
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msc1887f_bf5d38b3
- verification_missing: No durable adv_run_test evidence found for run_id: tr_mscbonyr_709972cc
- verification_missing: No durable adv_run_test evidence found for run_id: tr_mscbphvh_425f6f50
- verification_missing: No durable adv_run_test evidence found for run_id: tr_mscbmmc0_1036d6eb
- verification_missing: No durable adv_run_test evidence found for run_id: tr_mscbn62g_6855ce8a
- verification_missing: No durable adv_run_test evidence found for run_id: tr_mscb2uyv_a98d57a3
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msce8s84_deaa7e55
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msce72jt_218bdac9
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msce20zv_6e64c796
- Remove the `[DEBUG]` console.error at plugin/src/tools/change.ts:197 before release (prod-readiness-1). One-line fix; should not require reenter.
- Decide AC3 disposition (ac3-1/ac3-2). Present the scope-drift finding to the user via Tier A inline approval per docs/scope-discovery-protocol.md: either (a) remove/defer the clarify persistence write so adv_change_show is genuinely read-only and strengthen the regression test, or (b) amend AC3 wording to permit bounded best-effort persistence.
- On approve + reenter → adv_change_reenter fromGate: design (the clarify persistence change touches Affected Components), then re-run /adv-design → /adv-prep → resume /adv-review.
- On split → adv_change_create parent_change_id: fixChangeReadTimeouts for the clarify read-path purity work, and record AC3 as fast-follow with evidence on this change.
- Fix the typed-classification defects (ac2-1, ac2-2, contract-1): classify subread failure cause, gate `deadlineExceeded` and the circuit-breaker streak on genuine timeout/abort classes only, and give `omittedIds` a declared home in the HydrationStats contract rather than shipping untyped drift through Record<string, unknown>.
- Preserve partial results in the external-dependency total-timeout path (ac1-1) so already-satisfied dependencies are not rewritten as warnings.
- Attach hydrationStats to the artifactOnly early-return branch (ac1-2).
- Add the design-mandated deterministic whole-show timeout test at the production 8000ms budget with all subreads wedged, asserting completion inside the 10s tool ceiling (ac5-1), and bring loadProposalForContext / normalize* / fileExists inside the shared deadline.
- Confirm with the user that the restart-only remediation string satisfies DONT1 (question-1).
- Do not archive until prod-readiness-1 and the AC3 disposition are resolved — acceptance gate should not complete on current evidence.
- finish_owned_scope_then_report: AC3 requires routine change reads to issue no workflow queries or signals. `adv_change_show` still reaches `persistClarifyFindings`, which calls `store.changes.get()` + `store.changes.save()` — a Temporal mutation on a read path. The change bounded this to 1000ms rather than removing it. C4 ('must not ADD workflow signals or Temporal mutations to routine read paths') is not literally violated because the write pre-dates this change, but AC3 asserts a post-change property that is unmet. Closing AC3 requires changing clarify-findings persistence semantics (making show read-only, or relocating persistence to a mutation path) — a behavior change to a subsystem the agreement does not enumerate under Affected Components. Review was read-only per spawn scope; no edits were applied.
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tools/change-show-enrichment.test.ts src/plugin-bundle-manifest.test.ts src/tools/change/clarify-readiness.test.ts src/tools/external-dependency-status.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tools/change.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm run lint
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check trunk...HEAD
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tools/change-show-enrichment.test.ts src/tools/change/clarify-readiness.test.ts src/tools/external-dependency-status.test.ts src/tools/change.test.ts
