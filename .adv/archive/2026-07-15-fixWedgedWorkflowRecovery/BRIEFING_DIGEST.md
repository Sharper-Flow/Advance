# Archive Briefing Digest

**Change ID:** fixWedgedWorkflowRecovery
**Title:** Fix wedged workflow recovery
**Status:** archived
**Generated:** 2026-07-15T20:24:30.829Z

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

Showing 45 of 45 durable facts.

- **[report_follow_up]** follow_ups: Inline recovery-reason unions in worktree state and backlog are adjacent but untouched; no compile impact.
- **[unresolved_action]** required_main_agent_actions: Record durable ADV TDD evidence before task completion; subagent could not access ADV MCP tools.
- **[archive_only_evidence]** decisions: Added a structural three-way RecoveryReason taxonomy and a projection-safe subset. — Keeps query_failed distinct from mutation-authorizing missing/poisoned reasons.
- **[archive_only_evidence]** decisions: Classified unregistered query handlers as query_failed and rejected query_failed at both re-seed mutation gates. — A workflow can exist while being unable to answer; fallback must not mask live-workflow or code-skew failures.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/temporal/recovery-classification.test.ts src/storage/store-temporal/shared.test.ts src/storage/store-temporal/index.test.ts (1) — RED pre-implementation: 6 intended failures; 51 passed.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/temporal/recovery-classification.test.ts src/storage/store-temporal/shared.test.ts src/storage/store-temporal/index.test.ts (0) — GREEN: 57/57 passed.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/storage/store-temporal/ src/temporal/recovery-classification.test.ts src/temporal/retry-wrapper.test.ts src/temporal/workflow-bundle-boundary.test.ts (0) — 167/167 passed across 14 files.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/worktree/ src/tools/backlog.test.ts (0) — 181/181 passed.
- **[archive_only_evidence]** verification: bin/oc-test full (0) — 360 files / 5426 tests passed.
- **[archive_only_evidence]** verification: pnpm run check (0) — schemas:check, typecheck, isolation, lockfile, lint, and format passed; no public Zod model changed.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/temporal/recovery-classification.test.ts src/storage/store-temporal/shared.test.ts src/storage/store-temporal/index.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/temporal/recovery-classification.test.ts src/storage/store-temporal/shared.test.ts src/storage/store-temporal/index.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/storage/store-temporal/ src/temporal/recovery-classification.test.ts src/temporal/retry-wrapper.test.ts src/temporal/workflow-bundle-boundary.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/worktree/ src/tools/backlog.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test full
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- **[report_follow_up]** follow_ups: Full suite had a pre-existing load-sensitive bounded-read-deadline test failure; isolated checks pass.
- **[unresolved_action]** required_main_agent_actions: Checkpoint task before continuing.
- **[archive_only_evidence]** decisions: Added pinned workflow termination with operator approval and archived routing. — Prevents termination of an unverified or different workflow run.
- **[archive_only_evidence]** verification: pnpm vitest run src/tools/change.workflow-terminate.test.ts (0) — GREEN 18/18; durable adv_run_test tr_mrmgzvl1_1ec255b0.
- **[archive_only_evidence]** verification: pnpm run check (0) — All checks passed.
- **[archive_only_evidence]** verification: pnpm run build (0) — Plugin and worker build passed.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm vitest run src/tools/change.workflow-terminate.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run build
- **[unresolved_action]** required_main_agent_actions: Checkpoint verified test changes.
- **[archive_only_evidence]** decisions: Added a real disk snapshot to release-recovery enforcement test. — Preserves fail-closed recovery behavior while allowing merge enforcement to execute.
- **[archive_only_evidence]** verification: ../bin/oc-test targeted -- src/tools/gate.release-enforcement.test.ts src/tools/gate.test.ts (0) — 46/46 passed.
- **[archive_only_evidence]** verification: pnpm run check (0) — Durable ADV evidence tr_mrmhxgp2_c3d2068e passed.
- **[archive_only_evidence]** verification: ../bin/oc-test full (0) — 361 test files, 5445 tests passed.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: ../bin/oc-test targeted -- src/tools/gate.release-enforcement.test.ts src/tools/gate.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: ../bin/oc-test full
- **[unresolved_action]** required_main_agent_actions: No remediation required.
- **[archive_only_evidence]** verification: tests_run=git diff --check f14bdb45..05426db, bin/oc-test targeted -- src/tools/change.workflow-terminate.test.ts src/tools/gate.release-enforcement.test.ts src/storage/store-temporal/index.test.ts src/storage/store-temporal/shared.test.ts results=pass — Diff whitespace check passed; focused suite 4 files, 78 tests passed.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: git diff --check f14bdb45..05426db
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/change.workflow-terminate.test.ts src/tools/gate.release-enforcement.test.ts src/storage/store-temporal/index.test.ts src/storage/store-temporal/shared.test.ts
- **[archive_only_evidence]** verification: tests_run=git status --short && git diff --check trunk...HEAD, bin/oc-test targeted -- src/tools/change.workflow-terminate.test.ts src/temporal/recovery-classification.test.ts src/tool-registry.inventory.test.ts src/tool-ownership-assets.test.ts results=pass — Working tree clean; diff clean; focused suite 49 tests passed.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: git status --short && git diff --check trunk...HEAD
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/change.workflow-terminate.test.ts src/temporal/recovery-classification.test.ts src/tool-registry.inventory.test.ts src/tool-ownership-assets.test.ts
- **[unresolved_action]** required_main_agent_actions: Route scoped remediation.
- **[archive_only_evidence]** findings: [blocker] Release-gate recovery behavior no longer reaches trunk-merge enforcement.
- **[archive_only_evidence]** findings: [issue] gate.test.ts needs formatting.
- **[unresolved_action]** suggested_handoff: Preserve release recovery enforcement when an in-memory test projection is intentionally used, while keeping completed-workflow disk recovery fail-closed. — in_scope: Release recovery behavior, gate test formatting
- **[unresolved_action]** recommended_next_action: route_adv_engineer

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| SC1 | success_criterion | pass |
| SC2 | success_criterion | pass |
| SC3 | success_criterion | pass |
| SC4 | success_criterion | pass |
| SC5 | success_criterion | pass |
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
| OOS1 | out_of_scope | not_applicable |
| OOS2 | out_of_scope | not_applicable |
| OOS3 | out_of_scope | not_applicable |

## Unresolved Actions

- Record durable ADV TDD evidence before task completion; subagent could not access ADV MCP tools.
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/temporal/recovery-classification.test.ts src/storage/store-temporal/shared.test.ts src/storage/store-temporal/index.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/temporal/recovery-classification.test.ts src/storage/store-temporal/shared.test.ts src/storage/store-temporal/index.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/storage/store-temporal/ src/temporal/recovery-classification.test.ts src/temporal/retry-wrapper.test.ts src/temporal/workflow-bundle-boundary.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/worktree/ src/tools/backlog.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test full
- verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- Checkpoint task before continuing.
- verification_missing: No adv_run_test evidence found for reported command: pnpm vitest run src/tools/change.workflow-terminate.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- verification_missing: No adv_run_test evidence found for reported command: pnpm run build
- Checkpoint verified test changes.
- verification_missing: No adv_run_test evidence found for reported command: ../bin/oc-test targeted -- src/tools/gate.release-enforcement.test.ts src/tools/gate.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- verification_missing: No adv_run_test evidence found for reported command: ../bin/oc-test full
- No remediation required.
- verification_missing: No adv_run_test evidence found for reported command: git diff --check f14bdb45..05426db
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/change.workflow-terminate.test.ts src/tools/gate.release-enforcement.test.ts src/storage/store-temporal/index.test.ts src/storage/store-temporal/shared.test.ts
- verification_missing: No adv_run_test evidence found for reported command: git status --short && git diff --check trunk...HEAD
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/change.workflow-terminate.test.ts src/temporal/recovery-classification.test.ts src/tool-registry.inventory.test.ts src/tool-ownership-assets.test.ts
- Route scoped remediation.
- Preserve release recovery enforcement when an in-memory test projection is intentionally used, while keeping completed-workflow disk recovery fail-closed. — in_scope: Release recovery behavior, gate test formatting
- route_adv_engineer
