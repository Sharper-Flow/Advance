# Archive Briefing Digest

**Change ID:** fixAdvStateAuthority
**Title:** Fix ADV state authority
**Status:** archived
**Generated:** 2026-08-05T20:09:28.689Z

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

Showing 100 of 144 durable facts (44 omitted).

- **[unresolved_action]** required_main_agent_actions: Checkpoint the completed task from the ADV worktree; do not re-run implementation in the trunk checkout.
- **[archive_only_evidence]** decisions: Resolve archive dominance for summaryRows and hydrated disk projections with per-ID hasArchiveBundle checks. — Rows already present in summaryRows bypass hydrate(); per-ID archive checks repair that path without introducing Temporal reads or active-list full archive-bundle loading.
- **[archive_only_evidence]** decisions: Preserve the existing archive candidate scan only for explicit terminal-status reads. — Terminal reads still need archive-only discovery and canonical directory deduplication; active/in-flight enumeration no longer scans every archive bundle.
- **[archive_only_evidence]** decisions: Leave closed rows unchanged when an archive bundle is present. — Closed is already terminal and the contract requires preserving existing closed-status handling.
- **[archive_only_evidence]** verification: ../bin/oc-test targeted -- src/storage/store-temporal/index.test.ts -t "applies archive dominance to summary rows" (1) — RED reproduced the defect: a summary-shard row with an archive bundle was returned as draft.
- **[archive_only_evidence]** verification: ../bin/oc-test targeted -- src/storage/store-temporal/index.test.ts -t "applies archive dominance to summary rows" (0) — GREEN regression test passed for both list and listSummary.
- **[archive_only_evidence]** verification: ../bin/oc-test targeted -- src/storage/store-temporal/index.test.ts src/storage/store-temporal/changes.test.ts src/storage/store-temporal/bounded-read-deadline.test.ts (0) — 73 targeted storage tests passed.
- **[archive_only_evidence]** verification: pnpm run check (0) — Schemas, typecheck, manifest/frontmatter/isolation/lockfile checks, lint, and format check passed; four expected pre-existing lint warnings remained.
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msfl4hmk_966f6a4c
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msfl70nq_f00c4181
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msflccui_a6b8ea2c
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msflhkvz_8f426f26
- **[unresolved_action]** required_main_agent_actions: DONT1 respected: retain the task respect ref.
- **[archive_only_evidence]** verification: tests_run= results=n/a — Independent source audit: changes.ts:1004-1029 performs bounded per-ID archive inspection; on deadline/error it retains the projection and emits degradation, never a Temporal-closed failure. Task verification records 73 storage tests.
- **[report_follow_up]** follow_ups: Consider a separate change to unify provenance shape across adv_status, adv_wip_state, and adv_change_list; explicitly out of scope here.
- **[archive_only_evidence]** decisions: Emit TERMINAL_SOURCE_DEGRADED warnings for active-disk, archive-scan, and per-ID archive resolution failures regardless of wantsTerminalStatuses. — Routine in-flight enumeration must retain its rows while exposing typed provenance whenever terminal-resolution inspection degrades; this preserves projection-first and non-fail-closed behavior.
- **[archive_only_evidence]** decisions: Keep terminal-only candidate omission warnings and terminal hydration statistics unchanged. — This task widens degradation provenance only; it does not alter terminal query result semantics or unify surface-specific provenance shapes.
- **[archive_only_evidence]** verification: ../bin/oc-test targeted -- src/storage/store-temporal/changes.test.ts (1) — Red test reproduced the defect: in-flight row remained, but terminal degradation warning was absent.
- **[archive_only_evidence]** verification: ../bin/oc-test targeted -- src/storage/store-temporal/changes.test.ts (0) — Green targeted suite passed: 28 tests.
- **[archive_only_evidence]** verification: pnpm run check (0) — Plugin check passed with 0 errors; four expected pre-existing lint warnings remain in mock-owner.ts and operations.ts.
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msfmoo6n_a4dcb012
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msfmt2qp_34dc2b56
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msfmxe7j_949fde21
- **[unresolved_action]** required_main_agent_actions: DONT1 respected: retain the task respect ref.
- **[archive_only_evidence]** verification: tests_run= results=n/a — Independent source audit: changes.ts:1015-1029 returns the usable projection after terminal-source deadline/failure while attaching typed degradation. Task verification records 28 targeted tests.
- **[report_follow_up]** follow_ups: The existing spec-conformance capability was inspected. Its source is intentionally CI/runtime-isolated and archive-gated by rq-confArchiveGate01; this deterministic implementation-owned invariant therefore remains in the normal unit suite rather than inventing a parallel conformance runner.
- **[unresolved_action]** required_main_agent_actions: Review and checkpoint the four touched files for task tk-1ec0745f9268; do not mark the task done from this worker.
- **[archive_only_evidence]** decisions: Used one deterministic temp-fixture invariant over list, listSummary, get, archive snapshot, and launcher projection. — It asserts terminality and agreement across answered surfaces without querying the live machine or Temporal; a surface may omit a row, but cannot return a non-terminal answer.
- **[archive_only_evidence]** decisions: Added launcher-side per-ID archive dominance and passed archive paths from both producer call sites. — The invariant exposed that a stale draft summary shard could still be emitted by launcher projection even when the archive bundle was durable; this is the minimal adjacent fix and does not extract a shared dominance helper.
- **[archive_only_evidence]** decisions: Covered truncated scans through typed deadline/degraded omission assertions. — The test proves partial archive enumeration does not become a non-terminal answer, while keeping the scenario deterministic and isolated.
- **[archive_only_evidence]** decisions: Did not temporarily revert the KD2 fix. — The requested extra red proof was optional; reverting a completed read-path fix was unnecessary after the invariant passed against the current implementation.
- **[archive_only_evidence]** verification: ../bin/oc-test targeted -- src/storage/cross-surface-terminality.invariant.test.ts src/storage/launcher-projection.test.ts src/storage/store-temporal/index.test.ts src/temporal/activities.disk-projection.test.ts (0) — 55 targeted unit tests passed across the new invariant, launcher projection, temporal store, and projection activity paths.
- **[archive_only_evidence]** verification: pnpm run check (0) — Schemas, typecheck, manifest/frontmatter/isolation/lockfile checks, lint, and format checks passed; only the four expected pre-existing warnings remain in mock-owner.ts and operations.ts.
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msfmeo7h_77a61782
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msfmgm43_d8fcf24c
- **[archive_only_evidence]** decisions: Validate the raw root candidate in resolveProjectIdentity and throw InvalidProjectIdentityError for malformed identities. — Keeps validation at the resolver boundary as designed, fails closed before minting, and preserves existing IdentityResolution variants and store-consolidate callers.
- **[archive_only_evidence]** decisions: Return the raw candidate from resolveRootCommit instead of filtering it there. — The resolver must own the validation decision and distinguish malformed identity output from a non-git repository.
- **[archive_only_evidence]** decisions: Use the existing git wrapper boundary in the regression test. — It deterministically injects the observed 46-character candidate without modifying git state or production code paths.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/utils/project-id.test.ts (1) — Red proof: new regression test failed because malformed candidate was classified as not_git.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/utils/project-id.test.ts (0) — Green proof: all 35 project-id tests pass, including the 46-character invalid candidate refusal and no-store assertion.
- **[archive_only_evidence]** verification: pnpm run check (0) — Schemas, typecheck, manifest/frontmatter/isolation/lockfile checks, lint, and format checks pass; four existing lint warnings remain with zero errors.
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msfke2s7_fc87886e
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msfkg9wo_3b7c85ea
- **[unresolved_action]** required_main_agent_actions: Checkpoint tk-2c29af26aff8 from this ADV worktree; do not mark it complete from the engineer.
- **[archive_only_evidence]** decisions: Use the existing explicit ADV_TEST_MODE switch alongside VITEST, with ADV_TEST_DATA_HOME=0 as the deliberate opt-out. — Preserves the established test-mode contract while making the storage redirect greppable and allowing existing XDG path assertions to bypass only the redirect.
- **[archive_only_evidence]** decisions: Use os.tmpdir()/advance-test/{process.pid} as the redirected root. — Keeps synthetic stores outside the production data home and separates concurrent test processes without changing non-test XDG behavior.
- **[archive_only_evidence]** decisions: Leave identity synthesis, resolver validation, cleanup, and the isolation checker unchanged. — The defect is storage-root selection; those mechanisms are explicitly out of scope and the isolation checker already recognizes tmpdir/os.tmpdir usage.
- **[archive_only_evidence]** verification: ../bin/oc-test targeted -- src/utils/project-id.test.ts (1) — RED reproduced both missing test-mode redirects: VITEST and ADV_TEST_MODE remained under the production data home.
- **[archive_only_evidence]** verification: ../bin/oc-test targeted -- src/utils/project-id.test.ts (0) — GREEN/verification passed: 39 project identity and data-home tests, including VITEST and ADV_TEST_MODE tmpdir redirects, XDG opt-out, and non-test XDG preservation.
- **[archive_only_evidence]** verification: pnpm run check (0) — Schemas, typecheck, manifest/frontmatter/isolation/lockfile checks, lint, and format check passed with 0 errors; four expected pre-existing warnings remain in mock-owner.ts and operations.ts.
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msfn97ky_4e7acaf7
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msfng2vu_959d983e
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msfnhyx8_f8e6ab16
- **[archive_only_evidence]** decisions: Require REPLAY_FIXTURE_NAMESPACE and reject default/default-like namespaces before any Temporal connection, worker, or synthetic workflow setup. — Replay generation starts real workflows; an explicit non-default namespace is the primary isolation boundary and avoids a compensating terminate sweep.
- **[archive_only_evidence]** decisions: Keep the existing synthetic project identity and replay generation flow unchanged after namespace validation. — Replay fixtures remain load-bearing determinism coverage; only their Temporal namespace target is hardened.
- **[archive_only_evidence]** decisions: Update finalizer regeneration guidance to use the isolated namespace variable. — The adjacent export workflow must not direct operators back to the live default namespace after generation is hardened.
- **[archive_only_evidence]** verification: ../bin/oc-test targeted -- scripts/replay-fixture-boundary.test.ts scripts/temporal-script-facade.test.ts (0) — Passed: 2 test files, 13 tests; boundary behavior and adjacent Temporal script facade tests.
- **[archive_only_evidence]** verification: set -o pipefail; output=$(env -u REPLAY_FIXTURE_NAMESPACE pnpm exec tsx scripts/gen-replay-fixture.ts --branch state-backed-gate-artifact 2>&1); status=$?; test "$status" -ne 0; case "$output" in *REPLAY_FIXTURE_NAMESPACE*) exit 0 ;; *) printf '%s\n' "$output"; exit 1 ;; esac (0) — Passed: generator exits before Temporal setup when the isolation namespace is absent.
- **[archive_only_evidence]** verification: pnpm run check (0) — Passed with 0 errors; 4 expected pre-existing lint warnings in mock-owner.ts and operations.ts.
- **[archive_only_evidence]** verification: pnpm exec prettier --check scripts/gen-replay-fixture.ts scripts/replay-fixture-boundary.ts scripts/replay-fixture-boundary.test.ts scripts/finalize-replay-fixture.ts (0) — Passed: all touched fixture scripts use Prettier formatting.
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msfnwvyt_ab554e03
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msfnv9w3_6473cf5a
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msfnyvdd_8bb63b1e
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msfnwuij_81ce7f26
- **[report_follow_up]** follow_ups: Rerun pnpm run check after the concurrent project-id worker resolves its typecheck fallout.
- **[unresolved_action]** required_main_agent_actions: Do not merge/checkpoint this task as globally verified until pnpm run check is rerun after the concurrent project-id changes are type-correct.
- **[archive_only_evidence]** decisions: Added a dedicated generation-guard refusal separate from freshness advisory state. — A generation mismatch must stop reads, while unknown freshness remains allowed and does not add any Temporal-availability failure path per DONT1.
- **[archive_only_evidence]** decisions: Selected recovery by the loaded entry module basename. — dist/index.js is owned by the OpenCode host; dist/mcp-server.js is supervised independently by Vision as adv-advance.
- **[archive_only_evidence]** decisions: Guarded host ADV traffic with a typed Error and MCP Tier-4 reads with a structured JSON refusal before store/handler dispatch. — Both read surfaces must fail before stale code can answer, while preserving their native error transport.
- **[unresolved_action]** scope_drift: finish_owned_scope_then_report: Concurrent worker edits to project-id.ts introduced an invalid identity union member without updating store-consolidate.ts. The required pnpm run check reached typecheck and failed on Property 'reason' does not exist for the new invalid branch. These files were not touched.
- **[archive_only_evidence]** verification: ../bin/oc-test targeted -- src/plugin-bundle-manifest.test.ts src/mcp-server/tools/index.test.ts (0) — 33 focused unit tests pass; generation mismatch refusals are typed, stale reads do not dispatch, and OpenCode/MCP recovery hints name the correct process.
- **[archive_only_evidence]** verification: ../bin/oc-test targeted -- src/plugin-bundle-manifest.test.ts src/mcp-server/tools/index.test.ts (0) — Verification rerun passes all 33 focused tests after final formatting/class-field adjustment.
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msfk60em_172b8301
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msfka5vs_c1d8dfd1
- **[unresolved_action]** required_main_agent_actions: DONT1 respected: retain the task respect ref.
- **[archive_only_evidence]** verification: tests_run= results=n/a — Task-specific source/verification audit: generation mismatch is a stale-bundle guard; its task evidence confirms unknown freshness remains allowed and no Temporal-availability failure path was added. 33 focused tests passed.
- **[report_follow_up]** follow_ups: Verify loaded plugin bundle/runtime generation and original zero-result reproduction.
- **[unresolved_action]** required_main_agent_actions: Cancel or rescope task after stale-runtime versus missing-projection diagnosis.
- **[archive_only_evidence]** decisions: No code change. — Current projection-first Epic listing is correct and live adv_epic_list no longer reproduces zero results; adding Temporal fallback violates C1/DONT1.
- **[unresolved_action]** blockers: AC13 is not reproducibly violated.
- **[unresolved_action]** blockers: Requested unprojected-workflow fallback conflicts with approved boundaries.
- **[archive_only_evidence]** verification: ../bin/oc-test targeted -- src/storage/store-temporal/epics.test.ts (0) — 46 Epic store tests pass.
- **[archive_only_evidence]** verification: pnpm run check (0) — Check passes with 0 errors and 4 expected warnings.
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msfofbf9_64790aac
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msfohfay_64398c19
- **[archive_only_evidence]** decisions: Backfill missing active projections inside repairIndex before preserving search-attribute refresh. — Temporal workflow state remains authoritative while the read path stays projection-first; writing through saveActiveEpicProjection restores listing without adding Temporal fallback to reads.
- **[archive_only_evidence]** decisions: Represent a projection write as backfilled even when subsequent search-attribute verification is unverified or signal delivery fails. — The typed report must make the durable projection write observable independently from refresh verification.
- **[archive_only_evidence]** decisions: Run Epic repair from the existing adv_doctor active sweep and classify repair failures as typed findings. — Doctor is the explicit operator recovery boundary; enumeration/query failures must not make doctor throw or fail closed.
- **[archive_only_evidence]** verification: ../bin/oc-test targeted -- src/storage/store-temporal/epics.test.ts -t "backfills a missing active projection" (1) — RED: the new missing-projection backfill/listing test failed before implementation because report.backfilled was undefined.
- **[archive_only_evidence]** verification: ../bin/oc-test targeted -- src/storage/store-temporal/epics.test.ts src/tools/doctor.test.ts (0) — GREEN: 80 targeted Epic-store and doctor tests pass.
- **[archive_only_evidence]** verification: pnpm run check (0) — Schemas, typecheck, manifest checks, isolation checks, lint, and formatting pass; 0 errors and 4 expected pre-existing lint warnings.
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msg9tavq_5daa55fc
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msga66j1_931719ef
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msga86hq_63c4c68a
- **[unresolved_action]** required_main_agent_actions: DONT1 respected: retain the task respect ref.
- **[archive_only_evidence]** verification: tests_run= results=n/a — Task-specific audit: Epic listing remains projection-first; Temporal access is confined to explicit doctor repair/backfill, not read paths. Task verification records 80 targeted tests.
- **[archive_only_evidence]** decisions: Separated pure census classification from live filesystem and Temporal collection. — Keeps the analyzer deterministic and fixture-safe while allowing the explicit diagnostic to enumerate live Temporal workflows.
- **[archive_only_evidence]** decisions: Re-exported canonical synthetic identity constants through the approved CLI projection boundary. — Preserves the root CLI source-boundary contract instead of deep-importing plugin internals.
- **[archive_only_evidence]** decisions: Required positive archive or complete disk-inventory missing-store evidence before classifying an abandoned running change workflow. — Prevents absence caused by incomplete reads or Temporal degradation from becoming a false abandonment finding.
- **[archive_only_evidence]** verification: bun test bin/lib/census.test.ts (1) — RED: pure analyzer test import failed before census implementation.

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
| AC5 | acceptance_criterion | pass |
| AC6 | acceptance_criterion | pass |
| AC7 | acceptance_criterion | pass |
| AC8 | acceptance_criterion | pass |
| AC9 | acceptance_criterion | pass |
| AC10 | acceptance_criterion | pass |
| AC11 | acceptance_criterion | pass |
| AC12 | acceptance_criterion | pass |
| AC13 | acceptance_criterion | pass |
| AC14 | acceptance_criterion | pass |
| AC15 | acceptance_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| C4 | constraint | respected |
| C5 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |
| DONT4 | avoidance | respected |

## Unresolved Actions

- Checkpoint the completed task from the ADV worktree; do not re-run implementation in the trunk checkout.
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msfl4hmk_966f6a4c
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msfl70nq_f00c4181
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msflccui_a6b8ea2c
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msflhkvz_8f426f26
- DONT1 respected: retain the task respect ref.
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msfmoo6n_a4dcb012
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msfmt2qp_34dc2b56
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msfmxe7j_949fde21
- DONT1 respected: retain the task respect ref.
- Review and checkpoint the four touched files for task tk-1ec0745f9268; do not mark the task done from this worker.
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msfmeo7h_77a61782
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msfmgm43_d8fcf24c
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msfke2s7_fc87886e
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msfkg9wo_3b7c85ea
- Checkpoint tk-2c29af26aff8 from this ADV worktree; do not mark it complete from the engineer.
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msfn97ky_4e7acaf7
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msfng2vu_959d983e
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msfnhyx8_f8e6ab16
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msfnwvyt_ab554e03
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msfnv9w3_6473cf5a
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msfnyvdd_8bb63b1e
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msfnwuij_81ce7f26
- Do not merge/checkpoint this task as globally verified until pnpm run check is rerun after the concurrent project-id changes are type-correct.
- finish_owned_scope_then_report: Concurrent worker edits to project-id.ts introduced an invalid identity union member without updating store-consolidate.ts. The required pnpm run check reached typecheck and failed on Property 'reason' does not exist for the new invalid branch. These files were not touched.
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msfk60em_172b8301
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msfka5vs_c1d8dfd1
- DONT1 respected: retain the task respect ref.
- Cancel or rescope task after stale-runtime versus missing-projection diagnosis.
- AC13 is not reproducibly violated.
- Requested unprojected-workflow fallback conflicts with approved boundaries.
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msfofbf9_64790aac
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msfohfay_64398c19
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msg9tavq_5daa55fc
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msga66j1_931719ef
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msga86hq_63c4c68a
- DONT1 respected: retain the task respect ref.
