# Archive Briefing Digest

**Change ID:** fixDeploymentSyncOrdering
**Title:** Fix deployment sync ordering
**Status:** archived
**Generated:** 2026-07-16T00:53:26.908Z

## Identity Anchors

- CHANGE
- STATUS
- TERMINAL_GATE_SUMMARY
- Origin: adhoc

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

Showing 42 of 42 durable facts.

- **[report_follow_up]** follow_ups: tk-0d5183f9e5f7 implements the script fix against this harness; if it chooses summary wording without 'worker'/'stale' it must renegotiate the contract, not weaken the test
- **[archive_only_evidence]** decisions: New colocated file plugin/src/deploy-local-worker-refresh.test.ts instead of extending deploy-local.test.ts — Existing file is static-content assertions; the executable harness needs process/temp fixtures. Design explicitly permits a colocated focused deploy regression file.
- **[archive_only_evidence]** decisions: Temp git worktree + fake pnpm/rsync + throwaway HOME fixtures (pattern from overlay-sync-assets.test.ts) — Hermetic and fast: no real pnpm build, no writes outside tmpdir/HOME fixtures; worker path is temp-only so the script's exact-path matcher can only ever match the fixture process.
- **[archive_only_evidence]** decisions: Fixture command ends with a trailing no-op after sleep 30 — bash exec-optimizes a trailing sleep: /proc cmdline became 'sleep 30', losing the worker-path argument so the matcher never saw the fixture. Verified via /proc cmdline + SIGTERM survival before adopting.
- **[archive_only_evidence]** decisions: expect.soft for the continuation/summary RED block; hard expects for C2/C3 pins and AC3 guard — One RED run demonstrates every contract expectation the current script violates (5/5 shown) while pins fail fast and loud if the fix ever weakens immutable semantics.
- **[archive_only_evidence]** decisions: Stale-runtime summary asserted as '==> Done.' section matching /worker/i and /stale/i, plus output not containing 'bounce complete' — Pins the design requirement (explicit stale-runtime condition, no active-worker claim) without over-constraining the exact wording tk-0d5183f9e5f7 will choose.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/deploy-local-worker-refresh.test.ts (1) — RED recorded (phase red, runId tr_mrmrt6g7_884676e1): stuck-worker test fails all 5 soft contract expectations (commands synced, adv-engineer.md copied, '==> Done.' reached, summary /worker/i, summary /stale/i); C2/C3 pins pass (nonzero status, [ADV:ACTION_REQUIRED], worker path, PID evidence, restart remediation, no 'bounce complete'); success-path guard passes (exit 0, assets synced, no false stale claim)
- **[archive_only_evidence]** verification: pnpm exec prettier --check src/deploy-local-worker-refresh.test.ts && pnpm exec tsc --noEmit -p tsconfig.json && pnpm exec eslint src/deploy-local-worker-refresh.test.ts && pnpm exec tsx scripts/check-test-isolation.ts (0) — Format, typecheck, lint, and test-isolation checks all clean for the new harness file
- **[unresolved_action]** consumer_warnings: verification_missing: prettier/tsc/eslint/isolation checks were run via bash (pnpm exec) rather than adv_run_test; only the vitest RED runs are tool-recorded (runIds tr_mrmrl7om_9ae82d70, tr_mrmrrp4q_3edf3d40, tr_mrmrt6g7_884676e1)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/deploy-local-worker-refresh.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec prettier --check src/deploy-local-worker-refresh.test.ts && pnpm exec tsc --noEmit -p tsconfig.json && pnpm exec eslint src/deploy-local-worker-refresh.test.ts && pnpm exec tsx scripts/check-test-isolation.ts
- **[report_follow_up]** follow_ups: Unrelated pre-existing failures observed when the full plugin suite ran (before any edit, via a mistargeted `pnpm test --` invocation): src/tool-role-policy.test.ts (adv_verification_evidence_disposition unspecified), src/__tests__/spec-citation-invariant.test.ts, src/temporal/messages.test.ts (51 vs 52 signals), src/temporal/out-of-process-worker.itest.ts, src/storage/store-temporal/bounded-read-deadline.test.ts. These predate this task's edit and appear owned by sibling tasks in this change; not caused by the shell-only diff.
- **[archive_only_evidence]** decisions: Guarded the after-sync refresh with `refresh_deployed_temporal_workers "after-sync" || worker_refresh_exit=$?`, mirroring the existing `fix_adv_cli_install || fix_adv_cli_exit=$?` / `fix_config || fix_config_exit=$?` pattern — Disarms `set -e` for exactly this call so independent asset/config sync completes; the function's own output is unsuppressed (no redirection), preserving C2/C3 loud semantics. Worker function itself unchanged per contract.
- **[archive_only_evidence]** decisions: Initialized `worker_refresh_exit=0` unconditionally just before the DRY_RUN dispatch — Summary/exit code paths reference it under `set -u`; the after-sync call site sits inside the non-dry-run branch, so init must precede the branch.
- **[archive_only_evidence]** decisions: Summary prints a failure-only `Worker refresh: stale deployed Temporal worker(s)...` line after the Config block; final exit precedence is CLI, then config, then worker-refresh — DONE_WHEN requires the summary to name the stale condition only when it occurs (happy-path test asserts no /stale/i in summary); deterministic precedence keeps an earlier CLI/config exit code from being masked.
- **[archive_only_evidence]** verification: pnpm test src/deploy-local-worker-refresh.test.ts (1) — RED confirmed pre-fix: AC1/AC2/AC6 soft asserts failed (no 'command(s) synced', no '==> Done.', summary missing worker/stale); C2/C3 pins (nonzero, [ADV:ACTION_REQUIRED], PID, no 'bounce complete') already passed. runId tr_mrms2k5k_386a85d0
- **[archive_only_evidence]** verification: pnpm test src/deploy-local-worker-refresh.test.ts (0) — GREEN: 2/2 tests pass - stuck worker stays loud + continues asset sync + nonzero final status; success path stays 0 with no stale claim. runId tr_mrms4jic_552e4b0d
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/deploy-local-worker-refresh.test.ts src/deploy-local.test.ts src/deploy-local-exclusion.test.ts (0) — 82/82 tests pass across all 3 deploy-local test files
- **[archive_only_evidence]** verification: bash -n scripts/deploy-local.sh (0) — Shell syntax check passes
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm test src/deploy-local-worker-refresh.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm test src/deploy-local-worker-refresh.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/deploy-local-worker-refresh.test.ts src/deploy-local.test.ts src/deploy-local-exclusion.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bash -n scripts/deploy-local.sh
- **[archive_only_evidence]** decisions: Pinned the exact directive sentence alongside both parameter tokens — Prevents regression to workdir-only Morph instructions with clear failures.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/adv-engineer-assets.test.ts (0) — 25/25 tests pass (24 existing + 1 new regression assertion)
- **[archive_only_evidence]** verification: pnpm exec prettier --check src/adv-engineer-assets.test.ts (0) — Formatting clean
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/adv-engineer-assets.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec prettier --check src/adv-engineer-assets.test.ts
- **[report_follow_up]** follow_ups: Expand Morph capability negative-path test coverage; not required to change the authorization implementation for this fix.
- **[archive_only_evidence]** sources: Deploy worker-refresh execution and exit behavior: Worker refresh returns failure immediately under set -e; final summary has no worker-refresh status.
- **[archive_only_evidence]** sources: Worker-bounce specification: Requires exact-path handling, loud remediation, and final nonzero failure; does not require immediate abort.
- **[archive_only_evidence]** sources: Morph authorization path: Pair-based, session-bound worktree authorization remains fail-closed.
- **[archive_only_evidence]** architecture_assessment: Capturing the post-sync worker refresh result and returning it after independent asset synchronization is compatible with the worker-bounce law, provided the final summary explicitly reports failed refresh and final exit remains nonzero.
- **[archive_only_evidence]** findings: [info] Scoped automated verification passed.
- **[archive_only_evidence]** findings: [info] Worker failure retains safety and defers final exit.
- **[unresolved_action]** required_main_agent_actions: Record acceptance evidence and proceed with the remaining acceptance/release workflow; no code remediation is required.
- **[wisdom_candidate]** wisdom_candidates: [pattern] When a deploy script must preserve a failed runtime refresh while completing independent sync, capture the helper status with an explicit guarded branch and resolve exits once at the end in documented precedence order.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/deploy-local-worker-refresh.test.ts src/adv-engineer-assets.test.ts, bash -n scripts/deploy-local.sh, git diff --check origin/trunk...HEAD results=pass — Focused review run passed 27/27 tests in 8.70s. Shell syntax and whitespace checks passed; worktree remained clean. Existing execution evidence also records 107 focused deploy/agent tests and external Morph authorization bun test 141/141 passing.
- **[unresolved_action]** required_main_agent_actions: Release may proceed. If performing local deployment, run scripts/deploy-local.sh --fix from the release checkout and require exit 0 before claiming the new worker runtime is active.
- **[unresolved_action]** required_main_agent_actions: If deploy reports [ADV:ACTION_REQUIRED], preserve its evidence, restart through adv_temporal_worker_restart rather than manual process termination, then rerun/verify deployment; synchronized agents/assets may already be present but worker runtime is not yet active.
- **[wisdom_candidate]** wisdom_candidates: [pattern] For mutating deploy scripts under set -e, capture recoverable-but-terminal operational failures at the boundary, finish independent synchronization, then return the captured status after deterministic higher-priority failures.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/deploy-local-worker-refresh.test.ts src/adv-engineer-assets.test.ts, bash -n scripts/deploy-local.sh, git diff --check HEAD^ HEAD, git status --porcelain=v1 results=pass — Focused release regression: 2 files, 27 tests passed in 10.47s. The stuck-worker fixture is hermetic (temporary HOME/worktree, exact temporary worker path, fake build tools) and verifies nonzero exit, ACTION_REQUIRED path/PID/restart evidence, no false 'bounce complete', continued command/agent sync, and final stale-worker summary. Happy path exits 0. Shell syntax and committed-diff whitespace checks pass. Final porcelain status is empty. Acceptance evidence additionally records 107 focused deploy/agent tests and 141 external Morph authorization tests passing. Release Readiness Summary: READY. Deployment assets synchronize after a stale worker, failure precedence is CLI install then --fix config then worker refresh, worker matching/SIGTERM/grace behavior remains unchanged, and no documentation/release-note gap was found because existing release guidance already requires the script-owned restart recovery path.

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

## Unresolved Actions

- verification_missing: prettier/tsc/eslint/isolation checks were run via bash (pnpm exec) rather than adv_run_test; only the vitest RED runs are tool-recorded (runIds tr_mrmrl7om_9ae82d70, tr_mrmrrp4q_3edf3d40, tr_mrmrt6g7_884676e1)
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/deploy-local-worker-refresh.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec prettier --check src/deploy-local-worker-refresh.test.ts && pnpm exec tsc --noEmit -p tsconfig.json && pnpm exec eslint src/deploy-local-worker-refresh.test.ts && pnpm exec tsx scripts/check-test-isolation.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm test src/deploy-local-worker-refresh.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm test src/deploy-local-worker-refresh.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/deploy-local-worker-refresh.test.ts src/deploy-local.test.ts src/deploy-local-exclusion.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bash -n scripts/deploy-local.sh
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/adv-engineer-assets.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec prettier --check src/adv-engineer-assets.test.ts
- Record acceptance evidence and proceed with the remaining acceptance/release workflow; no code remediation is required.
- Release may proceed. If performing local deployment, run scripts/deploy-local.sh --fix from the release checkout and require exit 0 before claiming the new worker runtime is active.
- If deploy reports [ADV:ACTION_REQUIRED], preserve its evidence, restart through adv_temporal_worker_restart rather than manual process termination, then rerun/verify deployment; synchronized agents/assets may already be present but worker runtime is not yet active.
