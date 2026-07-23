# Archive Briefing Digest

**Change ID:** fixWorktreeReuseRegistration
**Title:** Fix worktree reuse registration gap
**Status:** archived
**Generated:** 2026-07-23T04:30:14.674Z

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

Epic: hardenTemporalReliability · Fix worktree reuse registration gap (order 13)

## Durable Facts

Showing 14 of 14 durable facts.

- **[unresolved_action]** required_main_agent_actions: Consume this independent READY/PASS-equivalent report as acceptance evidence; parent retains acceptance-gate decision.
- **[unresolved_action]** required_main_agent_actions: Leave resume path, isolation guard, full-create worktreeCreated signal behavior, and unrelated recovery work untouched.
- **[wisdom_candidate]** wisdom_candidates: [pattern] For advisory Temporal worktree-state queries, preserve correctness with a workflow-side if-absent reducer; query null/failure must never authorize client-side overwrite.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/tools/worktree/index-create.test.ts src/temporal/change-state.worktree-auto-manage.test.ts src/temporal/messages.test.ts src/temporal/workflows.signal-handlers.itest.ts, pnpm run check results=pass — Current acceptance run: targeted suite passed 4 files / 77 tests (33.36s). `pnpm run check` passed schemas:check, TypeScript, manifest check, isolation/lockfile checks, ESLint, and Prettier. Source/diff review: reducer in plugin/src/temporal/change-state.ts:2089 returns before timestamping existing records and inserts the complete required record only when absent; Step 0 in plugin/src/tools/worktree/index.ts:1009 validates disk HEAD, sends dedicated best-effort repair only after advisory null, and returns reuse regardless of signal result. getWorktreeRecord explicitly maps service/query failure to null (state.ts:1119-1156), while fireWorktreeSignal catches timeout/failure (index.ts:168-211). Workflow handler is wired at workflows.ts:1613 and serialized by workflow history. Continue-as-new now preserves creation_request_hash at workflows.ts:1974; seed application already restores it at lines 765-771, and structural test verifies every declared seed key at workflows.signal-handlers.itest.ts:1932-1948.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tools/worktree/index-create.test.ts src/temporal/change-state.worktree-auto-manage.test.ts src/temporal/messages.test.ts src/temporal/workflows.signal-handlers.itest.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm run check
- **[unresolved_action]** required_main_agent_actions: Treat local release hardening as READY. Before merge/release, obtain normal remote CI and merge evidence.
- **[unresolved_action]** required_main_agent_actions: Parent may proceed to archive decision after required user archive sign-off; do not revisit resume, isolation guard, or full-create behavior absent a new failure.
- **[wisdom_candidate]** wisdom_candidates: [pattern] For advisory workflow-state queries used during disk-authoritative recovery, emit a typed best-effort signal and make the workflow reducer the authoritative if-absent boundary; this preserves setup-failure and metadata-rich records under query failure and signal replay.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- /home/jon/.local/share/opencode/worktree/bdf259aa162ae192af5b18899ccdc653b085528d/change/fixWorktreeReuseRegistration/plugin/src/tools/worktree/index-create.test.ts /home/jon/.local/share/opencode/worktree/bdf259aa162ae192af5b18899ccdc653b085528d/change/fixWorktreeReuseRegistration/plugin/src/temporal/change-state.worktree-auto-manage.test.ts /home/jon/.local/share/opencode/worktree/bdf259aa162ae192af5b18899ccdc653b085528d/change/fixWorktreeReuseRegistration/plugin/src/temporal/messages.test.ts /home/jon/.local/share/opencode/worktree/bdf259aa162ae192af5b18899ccdc653b085528d/change/fixWorktreeReuseRegistration/plugin/src/temporal/workflows.signal-handlers.itest.ts, pnpm --dir plugin run check, git status --porcelain=v1 && git diff --check HEAD~3..HEAD && git diff --check results=pass — Fresh targeted run passed 4 files / 77 tests in 36.65s. Fresh static check passed schema check, TypeScript, generated-manifest check, isolation/lockfile checks, ESLint, and Prettier. Final worktree is clean; committed three-checkpoint diff passes whitespace checks. Source review confirms the typed canonical signal is workflow-local, reducer returns before timestamping any existing record (including setup_failed), repair inserts only a complete setup-ready record when absent, and Step 0 validates disk path/HEAD then uses best-effort delivery without worker-health dependency. Integration test proves replay duplicate exact no-op; structural test proves creation_request_hash survives continue-as-new.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- /home/jon/.local/share/opencode/worktree/bdf259aa162ae192af5b18899ccdc653b085528d/change/fixWorktreeReuseRegistration/plugin/src/tools/worktree/index-create.test.ts /home/jon/.local/share/opencode/worktree/bdf259aa162ae192af5b18899ccdc653b085528d/change/fixWorktreeReuseRegistration/plugin/src/temporal/change-state.worktree-auto-manage.test.ts /home/jon/.local/share/opencode/worktree/bdf259aa162ae192af5b18899ccdc653b085528d/change/fixWorktreeReuseRegistration/plugin/src/temporal/messages.test.ts /home/jon/.local/share/opencode/worktree/bdf259aa162ae192af5b18899ccdc653b085528d/change/fixWorktreeReuseRegistration/plugin/src/temporal/workflows.signal-handlers.itest.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir plugin run check
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git status --porcelain=v1 && git diff --check HEAD~3..HEAD && git diff --check
- **[epic_terminal_note]** epic.membership: hardenTemporalReliability · Fix worktree reuse registration gap (order 13)

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| SC1 | success_criterion | pass |
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
| C5 | constraint | respected |
| C6 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |
| DONT4 | avoidance | respected |
| DONT5 | avoidance | respected |
| DONT6 | avoidance | respected |

## Unresolved Actions

- Consume this independent READY/PASS-equivalent report as acceptance evidence; parent retains acceptance-gate decision.
- Leave resume path, isolation guard, full-create worktreeCreated signal behavior, and unrelated recovery work untouched.
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/tools/worktree/index-create.test.ts src/temporal/change-state.worktree-auto-manage.test.ts src/temporal/messages.test.ts src/temporal/workflows.signal-handlers.itest.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm run check
- Treat local release hardening as READY. Before merge/release, obtain normal remote CI and merge evidence.
- Parent may proceed to archive decision after required user archive sign-off; do not revisit resume, isolation guard, or full-create behavior absent a new failure.
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- /home/jon/.local/share/opencode/worktree/bdf259aa162ae192af5b18899ccdc653b085528d/change/fixWorktreeReuseRegistration/plugin/src/tools/worktree/index-create.test.ts /home/jon/.local/share/opencode/worktree/bdf259aa162ae192af5b18899ccdc653b085528d/change/fixWorktreeReuseRegistration/plugin/src/temporal/change-state.worktree-auto-manage.test.ts /home/jon/.local/share/opencode/worktree/bdf259aa162ae192af5b18899ccdc653b085528d/change/fixWorktreeReuseRegistration/plugin/src/temporal/messages.test.ts /home/jon/.local/share/opencode/worktree/bdf259aa162ae192af5b18899ccdc653b085528d/change/fixWorktreeReuseRegistration/plugin/src/temporal/workflows.signal-handlers.itest.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir plugin run check
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git status --porcelain=v1 && git diff --check HEAD~3..HEAD && git diff --check
