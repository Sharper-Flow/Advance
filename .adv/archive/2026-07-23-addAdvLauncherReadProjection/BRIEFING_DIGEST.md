# Archive Briefing Digest

**Change ID:** addAdvLauncherReadProjection
**Title:** Add ADV launcher read projection
**Status:** archived
**Generated:** 2026-07-23T19:10:47.451Z

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

Epic: systemizeAdvOrchestration · Add ADV launcher read projection (order 14)

## Durable Facts

Showing 52 of 52 durable facts.

- **[archive_only_evidence]** decisions: Implemented a pure, read-only aggregator with no Temporal/ADV imports — Scope requires the module to be testable in isolation and only return an in-memory projection; the caller writes the aggregate later.
- **[archive_only_evidence]** decisions: Normalized legacy 'active'/'pending' statuses to 'draft' — Spec notes legacy values map to draft, and active filter depends on draft status.
- **[archive_only_evidence]** decisions: Capped changes at 50 and set active_count to the bounded array length — Output-shape comment says active_count is changes.length; bounded list matches the 50-item cap.
- **[archive_only_evidence]** decisions: Used z.record(z.string(), z.unknown()) and an explicit Dirent type — Project uses Zod v4 (two-arg record) and Node typings that diverge when using ReturnType<typeof readdir>.
- **[archive_only_evidence]** verification: pnpm exec vitest run --project unit src/storage/launcher-projection.test.ts (1) — RED: test suite failed because ./launcher-projection module was missing
- **[archive_only_evidence]** verification: pnpm exec vitest run --project unit src/storage/launcher-projection.test.ts (0) — GREEN: 12 tests passed
- **[archive_only_evidence]** verification: pnpm run typecheck (0) — TypeScript typecheck passed
- **[archive_only_evidence]** verification: pnpm exec prettier --check src/storage/launcher-projection.ts src/storage/launcher-projection.test.ts (0) — Prettier formatting check passed
- **[archive_only_evidence]** verification: pnpm exec eslint src/storage/launcher-projection.ts src/storage/launcher-projection.test.ts (0) — ESLint passed
- **[archive_only_evidence]** decisions: Implemented adv_launcher_projection_rebuild as a plugin-only MCP tool — Task requirement: reachable only via the plugin, never from bin/adv; uses disk-only buildLauncherProjection + atomicWriteFile with no Temporal dependency
- **[archive_only_evidence]** decisions: Resolved externalRoot via getProjectId(store.paths.root) + getExternalRoot(projectId) — Follows the established tool pattern and task requirement; returns a clear error if project identity cannot be resolved
- **[archive_only_evidence]** decisions: Classified the tool as operator-only in tool-role-policy.ts and added docs/tool-ownership.md row — Rebuilding the aggregate projection is a maintenance/cache refresh action with external-state blast radius; required by tool-role-policy.test.ts and ownership matrix parity tests
- **[archive_only_evidence]** decisions: Updated tool-title.ts, cli-bridge-contract snapshot, and tool-registry.inventory baseline — Project's deterministic inventory/title parity tests enforce exact coverage for every ADV_TOOL_NAMES addition
- **[archive_only_evidence]** verification: npx vitest run src/tools/launcher-projection.test.ts (1) — RED: tool module missing, test failed before implementation
- **[archive_only_evidence]** verification: npx vitest run src/tools/launcher-projection.test.ts (0) — GREEN: adv_launcher_projection_rebuild regenerates active-launcher-state.json from seeded changes dir
- **[archive_only_evidence]** verification: pnpm run typecheck (0) — TypeScript typecheck clean
- **[archive_only_evidence]** verification: bun test bin/lib/cli-source-boundary.test.ts (0) — bin/adv source boundary remains green; new tool is plugin-only
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: bash-red-launcher-projection-tool
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: bash-green-launcher-projection-tool
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: bash-typecheck-launcher-projection
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: bash-cli-source-boundary-launcher-projection
- **[archive_only_evidence]** decisions: Imported buildLauncherProjection into activities.ts — Activities are host-side I/O and not part of the workflow bundle root, so importing a storage module is allowed by the project boundary rules
- **[archive_only_evidence]** decisions: Made aggregate write best-effort with try/catch and structured warn log — Per the task invariant, aggregate failure must not fail the authoritative per-change projection write or alter the activity return value; preserves workflow determinism
- **[archive_only_evidence]** decisions: Used logger.warn('launcher-projection-aggregate-failed', ...) — Mirrors the existing 'change-projection-failed' structured warning style in the workflow layer
- **[archive_only_evidence]** verification: npx vitest run src/temporal/activities.disk-projection.test.ts (1) — RED: new aggregate tests failed as expected before implementation
- **[archive_only_evidence]** verification: npx vitest run src/temporal/activities.disk-projection.test.ts (0) — GREEN: all 7 tests pass including aggregate write and best-effort failure tests
- **[archive_only_evidence]** verification: pnpm run typecheck (0) — TypeScript typecheck clean
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: bash-red-activities-disk-projection
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: bash-green-activities-disk-projection
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: bash-typecheck-activities
- **[archive_only_evidence]** decisions: Combined SC1/SC2/SC3 into a single sequential itest using withTimeSkippingTestWorkflowEnvironment and the required Worker registration — Matches task requirement to verify signal-driven write, direct disk read, and archive exclusion in one scenario; keeps the test focused and avoids redundant Temporal startup
- **[archive_only_evidence]** decisions: Used empty archiveProjects in ChangeWorkflowInput to avoid real git worktree/projection-proof requirements — The test scope is the launcher aggregate, not the archive activity; empty archiveProjects lets runArchiveActivity return early and still triggers the terminal-state projection write
- **[archive_only_evidence]** verification: pnpm exec vitest run --project temporal src/storage/launcher-projection.itest.ts (0) — 1 test passed: signal-driven aggregate regeneration with Temporal; per-change projection + active-launcher-state.json written, direct disk read verified, archive exclusion verified
- **[archive_only_evidence]** verification: pnpm run typecheck (0) — TypeScript typecheck clean
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: manual-tk-940495b9ba78-20260723-142832
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: manual-tk-940495b9ba78-20260723-142850
- **[archive_only_evidence]** decisions: Used source-string assertions instead of AST parsing for the guard test — Robust enough for a static_check guard: the activity proxy destructuring and disallowed names are exact string matches; an AST approach would add complexity without improving signal for this invariant
- **[archive_only_evidence]** verification: pnpm exec vitest run --project unit src/temporal/workflow-call-sequence.guard.test.ts (0) — 1 test passed: workflows.ts contains no launcher-aggregate activity references and the activity proxy still only exposes the four pre-existing projection activities
- **[archive_only_evidence]** verification: pnpm run typecheck (0) — TypeScript typecheck clean
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: manual-tk-f53deb6fd1b6-20260723-142856
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: manual-tk-f53deb6fd1b6-20260723-142902
- **[unresolved_action]** required_main_agent_actions: Record this READY reviewer evidence as review_evidence_ref for tk-f53deb6fd1b6.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/temporal/workflow-call-sequence.guard.test.ts results=pass — Exit 0: 1 test passed. workflows.ts:202-207 proxies only existing activities; projectChangeState awaits only writeChangeProjection at 851-877. Aggregate write occurs inside activities.ts writeChangeProjection at 515-530. Guard test asserts invariant at workflow-call-sequence.guard.test.ts:25-48. No aggregate-change wf.patched/versioning added.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/temporal/workflow-call-sequence.guard.test.ts
- **[unresolved_action]** required_main_agent_actions: Remediate correctness-1 before acceptance: make summary-affecting mutations eagerly refresh the existing projection with a replay-safe Temporal versioning approach, without adding a separate launcher aggregate activity.
- **[unresolved_action]** required_main_agent_actions: Add a signal-driven Temporal integration test that mutates tasks after initial projection and asserts active-launcher-state.json updates task_count/completed_tasks.
- **[unresolved_action]** required_main_agent_actions: Re-run the targeted projection, activity, Temporal integration, workflow-sequence, and CLI boundary suites; then rerun acceptance review.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] Extending an existing activity body preserves replay only when that activity was already scheduled. Adding scheduleChangeProjection to previously unscheduled signal handlers changes workflow command history and needs a replay-safe versioning plan.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/storage/launcher-projection.test.ts src/temporal/activities.disk-projection.test.ts src/storage/launcher-projection.itest.ts src/temporal/workflow-call-sequence.guard.test.ts, bun test bin/lib/cli-source-boundary.test.ts results=fail — Targeted Vitest suite passed: 4 files, 21 tests (including Temporal signal-driven aggregate test). CLI boundary guard passed: 4 tests, 179 expectations. Initial targeted command using repo-prefixed paths was rejected as no matching files; rerun with plugin-relative paths passed. Source review found blocker despite green selected tests. Positive evidence: canonical archive ID filtering in launcher-projection.ts:121-146, 184-191; truthful provenance/schema in lines 38-48 and 241-250; activity writes aggregate atomically at activities.ts:519-530 and isolates failures at 515-540; canonical producer root is dirname(changesDir) and matches getExternalRoot (.../advance/{projectId}) in project-id.ts:289-298; no aggregate activity proxy added in workflows.ts:202-210, guarded by workflow-call-sequence.guard.test.ts:25-48. No test run IDs available because review ran shell verification, not task-bound adv_run_test.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/storage/launcher-projection.test.ts src/temporal/activities.disk-projection.test.ts src/storage/launcher-projection.itest.ts src/temporal/workflow-call-sequence.guard.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bun test bin/lib/cli-source-boundary.test.ts
- **[epic_terminal_note]** epic.membership: systemizeAdvOrchestration · Add ADV launcher read projection (order 14)

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| SC1 | success_criterion | pass |
| SC2 | success_criterion | pass |
| SC3 | success_criterion | pass |
| SC4 | success_criterion | pass |
| AC1 | acceptance_criterion | pass |
| AC2 | acceptance_criterion | pass |
| AC3 | acceptance_criterion | pass |
| AC4 | acceptance_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| C4 | constraint | respected |
| C5 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |
| DONT4 | avoidance | respected |
| DONT5 | avoidance | respected |
| DONT6 | avoidance | respected |

## Unresolved Actions

- verification_missing: No durable adv_run_test evidence found for run_id: bash-red-launcher-projection-tool
- verification_missing: No durable adv_run_test evidence found for run_id: bash-green-launcher-projection-tool
- verification_missing: No durable adv_run_test evidence found for run_id: bash-typecheck-launcher-projection
- verification_missing: No durable adv_run_test evidence found for run_id: bash-cli-source-boundary-launcher-projection
- verification_missing: No durable adv_run_test evidence found for run_id: bash-red-activities-disk-projection
- verification_missing: No durable adv_run_test evidence found for run_id: bash-green-activities-disk-projection
- verification_missing: No durable adv_run_test evidence found for run_id: bash-typecheck-activities
- verification_missing: No durable adv_run_test evidence found for run_id: manual-tk-940495b9ba78-20260723-142832
- verification_missing: No durable adv_run_test evidence found for run_id: manual-tk-940495b9ba78-20260723-142850
- verification_missing: No durable adv_run_test evidence found for run_id: manual-tk-f53deb6fd1b6-20260723-142856
- verification_missing: No durable adv_run_test evidence found for run_id: manual-tk-f53deb6fd1b6-20260723-142902
- Record this READY reviewer evidence as review_evidence_ref for tk-f53deb6fd1b6.
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/temporal/workflow-call-sequence.guard.test.ts
- Remediate correctness-1 before acceptance: make summary-affecting mutations eagerly refresh the existing projection with a replay-safe Temporal versioning approach, without adding a separate launcher aggregate activity.
- Add a signal-driven Temporal integration test that mutates tasks after initial projection and asserts active-launcher-state.json updates task_count/completed_tasks.
- Re-run the targeted projection, activity, Temporal integration, workflow-sequence, and CLI boundary suites; then rerun acceptance review.
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/storage/launcher-projection.test.ts src/temporal/activities.disk-projection.test.ts src/storage/launcher-projection.itest.ts src/temporal/workflow-call-sequence.guard.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bun test bin/lib/cli-source-boundary.test.ts
