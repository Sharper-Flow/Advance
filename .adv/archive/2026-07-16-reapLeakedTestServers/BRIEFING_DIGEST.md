# Archive Briefing Digest

**Change ID:** reapLeakedTestServers
**Title:** Reap leaked test servers
**Status:** archived
**Generated:** 2026-07-16T18:32:11.327Z

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

Showing 100 of 105 durable facts (5 omitted).

- **[report_follow_up]** follow_ups: tk-61f5c174090b (checker): forbid TestWorkflowEnvironment.create* outside plugin/src/temporal/__tests__/with-test-env.ts; no allow-list entry needed for out-of-process-worker.itest.ts since construction is now helper-owned (DELIBERATE EXCEPTION comment is informational).
- **[report_follow_up]** follow_ups: Untracked bin/oc-test-reaper.test.ts present in the worktree — not from this task; belongs to tk-f6a98b1bdb31 scope.
- **[report_follow_up]** follow_ups: Diff is large (~1650 lines) almost entirely from prettier re-indenting migrated callback bodies to hug form; behavioral change is the call-site swap plus helper additions.
- **[archive_only_evidence]** decisions: Added named constructor wrappers for BOTH createTimeSkipping and createLocal, but the with* lifecycle wrapper only for time-skipping — Design mandates helper-owned constructors for both SDK entry points (total guard coverage). 33 call sites justify withTimeSkippingTestWorkflowEnvironment; zero createLocal callers, so a withLocal variant would be dead code (YAGNI). Generic withTestWorkflowEnvironment(createLocalTestWorkflowEnvironment, fn) covers future createLocal lifecycle use — shown in the updated docs positive-pattern example.
- **[archive_only_evidence]** decisions: Preserved the manual OOP test case instead of migrating it to the lifecycle wrapper — It contains a deliberate PID-exit assertion: it must call env.teardown() explicitly mid-test and then assert the server process exited. The with* wrapper runs teardown only in finally, which cannot express that timing. Construction was still migrated to the named constructor and the case marked with a DELIBERATE EXCEPTION comment.
- **[archive_only_evidence]** decisions: Corrected the helper docstring to state SDK teardown errors are logged/swallowed, not propagated — Verified in installed @temporalio/testing v1.17.2 (lib/testing-workflow-environment.js L209-224): teardown() wraps connection.close(), nativeConnection.close(), and shutdownEphemeralServer() in .catch((e) => { console.error(e); /* ignore */ }). The old docstring's 'teardown errors propagate (they must not be silently swallowed)' was inaccurate for real SDK teardown; helper propagation semantics apply only to errors crossing the teardown() call boundary. Cited upstream caveats #1443/#1394/#2068.
- **[archive_only_evidence]** decisions: workflow-termination.test.ts and workflows.search-attrs.test.ts keep TestWorkflowEnvironment as `import type` — Both still reference the class in type annotations (env: TestWorkflowEnvironment); value imports removed everywhere else.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/temporal/__tests__/with-test-env.test.ts (1) — RED (expected): 4 new named-wrapper tests failed (withTimeSkippingTestWorkflowEnvironment is not a function), 5 existing passed — runId tr_mrmrj1ij_0e8d8289
- **[archive_only_evidence]** verification: pnpm exec vitest run src/temporal/__tests__/with-test-env.test.ts (0) — GREEN: 9/9 pass after implementing wrappers (stable-cwd construction for both named constructors, teardown on success and on fn throw) — runId tr_mrmrk0k4_ee1a4747
- **[archive_only_evidence]** verification: pnpm run check (0) — Full static gate: schemas:check, tsc --noEmit, check-test-isolation, check-lockfile-policy, eslint src/, prettier --check src/ all pass — runId tr_mrmrnume_2daafd2c
- **[archive_only_evidence]** verification: pnpm exec vitest run src/temporal/workflows.ops-follow-up.test.ts src/temporal/__tests__/workflow-termination.test.ts (0) — Migrated integration files pass with real time-skipping servers (incl. import type conversion file) — runId tr_mrmroatk_2c711b41
- **[archive_only_evidence]** verification: pnpm exec vitest run src/temporal/__tests__/continue-as-new.itest.ts src/temporal/out-of-process-worker.itest.ts (0) — 5/5 pass (101.9s); OOP itest ran fully incl. the preserved manual PID-exit test through the named constructor — runId tr_mrmrqqr9_9e430871
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/temporal/__tests__/with-test-env.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/temporal/__tests__/with-test-env.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/temporal/workflows.ops-follow-up.test.ts src/temporal/__tests__/workflow-termination.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/temporal/__tests__/continue-as-new.itest.ts src/temporal/out-of-process-worker.itest.ts
- **[archive_only_evidence]** decisions: Warning-free evidence resubmit citing recorded adv_run_test — AC1 helper-owned constructors + docstring correction; independently re-verified green.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/temporal/__tests__/with-test-env.test.ts (0) — Helper suite green (11 pass + 1 expected fail); orchestrator-recorded adv_run_test evidence.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/temporal/__tests__/with-test-env.test.ts
- **[archive_only_evidence]** decisions: Warning-free resubmit with embedded evidence — AC1 helper-owned constructors; runs real and green.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/temporal/__tests__/with-test-env.test.ts (0) — Helper suite green; adv_run_test.v1 evidence embedded in task verification.
- **[report_follow_up]** follow_ups: Pre-existing env-dependent failure in bin/adv.test.ts ('adv slop-scan dispatcher --json ... detectors unavailable'): reproduces on clean trunk; host has /usr/bin/sg installed, test assumes degraded env without scrubbing PATH and its 5000ms timeout is too tight for the real scan. Not caused by and unrelated to this task; route to the slop-scan/adv dispatcher owner.
- **[report_follow_up]** follow_ups: createLocal() leaks remain deliberately out of reaper blast radius (start-dev argv shape indistinguishable from a real dev server); helper-owned teardown is the mitigation — already documented in reaper header.
- **[unresolved_action]** required_main_agent_actions: Confirm single ownership of tk-f6a98b1bdb31 — a concurrent resume session (oc PID 14957) edited this task's files mid-run; final merged state is green but double-spawn risks conflicting writes
- **[unresolved_action]** required_main_agent_actions: Triage the pre-existing bin/adv.test.ts slop-scan failure (host env: sg installed) — assign to the bin/adv dispatcher owner; do not block this change on it
- **[archive_only_evidence]** decisions: Replaced macOS `_age_seconds_macos` procps-only `etimes` keyword with documented `etime` + a pure `_etime_to_seconds` parser ([[dd-]hh:]mm:ss, base-10 safe via 10#) — Apple ps(1) man page (fetched live) lists `etime` but no `etimes` — the old path would fail on every macOS candidate and silently disable the reaper there; parser failures return non-zero so candidates skip (safe direction)
- **[archive_only_evidence]** decisions: Added startup uint validation for OC_TEST_REAPER_MIN_AGE_SECONDS / OC_TEST_REAPER_TERM_GRACE_SECONDS with warn-and-default fallback — Garbage knob values risked arithmetic failure under set -u; conservative defaults preserve the safety model
- **[archive_only_evidence]** decisions: Preserved existing WIP in bin/oc-test (pre+post sweep wiring, || true isolation, OC_TEST_REAPER_DISABLE) unchanged — Post sweep uses the same stale-only MIN_AGE gate, so it cannot disrupt concurrent peers — matches design ('pre-run destructive stale cleanup; safe post behavior')
- **[archive_only_evidence]** verification: bun test bin/oc-test-reaper.test.ts (0) — Baseline WIP run: 10 pass / 0 fail (runId tr_mrmryjgk_dee19895)
- **[archive_only_evidence]** verification: bun test bin/oc-test-reaper.test.ts (0) — Post-edit green: 14 pass / 0 fail, 49 expects (runId tr_mrms2un7_77b7af4a)
- **[archive_only_evidence]** verification: bun test bin/ (1) — Sibling suite: 220 pass / 1 fail — failure is bin/adv.test.ts slop-scan dispatcher, pre-existing and unrelated (runId tr_mrms3po9_cf353cea)
- **[archive_only_evidence]** verification: bun test bin/adv.test.ts (1) — Isolated reproduction of the pre-existing slop-scan failure (exit 143, 5s test timeout) (runId tr_mrms468y_b1d29eba); also reproduced on clean trunk checkout /home/jon/dev/advance
- **[archive_only_evidence]** verification: bun test bin/oc-test-reaper.test.ts (0) — Final verify on merged state after concurrent session's complementary edits: 14 pass / 0 fail (runId tr_mrms7c7k_200cbe35)
- **[unresolved_action]** consumer_warnings: verification_mismatch: Concurrent session oc PID 14957 (started 20:11 EDT, 'Resume ADV change: reapLeakedTestServers') edited bin/lib/oc-test-reaper.bash at 20:37:28 and bin/oc-test-reaper.test.ts at 20:37:38 while this task ran. Edits were complementary (sub-second _age_seconds_linux + awk float age compare; AC5 timing 3000ms/MIN_AGE=2). Final merged state re-verified green in runId tr_mrms7c7k_200cbe35. Orchestrator should confirm only one worker owns this task to avoid double-handing.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bun test bin/oc-test-reaper.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bun test bin/oc-test-reaper.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bun test bin/
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bun test bin/adv.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bun test bin/oc-test-reaper.test.ts
- **[archive_only_evidence]** decisions: Warning-free evidence resubmit citing recorded adv_run_test — AC3/AC4 conservative stale-only reaper; concurrent-session edits reconciled and re-verified green.
- **[archive_only_evidence]** verification: bun test bin/oc-test-reaper.test.ts (0) — Reaper 14/14 bun tests green; orchestrator-recorded adv_run_test evidence. Supersedes concurrent-session verification_mismatch; final merged state verified.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bun test bin/oc-test-reaper.test.ts
- **[archive_only_evidence]** decisions: Warning-free resubmit with embedded evidence — AC3/AC4 conservative reaper; runs real and green.
- **[archive_only_evidence]** verification: bun test bin/oc-test-reaper.test.ts (0) — Reaper 14/14 green; adv_run_test.v1 evidence embedded in task verification.
- **[report_follow_up]** follow_ups: Unrelated WIP in plugin/src/temporal/__tests__/with-test-env.test.ts (+61 lines) appeared mid-session from outside this task and was committed in orchestrator checkpoint c6a369e5 alongside this task's files; orchestrator should confirm which task owns it (likely AC2 signal-aware timeout work).
- **[unresolved_action]** required_main_agent_actions: Attribute/verify the with-test-env.test.ts WIP swept into checkpoint c6a369e5 (not part of this task's scope).
- **[archive_only_evidence]** decisions: Normalized backslashes to forward slashes inside isTemporalEnvAllowlisted before regex match — path.relative() yields '\\' on Windows; the exact anchored pattern ^temporal/__tests__/with-test-env\.ts$ would fail there and flag the helper itself. Normalization keeps the allow-list exact AND cross-platform-robust (task requirement).
- **[archive_only_evidence]** decisions: Reused existing stripCommentsAndStrings for the new guard instead of adding a new parser — It is the checker's established token stripper already relied on by the isolation lint; task explicitly preferred reusing project infrastructure over heuristic-only parsing. Same semantics for both lints = one tested code path.
- **[archive_only_evidence]** decisions: Modernized both catch blocks to catch(err: unknown) + isErrnoException narrowing + Error cause — Direct eslint on the file flagged 4 errors (2 pre-existing in runLint, 2 copied into WIP runTemporalEnvLint). Same-pattern campsite fix (P25) leaves the whole file lint-clean; thrown message unchanged, added cause improves diagnostics. CI lint scope (src/) unaffected.
- **[archive_only_evidence]** decisions: No package.json change — `pnpm run check` already invokes `tsx scripts/check-test-isolation.ts`; main() now runs both lints, so the new guard is wired into check with zero config churn.
- **[archive_only_evidence]** decisions: Kept unguarded top-level main() — Pre-existing house pattern (sibling check-lockfile-policy.ts identical); real plugin source passes both lints so importing the module from the test file is side-effect-safe. Changing it would alter behavior beyond scope.
- **[archive_only_evidence]** verification: pnpm exec vitest run scripts/check-test-isolation.test.ts (1) — RED (runId tr_mrmsgeh6_7b66f235): new Windows-separator allow-list test failed as expected; 14/15 passed including exact-path negatives and missing-src-dir error test.
- **[archive_only_evidence]** verification: pnpm exec vitest run scripts/check-test-isolation.test.ts (0) — GREEN (runId tr_mrmsgqpd_b68db6d3): 15/15 after separator normalization in isTemporalEnvAllowlisted.
- **[archive_only_evidence]** verification: pnpm exec tsx scripts/check-test-isolation.ts (0) — VERIFY (runId tr_mrmsgyug_dc51102b): checker scans real plugin source, exit 0 — raw constructors only inside allow-listed helper.
- **[archive_only_evidence]** verification: pnpm exec prettier --check scripts/check-test-isolation.ts scripts/check-test-isolation.test.ts (1) — VERIFY (runId tr_mrmsh033_0685784d): WIP arrived unformatted; fixed via prettier --write.
- **[archive_only_evidence]** verification: vitest + prettier --check + tsx checker (chained) (0) — VERIFY (runId tr_mrmshsct_2be7427b): post-format re-verify — 15/15, prettier clean, real-source checker exit 0.
- **[archive_only_evidence]** verification: tsc --noEmit && eslint scripts/check-test-isolation.ts scripts/check-test-isolation.test.ts (1) — VERIFY (runId tr_mrmsi74x_8a045de6): tsc clean; eslint flagged 4 errors (2 pre-existing pattern + 2 WIP copy) — fixed with typed catch + cause.
- **[archive_only_evidence]** verification: vitest + prettier + eslint + tsc + tsx checker (full chain) (0) — VERIFY (runId tr_mrmsjyd3_f7fa262d): final full chain green — 15/15 tests, prettier clean, eslint clean (both files), tsc clean, checker exit 0 on real source.
- **[unresolved_action]** consumer_warnings: design_concern_promoted: Orchestrator auto-checkpoint c6a369e5 committed during session swept in unrelated WIP (plugin/src/temporal/__tests__/with-test-env.test.ts, +61 lines) that appeared mid-session from outside this task. I did not touch that file per task boundary; its content is unverified by this task.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run scripts/check-test-isolation.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run scripts/check-test-isolation.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec tsx scripts/check-test-isolation.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec prettier --check scripts/check-test-isolation.ts scripts/check-test-isolation.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: vitest + prettier --check + tsx checker (chained)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: tsc --noEmit && eslint scripts/check-test-isolation.ts scripts/check-test-isolation.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: vitest + prettier + eslint + tsc + tsx checker (full chain)
- **[archive_only_evidence]** decisions: Warning-free evidence resubmit citing recorded adv_run_test — AC1/DONT1 guard forbidding raw TestWorkflowEnvironment.create* outside helper; re-verified green.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- scripts/check-test-isolation.test.ts (0) — Guard suite 15/15 green (rejects planted raw constructor); orchestrator-recorded adv_run_test evidence.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- scripts/check-test-isolation.test.ts
- **[archive_only_evidence]** decisions: Warning-free resubmit with embedded evidence — AC1/DONT1 guard; runs real and green.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- scripts/check-test-isolation.test.ts (0) — Guard suite 15/15 green; adv_run_test.v1 evidence embedded in task verification.
- **[archive_only_evidence]** decisions: Proved the crash path with a separate SIGKILLed child fixture process instead of trying to crash the vitest worker itself — A genuine 'finally cannot run' leak requires the owning process to die hard; SIGKILLing our own test runner would abort the suite. The fixture child creates the env via the named helper constructor, reports the real serverPid synchronously (writeSync), then SIGKILLs itself (observed exit 137; server orphaned to PPid 1) — a faithful crashed-runner leak that the parent test can then sweep and assert on.
- **[archive_only_evidence]** decisions: Located the crash fixture at plugin/test/fixtures/temporal/crash-leaks-test-server.mts, run via plain-node type stripping — plugin/test/ sits outside tsconfig include (src/**), eslint (src/), prettier --check (src/), vitest include, and both check-test-isolation walkers, so the fixture adds zero gate surface; .mts + Node 24 type stripping runs the helper's .ts import directly with no build step. Fixture still constructs through the named helper wrapper, so the raw-constructor guard is respected in spirit and letter.
- **[archive_only_evidence]** decisions: Scaled the conservative thresholds (MIN_AGE=2s, TERM_GRACE=3s) with PID-scoped sweep instead of touching production defaults — The reaper's safety bounds (same-UID, exact basename, 7200s default min age, pre-signal identity revalidation, TERM→KILL) are contract items; the PID positional seam exists precisely for tests and keeps every check active. Aging the real orphan 2.5s makes it provably outside the run window at the scaled threshold while the fresh REAL peer (~0s) exercises the AC4 skip path.
- **[archive_only_evidence]** decisions: afterEach SIGKILL backstop over a tracked-PID set, plus finally-scoped peer teardown — A failing assertion in these tests could otherwise leak a real server or double; the backstop killed the RED-run leak automatically (host verified clean after every run).
- **[archive_only_evidence]** verification: pnpm exec vitest run src/temporal/__tests__/with-test-env-residue.itest.ts (RED: no finally-wrapper in test 1, DRY_RUN sweep in test 2) (1) — RED tr_mrmtnfaz_ef9417ef: both tests fail exactly at leak-detection assertions (real server alive 5s after induced failure without teardown; DRY_RUN sweep leaves crashed-runner residue) — proves the proof detects real residue. Wall 10.0s.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/temporal/__tests__/with-test-env-residue.itest.ts (GREEN) (0) — GREEN tr_mrmto5l2_4b8ea19a: 2/2 pass. Vitest duration 4.44s (tests 3.87s). Real server torn down on induced failure; crashed-runner real leak TERM-reaped by conservative sweep; fresh real peer + start-dev/7233 double untouched with skip-log assertions.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/temporal/__tests__/with-test-env-residue.itest.ts (post-prettier verify) (0) — verify tr_mrmtqtfh_1238023d: 2/2 pass on the formatted file, vitest 4.40s.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/temporal/__tests__/with-test-env.test.ts (0) — verify tr_mrmtok56_43f2ff16: 11 passed + 1 expected fail (designed timeout test) — existing helper suite unaffected.
- **[archive_only_evidence]** verification: pnpm run check (0) — schemas:check + tsc --noEmit + check-test-isolation + check-lockfile-policy + eslint + prettier --check all green (after one prettier --write normalization of the new itest).
- **[archive_only_evidence]** verification: pgrep -af temporal-test-server-sdk (1) — No test-server processes on host after RED, GREEN, and verify runs — no residue escaped the suite backstops.
- **[archive_only_evidence]** verification: manual mechanism smoke: node crash fixture → real leaked server (argv /tmp/temporal-test-server-sdk-typescript-1.17.2, PPid 1, uid 1000) → OC_TEST_REAPER_MIN_AGE_SECONDS=1 bash bin/lib/oc-test-reaper.bash <pid> (0) — Fixture exit 137 (SIGKILL); reaper logged 'TERM pid 327417 (/tmp/temporal-test-server-sdk-typescript-1.17.2, age 17.380s)' and 'pid 327417 exited after TERM'; /proc entry gone.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/temporal/__tests__/with-test-env-residue.itest.ts (RED: no finally-wrapper in test 1, DRY_RUN sweep in test 2)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/temporal/__tests__/with-test-env-residue.itest.ts (GREEN)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/temporal/__tests__/with-test-env-residue.itest.ts (post-prettier verify)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/temporal/__tests__/with-test-env.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pgrep -af temporal-test-server-sdk
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: manual mechanism smoke: node crash fixture → real leaked server (argv /tmp/temporal-test-server-sdk-typescript-1.17.2, PPid 1, uid 1000) → OC_TEST_REAPER_MIN_AGE_SECONDS=1 bash bin/lib/oc-test-reaper.bash <pid>
- **[archive_only_evidence]** decisions: Warning-free evidence resubmit citing recorded adv_run_test — AC5/AC2 real-server residue proof; independently re-verified green with live skip-log evidence.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/temporal/__tests__/with-test-env-residue.itest.ts (0) — Real-server residue proof 2/2 green (induced-failure teardown + crashed-runner reap; fresh peer + 7233 untouched); orchestrator-recorded adv_run_test evidence.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/temporal/__tests__/with-test-env-residue.itest.ts
- **[archive_only_evidence]** decisions: Test hermeticizes OC_TEST_REAPER_* environment and waits boundedly for process exit — Prevents inherited test knobs and asynchronous exit timing from invalidating real-residue proof.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/temporal/__tests__/with-test-env-residue.itest.ts (0) — 2 passed; durable acceptance evidence tr_mrmvoqs3_4ae8ebac.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/temporal/__tests__/with-test-env-residue.itest.ts
- **[archive_only_evidence]** decisions: Warning-free resubmit with embedded evidence — AC5/AC2 residue proof; runs real and green.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/temporal/__tests__/with-test-env-residue.itest.ts (0) — Real-server residue proof 2/2 green; adv_run_test.v1 evidence embedded in task verification.
- **[unresolved_action]** required_main_agent_actions: Route the AC5 blocker for in-scope remediation: add and run a real TestWorkflowEnvironment induced-failure regression with per-run process/residue assertions, then request a new acceptance review.
- **[unresolved_action]** required_main_agent_actions: Do not treat the existing bin/oc-test-reaper.test.ts fake-double assertion as live Temporal residue proof.

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| AC1 | acceptance_criterion | pass |
| AC2 | acceptance_criterion | pass |
| AC3 | acceptance_criterion | pass |
| AC4 | acceptance_criterion | pass |
| AC5 | acceptance_criterion | pass |
| C1 | constraint | respected |
| DONT1 | avoidance | respected |
| OOS1 | out_of_scope | not_applicable |

## Unresolved Actions

- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/temporal/__tests__/with-test-env.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/temporal/__tests__/with-test-env.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/temporal/workflows.ops-follow-up.test.ts src/temporal/__tests__/workflow-termination.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/temporal/__tests__/continue-as-new.itest.ts src/temporal/out-of-process-worker.itest.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/temporal/__tests__/with-test-env.test.ts
- Confirm single ownership of tk-f6a98b1bdb31 — a concurrent resume session (oc PID 14957) edited this task's files mid-run; final merged state is green but double-spawn risks conflicting writes
- Triage the pre-existing bin/adv.test.ts slop-scan failure (host env: sg installed) — assign to the bin/adv dispatcher owner; do not block this change on it
- verification_mismatch: Concurrent session oc PID 14957 (started 20:11 EDT, 'Resume ADV change: reapLeakedTestServers') edited bin/lib/oc-test-reaper.bash at 20:37:28 and bin/oc-test-reaper.test.ts at 20:37:38 while this task ran. Edits were complementary (sub-second _age_seconds_linux + awk float age compare; AC5 timing 3000ms/MIN_AGE=2). Final merged state re-verified green in runId tr_mrms7c7k_200cbe35. Orchestrator should confirm only one worker owns this task to avoid double-handing.
- verification_missing: No adv_run_test evidence found for reported command: bun test bin/oc-test-reaper.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bun test bin/oc-test-reaper.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bun test bin/
- verification_missing: No adv_run_test evidence found for reported command: bun test bin/adv.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bun test bin/oc-test-reaper.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bun test bin/oc-test-reaper.test.ts
- Attribute/verify the with-test-env.test.ts WIP swept into checkpoint c6a369e5 (not part of this task's scope).
- design_concern_promoted: Orchestrator auto-checkpoint c6a369e5 committed during session swept in unrelated WIP (plugin/src/temporal/__tests__/with-test-env.test.ts, +61 lines) that appeared mid-session from outside this task. I did not touch that file per task boundary; its content is unverified by this task.
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run scripts/check-test-isolation.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run scripts/check-test-isolation.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec tsx scripts/check-test-isolation.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec prettier --check scripts/check-test-isolation.ts scripts/check-test-isolation.test.ts
- verification_missing: No adv_run_test evidence found for reported command: vitest + prettier --check + tsx checker (chained)
- verification_missing: No adv_run_test evidence found for reported command: tsc --noEmit && eslint scripts/check-test-isolation.ts scripts/check-test-isolation.test.ts
- verification_missing: No adv_run_test evidence found for reported command: vitest + prettier + eslint + tsc + tsx checker (full chain)
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- scripts/check-test-isolation.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/temporal/__tests__/with-test-env-residue.itest.ts (RED: no finally-wrapper in test 1, DRY_RUN sweep in test 2)
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/temporal/__tests__/with-test-env-residue.itest.ts (GREEN)
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/temporal/__tests__/with-test-env-residue.itest.ts (post-prettier verify)
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/temporal/__tests__/with-test-env.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- verification_missing: No adv_run_test evidence found for reported command: pgrep -af temporal-test-server-sdk
- verification_missing: No adv_run_test evidence found for reported command: manual mechanism smoke: node crash fixture → real leaked server (argv /tmp/temporal-test-server-sdk-typescript-1.17.2, PPid 1, uid 1000) → OC_TEST_REAPER_MIN_AGE_SECONDS=1 bash bin/lib/oc-test-reaper.bash <pid>
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/temporal/__tests__/with-test-env-residue.itest.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/temporal/__tests__/with-test-env-residue.itest.ts
- Route the AC5 blocker for in-scope remediation: add and run a real TestWorkflowEnvironment induced-failure regression with per-run process/residue assertions, then request a new acceptance review.
- Do not treat the existing bin/oc-test-reaper.test.ts fake-double assertion as live Temporal residue proof.
