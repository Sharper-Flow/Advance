# Archive Briefing Digest

**Change ID:** makeToolReadsWorkerFree
**Title:** Make tool reads worker free
**Status:** archived
**Generated:** 2026-07-29T18:18:22.143Z

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

Showing 71 of 71 durable facts.

- **[archive_only_evidence]** decisions: Removed all workflow handle/query construction from adv_gate_status — AC1 requires gate status to be a durable-projection read; querying a live workflow defeats worker-free operation and is unnecessary because change.gates, directive derivation, and next-action can all be computed from the persisted projection.
- **[archive_only_evidence]** decisions: Removed getGateCriteriaQuery and getAcceptanceCriteriaProjectionQuery imports from gate.ts — These queries were only consumed by adv_gate_status; removing them resolves lint errors after the handler became projection-only.
- **[archive_only_evidence]** decisions: Removed isPoisonedHistoryError and isWorkflowCompletedError imports from gate.ts — The poisoned-history fallback path in adv_gate_status was part of the workflow-query branch and is no longer reachable.
- **[archive_only_evidence]** decisions: Added typed _unavailable markers for gateCriteria and acceptanceCriteriaProjection — AC2 requires truthful incompleteness; these fields are workflow-only and not persisted in the durable change snapshot, so absence must be reported explicitly rather than treated as a pass or silently omitted.
- **[archive_only_evidence]** decisions: Updated existing gate.test.ts and gate.acceptance-criteria-projection.test.ts to match worker-free semantics — Preserving test greenness while reflecting the new contract; removed assertions that expected workflow overrides or poisoned-recovery annotations, replaced with assertions that no query occurs and disk projection is authoritative.
- **[archive_only_evidence]** decisions: Created a new focused test file gate.worker-free.test.ts — Provides standalone AC1/AC2 evidence without mixing with legacy signal-driven gate-completion tests.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/gate.worker-free.test.ts (1) — RED — 3/3 focused worker-free tests failed as expected: querySignal was called 3 times, workflow gates overrode disk, _unavailable marker absent
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/gate.worker-free.test.ts (0) — GREEN — 3/3 focused worker-free tests pass: no workflow queries, disk gates returned, unavailable markers emitted for gateCriteria and acceptanceCriteriaProjection
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/gate.test.ts src/tools/gate.worker-free.test.ts src/tools/gate-status-fail-closed.test.ts src/tools/gate.acceptance-criteria-projection.test.ts src/tools/gate.release-enforcement.test.ts (0) — GREEN — 84/84 gate-related tests pass after updating legacy workflow-dependent assertions
- **[archive_only_evidence]** verification: pnpm run check (0) — GREEN — schemas:check, typecheck, manifest:check, frontmatter, test-isolation, lockfile, lint, and format:check all pass (3 pre-existing warnings only)
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: red-gate-worker-free-tk-73d61d1ed2d6-a2
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: green-gate-worker-free-tk-73d61d1ed2d6-a2
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: green-gate-main-tk-73d61d1ed2d6-a2
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: check-tk-73d61d1ed2d6-a2
- **[archive_only_evidence]** decisions: Created a dedicated change.worker-free.test.ts for AC3 instead of appending to the large change.test.ts — Keeps worker-free evidence focused and readable; avoids mixing with signal-driven lifecycle tests.
- **[archive_only_evidence]** decisions: Implemented the structural guard as a test-owned source-boundary scanner in worker-free-read-guard.test.ts — The design explicitly calls for a single test-owned allow/deny map scoped to routine read handler blocks, so mutation handlers in the same file keep using workflow queries/signals.
- **[archive_only_evidence]** decisions: Scoped guard boundaries to handler blocks between tool-definition markers — gate.ts and change.ts are mixed read+mutation modules; whole-file scanning would false-positive on mutation helpers.
- **[archive_only_evidence]** decisions: Left Epic entries out of the enforced guard map for now — Epic worker-free separation is the scope of the next task (tk-32c46f200d30); adding adv_epic_list/adv_epic_show boundaries now would fail because those handlers still invoke live convergence/retirement evaluation.
- **[archive_only_evidence]** verification: ../bin/oc-test targeted -- src/tools/change.worker-free.test.ts src/tools/worker-free-read-guard.test.ts src/cli-bridge-contract.test.ts (1) — RED — worker-free guard test failed because REPO_ROOT resolved one directory too shallow; change.worker-free tests passed (20/20), CLI regression passed
- **[archive_only_evidence]** verification: ../bin/oc-test targeted -- src/tools/change.worker-free.test.ts src/tools/worker-free-read-guard.test.ts src/cli-bridge-contract.test.ts (0) — GREEN — all 24 targeted tests pass after fixing REPO_ROOT to repo root
- **[archive_only_evidence]** verification: ../bin/oc-test targeted -- src/tools/change.test.ts src/tools/gate.test.ts src/tools/gate.worker-free.test.ts src/tools/gate.acceptance-criteria-projection.test.ts src/tools/gate-status-fail-closed.test.ts src/tools/gate.release-enforcement.test.ts src/tools/change.worker-free.test.ts src/tools/worker-free-read-guard.test.ts src/cli-bridge-contract.test.ts (0) — GREEN — 260/260 change, gate, and CLI regression tests pass
- **[archive_only_evidence]** verification: pnpm run check (0) — GREEN — schemas:check, typecheck, manifest:check, frontmatter, test-isolation, lockfile, lint (0 errors, 3 pre-existing warnings), and format:check all pass
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: red-worker-free-guard-tk-ba36f4d47889-a1
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: green-worker-free-guard-tk-ba36f4d47889-a1
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: regression-change-gate-cli-tk-ba36f4d47889-a1
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: check-tk-ba36f4d47889-a1
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/change.worker-free.test.ts src/tools/worker-free-read-guard.test.ts src/cli-bridge-contract.test.ts (0) — 3 test files passed, 26 tests passed (targeted worker-free change/guard + CLI bridge regression)
- **[archive_only_evidence]** decisions: Render Epic projection facts before advisory convergence in adv_epic_show — AC4 requires base read to succeed without a live workflow. Retired snapshots skip convergence; active Epics attempt convergence only after the base render is available, so convergence failure cannot block the projection read.
- **[archive_only_evidence]** decisions: Wrap convergeEpicOnShow in try/catch and emit _unavailable marker on global unreachability — Convergence is advisory. If the live change workflow is globally unreachable (no poller, deadline, etc.), the handler returns the base Epic with a typed _unavailable scope/reason instead of failing or silently omitting facts.
- **[archive_only_evidence]** decisions: Rethrow global workflow unreachability from convergeEpicOnShow instead of masking as per-entry target_unreachable — Per-entry unreachability is a normal degraded state; global unavailability (service down, no poller, deadline) must surface explicitly so adv_epic_show can report it without blocking the base read.
- **[archive_only_evidence]** decisions: Return success:false with code epic_retirement_unavailable for status=completed when live evaluation is unreachable — AC4 requires completed-candidate dry-run evaluation to return explicit non-success when its live Epic workflow is unreachable, never an empty-success report.
- **[archive_only_evidence]** decisions: Preserve existing dry-run retire semantics for reachable workflows — The completed-candidate report remains a non-mutating evaluation; only global unavailability changes the response shape.
- **[archive_only_evidence]** decisions: Extend worker-free-read-guard.test.ts with adv_epic_list/adv_epic_show boundaries — AC5 requires a single shared structural guard for routine host-tool read paths; Epic handlers are now projection-first and contain no workflow-query constructs in their handler blocks.
- **[archive_only_evidence]** decisions: Create dedicated epic.worker-free.test.ts instead of appending to epic.test.ts — Keeps AC4/AC5 evidence focused and readable; avoids mixing with signal-driven Epic mutation tests.
- **[archive_only_evidence]** verification: ../bin/oc-test targeted -- src/tools/epic.worker-free.test.ts src/tools/worker-free-read-guard.test.ts src/tools/epic.test.ts src/tools/epic-convergence.test.ts (0) — GREEN — 107/107 Epic, convergence, and worker-free guard tests pass
- **[archive_only_evidence]** verification: ../bin/oc-test targeted -- src/tools/epic.worker-free.test.ts src/tools/worker-free-read-guard.test.ts src/tools/epic.test.ts src/tools/change.worker-free.test.ts src/tools/gate.worker-free.test.ts src/tools/gate.test.ts src/tools/change.test.ts src/cli-bridge-contract.test.ts (0) — GREEN — 326/326 focused worker-free and regression tests pass
- **[archive_only_evidence]** verification: ../bin/oc-test targeted -- src/utils/tool-arg-preflight.test.ts src/tools/tool-registry.surface.test.ts src/advance-epics-assets.test.ts src/adv-triage-portfolio-assets.test.ts src/tools/epic.worker-free.test.ts src/tools/worker-free-read-guard.test.ts src/tools/epic.test.ts src/tools/epic-convergence.test.ts (0) — GREEN — 267/267 Epic tool surface, assets, and preflight tests pass
- **[archive_only_evidence]** verification: pnpm run check (0) — GREEN — schemas:check, typecheck, manifest:check, frontmatter, test-isolation, lockfile, lint (0 errors, 3 pre-existing warnings), and format:check all pass
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: green-epic-worker-free-tk-32c46f200d30-a1
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: green-epic-focused-regression-tk-32c46f200d30-a1
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: green-epic-assets-preflight-tk-32c46f200d30-a1
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: check-tk-32c46f200d30-a1
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/epic.worker-free.test.ts src/tools/worker-free-read-guard.test.ts (0) — 13/13 Epic worker-free and worker-free read guard tests pass
- **[report_follow_up]** follow_ups: Packet omitted TASK_SCOPE, IN_SCOPE, OUT_OF_SCOPE, DONE_WHEN, STOP_WHEN, and VERIFICATION anchors; scope was taken from TASK only, per packet-defect protocol.
- **[report_follow_up]** follow_ups: I do not know whether the planned typed gate-status degradation schema already has a contract in the change design because that artifact was not supplied in the packet; define and test it before implementation.
- **[research_citation]** sources: Temporal TypeScript SDK documentation: Workflow queries are routed to a worker replay path; WorkflowClient.list uses Visibility query filters and execution search attributes. (https://github.com/temporalio/sdk-typescript/blob/main/packages/client/src/workflow-client.ts)
- **[research_citation]** sources: Current CLI worker-free implementation: Status derives active summaries from Visibility attributes, lists running project workflows, and throws for caller fail-closed handling. (file:///home/jon/dev/advance/bin/lib/live-status.ts#L125-L344)
- **[research_citation]** sources: Current gate-status implementation: Gate status loads the change projection then unconditionally queries gate, criterion, and acceptance projections when Temporal is available. (file:///home/jon/dev/advance/plugin/src/tools/gate.ts#L1294-L1458)
- **[research_citation]** sources.omitted: 2 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: CAUTION. Projection-first adv_gate_status is the correct boring design: it can return the durable change projection already loaded at plugin/src/tools/gate.ts:1298-1310 and avoid worker-routed queries. Current code then issues getGateStatus, getGateCriteria, and getAcceptanceCriteriaProjection queries at lines 1328-1352, so no-worker reads still fail outside the narrow poison/completed fallback at lines 1353-1372. Preserve change list/show behavior: list uses listSummary/list at plugin/src/tools/change.ts:1087-1104 and show uses changes.get at lines 1402-1417; neither should be re-routed through new query helpers. Keep Epic list completed as the existing dry-run retirement-candidate report, not a terminal-history list: plugin/src/tools/epic.ts:1320-1391 calls retire({dryRun:true}) and tests pin candidates plus blocked entries at plugin/src/tools/epic.test.ts:2640-2748. Keep Epic-show convergence bounded to same-project active Epics; cross-project entries are skipped and retired projections are read-only at plugin/src/tools/epic.ts:977-987 and 1222-1227. CLI status primary-read failure is already fail-closed at bin/adv:139-203; optional resume enrichment is bounded and rendered with explicit completeness at bin/lib/optional-enrichment.ts:1-67 and bin/lib/resume-projection-state.ts:21-94. Sources: https://github.com/temporalio/sdk-typescript/blob/main/packages/client/src/workflow-client.ts ; file:///home/jon/dev/advance/plugin/src/tools/gate.ts#L1294-L1458 ; file:///home/jon/dev/advance/plugin/src/tools/change.ts#L1087-L1104 ; file:///home/jon/dev/advance/plugin/src/tools/epic.ts#L1222-L1391 ; file:///home/jon/dev/advance/bin/adv#L139-L203.
- **[unresolved_action]** required_main_agent_actions: Record this AC1–AC6 review evidence in acceptance processing.
- **[unresolved_action]** required_main_agent_actions: Before merge/release, bring the change worktree current with origin/trunk and rerun applicable verification.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/tools/gate.worker-free.test.ts src/tools/gate.acceptance-criteria-projection.test.ts src/tools/change.worker-free.test.ts src/tools/epic.worker-free.test.ts src/tools/worker-free-read-guard.test.ts src/tools/epic.test.ts src/tools/epic-convergence.test.ts src/cli-bridge-contract.test.ts results=pass — 139/139 focused tests passed. AC1: gate status uses persisted gates/nextGate without workflow handle/query. AC2: gateCriteria and acceptanceCriteriaProjection return typed _unavailable reasons. AC3: archived list and degraded-summary fixtures preserve rows or warnings/hydration metadata. AC4: Epic projection rendering remains available; completed-candidate evaluation returns success:false / epic_retirement_unavailable and show reports membership_convergence unavailable. AC5: shared guard covers change list/show, gate status, Epic list/show and focused unreachable-worker tests pass. AC6: cli-bridge-contract test remains green; diff does not alter bin/ CLI code.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tools/gate.worker-free.test.ts src/tools/gate.acceptance-criteria-projection.test.ts src/tools/change.worker-free.test.ts src/tools/epic.worker-free.test.ts src/tools/worker-free-read-guard.test.ts src/tools/epic.test.ts src/tools/epic-convergence.test.ts src/cli-bridge-contract.test.ts
- **[unresolved_action]** required_main_agent_actions: Release blocker: classify the 56 full-suite failures from the post-rebase branch, beginning with store-temporal projection/read-model expectation mismatches, and remediate only if within approved scope.
- **[unresolved_action]** required_main_agent_actions: After remediation or an evidence-backed baseline reconciliation, rerun `bin/oc-test full` to terminal green before completing release.
- **[unresolved_action]** required_main_agent_actions: Executive release-readiness summary: focused worker-free behavior, structural guard, and CLI fail-closed regression are green; static checks/build are green; release remains NOT READY because full regression is red/incomplete. Leave the CLI Visibility-only active-row boundary and unrelated production files unchanged pending failure classification.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] `bin/oc-test targeted` runs Vitest from `plugin/`; targeted paths must be `src/...`, not `plugin/src/...`, or Vitest returns "No test files found".
- **[archive_only_evidence]** verification: tests_run=oc-fresh status --repo /home/jon/.local/share/opencode/worktree/bdf259aa162ae192af5b18899ccdc653b085528d/change/makeToolReadsWorkerFree --json, bin/oc-test targeted -- src/tools/change.worker-free.test.ts src/tools/epic.worker-free.test.ts src/tools/gate.worker-free.test.ts src/tools/worker-free-read-guard.test.ts src/tools/gate.acceptance-criteria-projection.test.ts src/tools/gate.test.ts src/cli-bridge-contract.test.ts, bun test bin/lib/dead-worker-query-paths.test.ts, pnpm run check && pnpm run build, bin/oc-test full, git diff --check origin/trunk...HEAD results=fail — Fresh, clean worktree at review start (behind=0). Focused affected suite: 100/100 passed. CLI dead-worker/fail-closed boundary: 4/4 passed. `pnpm run check` and `pnpm run build` passed (three pre-existing lint warnings only). First `bin/oc-test full` completed with 56 failed / 7881 passed / 1 skipped across 546 files; failures include store-temporal read-model expectation mismatches and unrelated asset/integration checks. After worker build, a second full run did not reach a terminal result before the 20-minute command timeout. `git diff --check` and worktree status were clean.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: oc-fresh status --repo /home/jon/.local/share/opencode/worktree/bdf259aa162ae192af5b18899ccdc653b085528d/change/makeToolReadsWorkerFree --json
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tools/change.worker-free.test.ts src/tools/epic.worker-free.test.ts src/tools/gate.worker-free.test.ts src/tools/worker-free-read-guard.test.ts src/tools/gate.acceptance-criteria-projection.test.ts src/tools/gate.test.ts src/cli-bridge-contract.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bun test bin/lib/dead-worker-query-paths.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm run check && pnpm run build
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test full
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check origin/trunk...HEAD
- **[unresolved_action]** required_main_agent_actions: Release-readiness summary: READY for the clean post-rebase branch delta; no branch-specific blocker identified in worker-free reads or known gate failure/projection paths.
- **[unresolved_action]** required_main_agent_actions: Preserve the baseline/full-suite caveat in release evidence; run the normal broader CI/release verification outside this scoped reharden when required by the release gate.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- plugin/src/tools/change.worker-free.test.ts plugin/src/tools/epic.worker-free.test.ts plugin/src/tools/gate.worker-free.test.ts plugin/src/tools/worker-free-read-guard.test.ts plugin/src/tools/gate.acceptance-criteria-projection.test.ts plugin/src/tools/gate.test.ts (path filter was rejected because the wrapper runs from plugin/), bin/oc-test targeted -- src/tools/change.worker-free.test.ts src/tools/epic.worker-free.test.ts src/tools/gate.worker-free.test.ts src/tools/worker-free-read-guard.test.ts src/tools/gate.acceptance-criteria-projection.test.ts src/tools/gate.test.ts, git diff --check origin/trunk...HEAD results=pass — After correcting the wrapper-relative test paths, focused worker-free and gate failure/projection regression suite passed: 6 files, 86 tests, exit 0. `git diff --check origin/trunk...HEAD` passed; working tree remained clean. Branch is current against origin/trunk (behind=0).
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- plugin/src/tools/change.worker-free.test.ts plugin/src/tools/epic.worker-free.test.ts plugin/src/tools/gate.worker-free.test.ts plugin/src/tools/worker-free-read-guard.test.ts plugin/src/tools/gate.acceptance-criteria-projection.test.ts plugin/src/tools/gate.test.ts (path filter was rejected because the wrapper runs from plugin/)
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tools/change.worker-free.test.ts src/tools/epic.worker-free.test.ts src/tools/gate.worker-free.test.ts src/tools/worker-free-read-guard.test.ts src/tools/gate.acceptance-criteria-projection.test.ts src/tools/gate.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check origin/trunk...HEAD

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| AC1 | acceptance_criterion | pass |
| AC2 | acceptance_criterion | pass |
| AC3 | acceptance_criterion | pass |
| AC4 | acceptance_criterion | pass |
| AC5 | acceptance_criterion | pass |
| AC6 | acceptance_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| C4 | constraint | respected |

## Unresolved Actions

- verification_missing: No durable adv_run_test evidence found for run_id: red-gate-worker-free-tk-73d61d1ed2d6-a2
- verification_missing: No durable adv_run_test evidence found for run_id: green-gate-worker-free-tk-73d61d1ed2d6-a2
- verification_missing: No durable adv_run_test evidence found for run_id: green-gate-main-tk-73d61d1ed2d6-a2
- verification_missing: No durable adv_run_test evidence found for run_id: check-tk-73d61d1ed2d6-a2
- verification_missing: No durable adv_run_test evidence found for run_id: red-worker-free-guard-tk-ba36f4d47889-a1
- verification_missing: No durable adv_run_test evidence found for run_id: green-worker-free-guard-tk-ba36f4d47889-a1
- verification_missing: No durable adv_run_test evidence found for run_id: regression-change-gate-cli-tk-ba36f4d47889-a1
- verification_missing: No durable adv_run_test evidence found for run_id: check-tk-ba36f4d47889-a1
- verification_missing: No durable adv_run_test evidence found for run_id: green-epic-worker-free-tk-32c46f200d30-a1
- verification_missing: No durable adv_run_test evidence found for run_id: green-epic-focused-regression-tk-32c46f200d30-a1
- verification_missing: No durable adv_run_test evidence found for run_id: green-epic-assets-preflight-tk-32c46f200d30-a1
- verification_missing: No durable adv_run_test evidence found for run_id: check-tk-32c46f200d30-a1
- Record this AC1–AC6 review evidence in acceptance processing.
- Before merge/release, bring the change worktree current with origin/trunk and rerun applicable verification.
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tools/gate.worker-free.test.ts src/tools/gate.acceptance-criteria-projection.test.ts src/tools/change.worker-free.test.ts src/tools/epic.worker-free.test.ts src/tools/worker-free-read-guard.test.ts src/tools/epic.test.ts src/tools/epic-convergence.test.ts src/cli-bridge-contract.test.ts
- Release blocker: classify the 56 full-suite failures from the post-rebase branch, beginning with store-temporal projection/read-model expectation mismatches, and remediate only if within approved scope.
- After remediation or an evidence-backed baseline reconciliation, rerun `bin/oc-test full` to terminal green before completing release.
- Executive release-readiness summary: focused worker-free behavior, structural guard, and CLI fail-closed regression are green; static checks/build are green; release remains NOT READY because full regression is red/incomplete. Leave the CLI Visibility-only active-row boundary and unrelated production files unchanged pending failure classification.
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: oc-fresh status --repo /home/jon/.local/share/opencode/worktree/bdf259aa162ae192af5b18899ccdc653b085528d/change/makeToolReadsWorkerFree --json
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tools/change.worker-free.test.ts src/tools/epic.worker-free.test.ts src/tools/gate.worker-free.test.ts src/tools/worker-free-read-guard.test.ts src/tools/gate.acceptance-criteria-projection.test.ts src/tools/gate.test.ts src/cli-bridge-contract.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bun test bin/lib/dead-worker-query-paths.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm run check && pnpm run build
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test full
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check origin/trunk...HEAD
- Release-readiness summary: READY for the clean post-rebase branch delta; no branch-specific blocker identified in worker-free reads or known gate failure/projection paths.
- Preserve the baseline/full-suite caveat in release evidence; run the normal broader CI/release verification outside this scoped reharden when required by the release gate.
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- plugin/src/tools/change.worker-free.test.ts plugin/src/tools/epic.worker-free.test.ts plugin/src/tools/gate.worker-free.test.ts plugin/src/tools/worker-free-read-guard.test.ts plugin/src/tools/gate.acceptance-criteria-projection.test.ts plugin/src/tools/gate.test.ts (path filter was rejected because the wrapper runs from plugin/)
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tools/change.worker-free.test.ts src/tools/epic.worker-free.test.ts src/tools/gate.worker-free.test.ts src/tools/worker-free-read-guard.test.ts src/tools/gate.acceptance-criteria-projection.test.ts src/tools/gate.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check origin/trunk...HEAD
