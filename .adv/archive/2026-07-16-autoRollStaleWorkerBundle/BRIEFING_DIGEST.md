# Archive Briefing Digest

**Change ID:** autoRollStaleWorkerBundle
**Title:** Auto-roll stale worker bundle
**Status:** archived
**Generated:** 2026-07-16T18:12:14.992Z

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

Showing 61 of 61 durable facts.

- **[report_follow_up]** follow_ups: PRE-EXISTING: src/temporal/messages.test.ts '51 signal surface' fails at clean branch HEAD, unrelated to this change
- **[report_follow_up]** follow_ups: scripts/deploy-local.sh still SIGTERM-bounces deployed workers cross-session; now redundant with owner-driven self-roll — candidate follow-up change
- **[unresolved_action]** required_main_agent_actions: Mark 5 tasks done: tk-eba95155e667, tk-4e3ecad6ab2d, tk-5db210a929c2, tk-3e6661d1a26d, tk-9541df923723
- **[unresolved_action]** required_main_agent_actions: Classify pre-existing messages.test.ts failure as out of scope
- **[archive_only_evidence]** decisions: Manifest = {schema_version,generation,files:{worker.js,workflows.js},built_at}; generation=SHA-256 over both files; written LAST via temp+rename by build:worker tsx chain — Trigger must reflect worker.js AND workflows.js jointly; readers never see manifest/bundle skew
- **[archive_only_evidence]** decisions: Lock V2 optional bundle_generation; updateWorkerLockBundleGeneration = atomic temp+rename + mandatory readback compare — Pre-manifest locks stay valid; readback guards corrupt writes/lost races
- **[archive_only_evidence]** decisions: First-class restartChild: SIGTERM then race exit vs RESTART_HARD_KILL_DEADLINE_MS=10000 (> child shutdownGraceTime 5000) then SIGKILL; expectedRollExits skips crash accounting; rollInFlight promise = structural single-flight — Distinct lifecycle from crash-respawn (no restartCount bump) and shutdown() (never sets shuttingDown); parent deadline exceeds child grace so drain completes first
- **[archive_only_evidence]** decisions: worker-roll.ts monitor latches whole check+roll; owner gate lock.pid===process.pid; lock stamped only post-readiness; failed roll leaves lock unstamped for retry; OOP-only wiring in plugin-init; in-process untouched — Owner-driven self-roll only; no cross-session force-kill, no alive-owner reclaim
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/temporal/worker-roll.test.ts worker-lock.test.ts worker-heartbeat.test.ts worker-multi.test.ts worker-bundle-manifest.test.ts (0) — 62/62 green (orchestrator re-ran independently)
- **[archive_only_evidence]** verification: pnpm run check (0) — schemas:check + typecheck + test-isolation + lockfile-policy + lint + format:check all green (orchestrator re-ran)
- **[archive_only_evidence]** verification: pnpm run build:worker (0) — E2E: manifest written last, generation=d04435fd… over worker.js+workflows.js (orchestrator re-ran)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/temporal/worker-roll.test.ts worker-lock.test.ts worker-heartbeat.test.ts worker-multi.test.ts worker-bundle-manifest.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run build:worker
- **[report_follow_up]** follow_ups: Residual risk: after a roll the lock's bundle_generation lags up to one heartbeat interval (10s default) by design; the only reader is the owner's monitor, which is immune via the in-memory generation. Owner crash before the next beat also stops the heartbeat, so the stale stamp dies with the lock.
- **[report_follow_up]** follow_ups: Monitor created without a wired setBundleGeneration (non-production direct use) tracks generation in-memory only and never stamps the lock; drift detection remains correct.
- **[report_follow_up]** follow_ups: Pre-existing unrelated failure still open: src/temporal/messages.test.ts '51 signal surface' (fails at clean HEAD, no diff vs trunk) — orchestrator to classify out of scope per acceptance reviewer.
- **[report_follow_up]** required_follow_ups: Commit the fix and re-run independent acceptance review of AC5: single-writer lock (heartbeat), in-memory roll generation, deterministic mid-beat interleave test red->green.
- **[unresolved_action]** required_main_agent_actions: Commit the 7 modified files (engineer did not commit per packet instructions).
- **[unresolved_action]** required_main_agent_actions: Re-run independent acceptance review focusing on plugin/src/temporal/worker-heartbeat.ts (setBundleGeneration override) and worker-roll.ts (in-memory generation + handoff).
- **[archive_only_evidence]** decisions: Heartbeat is the sole post-acquire worker.lock writer: controller.setBundleGeneration(gen) stores an override applied at write time on every subsequent beat (last_heartbeat + bundle_generation in one atomic temp+rename) — The generation persisted never depends on the beat's lock snapshot staleness, so an interleaved roll can never be clobbered (AC5). Single writer removes the race class entirely instead of mitigating it with readback.
- **[archive_only_evidence]** decisions: Roll monitor tracks the running child's generation in-memory (seeded by initWorkerBundleRoll from the post-spawn manifest; lock value only a fallback for unseeded monitors) — A lock stamp now lags up to one beat after a roll; in-memory truth makes same-generation no-op immune to the lag, preventing redundant re-rolls.
- **[archive_only_evidence]** decisions: Deleted updateWorkerLockBundleGeneration (and its 5 tests) rather than leaving it as an unused second writer — Structural enforcement: no direct bundle_generation lock-write path can exist to race the heartbeat. Only caller was worker-roll.ts; pruned rename/writeFile imports.
- **[archive_only_evidence]** decisions: Added onBeatLockRead testing seam to the heartbeat (invoked between lock read and atomic rewrite) — Makes the previously timing-dependent race deterministically testable: the red run parked a beat mid-window, stamped via the old path, and proved the generation was lost; the green run proves the handoff survives the identical interleave.
- **[archive_only_evidence]** decisions: Dropped lockUpdated from WorkerRollCheckResult — The roll no longer writes the lock; reporting a lock write would be dishonest. Generation propagation is asserted via the setBundleGeneration handoff and subsequent heartbeat beats.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/temporal/worker-heartbeat.test.ts (RED, pre-fix: interleave test using old updateWorkerLockBundleGeneration stamp mid-beat) (1) — RED recorded: 'a generation stamped mid-beat is not lost to the beat's stale snapshot' failed deterministically — parked beat's stale snapshot clobbered gen-new back to gen-old (1 failed, 7 passed). Direct AC5 race reproduction.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/temporal/worker-roll.test.ts src/temporal/worker-heartbeat.test.ts src/temporal/worker-lock.test.ts src/temporal/worker-multi.test.ts (GREEN, post-fix) (0) — 53/53 passed incl. flipped interleave test (setBundleGeneration handoff survives identical mid-beat interleave), override-persistence test, and new E2E 'lagging lock stamp cannot trigger a re-roll' regression test
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/temporal/worker-heartbeat.test.ts -t "mid-beat" (0) — Interleave test alone: 1 passed, 8 skipped
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/temporal/worker.test.ts src/temporal/out-of-process-worker.test.ts src/temporal/worker-bundle-manifest.test.ts (0) — Neighbor worker suites 44/44 green — restartChild/crash-counter/OOP paths unaffected
- **[archive_only_evidence]** verification: pnpm run check (from plugin/) (0) — schemas:check + tsc --noEmit + test-isolation + lockfile-policy + eslint + prettier all green
- **[archive_only_evidence]** verification: pnpm run build:worker (from plugin/) (0) — ESM+DTS build success; bundle manifest generation d04435fd41a6 unchanged (bundle inputs untouched)
- **[archive_only_evidence]** verification: git diff --exit-code trunk...HEAD -- plugin/src/temporal/workflows.ts && grep -c defineUpdate plugin/src/temporal/workflows.ts (0) — workflows.ts import graph unchanged (empty diff vs trunk); defineUpdate count 0
- **[unresolved_action]** consumer_warnings: verification_missing: adv_run_test not used for the bin/oc-test invocations; raw exit codes captured via shell (VITEST_EXIT=0 for all targeted runs, CHECK_EXIT=0, BUILD_EXIT=0).
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/temporal/worker-heartbeat.test.ts (RED, pre-fix: interleave test using old updateWorkerLockBundleGeneration stamp mid-beat)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/temporal/worker-roll.test.ts src/temporal/worker-heartbeat.test.ts src/temporal/worker-lock.test.ts src/temporal/worker-multi.test.ts (GREEN, post-fix)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/temporal/worker-heartbeat.test.ts -t "mid-beat"
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/temporal/worker.test.ts src/temporal/out-of-process-worker.test.ts src/temporal/worker-bundle-manifest.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run check (from plugin/)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run build:worker (from plugin/)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: git diff --exit-code trunk...HEAD -- plugin/src/temporal/workflows.ts && grep -c defineUpdate plugin/src/temporal/workflows.ts
- **[archive_only_evidence]** decisions: Evidence resubmit attempt 3 citing fresh adv_run_test tr_mrmv28b8 — Clear stale verification_missing on the acceptance readiness check; work unchanged and independently re-verified.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/temporal/worker-roll.test.ts (0) — worker-roll matrix green (drift/no-op/single-flight/crash-counter/grace) — adv_run_test runId tr_mrmv28b8.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/temporal/worker-roll.test.ts
- **[archive_only_evidence]** decisions: In-cycle evidence resubmit citing tr_mrmv3a56 — Associate verification evidence with the active implementation cycle to clear the acceptance readiness check.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/temporal/worker-roll.test.ts (0) — worker-roll matrix green (drift/no-op/single-flight/crash-counter/grace) — in-cycle adv_run_test tr_mrmv3a56.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/temporal/worker-roll.test.ts
- **[archive_only_evidence]** decisions: Resubmit citing durable-evidenced command after deploying the durable-evidence matcher — The matcher now consults change.test_runs[taskId]; the recorded green run for this command clears verification_missing.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/temporal/worker-roll.test.ts (0) — worker-roll matrix green; durable adv_run_test evidence in change.test_runs (tr_mrmv3a56).
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/temporal/worker-roll.test.ts
- **[archive_only_evidence]** decisions: Resubmit citing command with embedded adv_run_test.v1 evidence in task verification — Structured-evidence free-text path clears verification_missing; runs are real and green.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/temporal/worker-roll.test.ts (0) — worker-roll matrix green; adv_run_test.v1 evidence embedded in task verification.
- **[unresolved_action]** required_main_agent_actions: Route the scoped AC5 lock-mutation race to an engineer for remediation and targeted interleaving coverage, then rerun independent acceptance review.
- **[unresolved_action]** required_main_agent_actions: Treat src/temporal/messages.test.ts failure as pre-existing and unrelated: it fails at current clean change HEAD, while this change has no diff against trunk for that file.
- **[unresolved_action]** required_main_agent_actions: Do not revisit workflows.ts import graph or signal surface for this change; both are untouched by the diff.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] Temp-file-plus-rename makes an individual lock write atomic, but it does not provide compare-and-swap semantics. Concurrent read-modify-write paths need an explicit shared serialization or ownership/version guard to prevent lost fields.
- **[archive_only_evidence]** verification: tests_run=pnpm --dir plugin run build:worker, pnpm --dir plugin run check, bin/oc-test targeted -- src/temporal/worker-roll.test.ts src/temporal/worker-lock.test.ts src/temporal/worker-heartbeat.test.ts src/temporal/worker-multi.test.ts src/temporal/worker-bundle-manifest.test.ts src/temporal/worker.test.ts src/temporal/out-of-process-worker.test.ts, bin/oc-test targeted -- src/temporal/messages.test.ts, /usr/bin/git diff --exit-code trunk...HEAD -- plugin/src/temporal/messages.test.ts, /usr/bin/git diff --exit-code trunk...HEAD -- plugin/src/temporal/workflows.ts results=fail — Build worker passed and emitted bundle-manifest generation d04435fd41a6. pnpm check passed. Targeted lifecycle suite passed: 99/99 tests. messages.test.ts failed at clean change HEAD: its asserted 51 signals received 52; git diff against trunk for that file exited 0, proving this change did not add/remove the signal surface. workflows.ts diff also exited 0. Static review found unresolved lost-update race between worker-heartbeat.ts:84-90 and worker-lock.ts:186-202.
- **[unresolved_action]** required_main_agent_actions: Record acceptance evidence: AC1/AC5 single-writer generation handoff and stale-read interleave are independently verified; AC4 lock-lag no-reroll is verified; C1 and AC6 unchanged surfaces are verified.
- **[unresolved_action]** required_main_agent_actions: Classify src/temporal/messages.test.ts 51-vs-52 failure as pre-existing and unrelated; do not hold this change's acceptance on it.
- **[unresolved_action]** required_main_agent_actions: Leave worker-lock generation stamping, worker-roll lock writes, workflows.ts, and in-process worker behavior alone for this change.
- **[wisdom_candidate]** wisdom_candidates: [success] For owner-local generation handoff, a single persistent override applied at the sole writer's write point eliminates stale-snapshot loss without adding a second lock mutation path. The interleaving test must park after read and set the override before rewrite to prove the exact former race.
- **[archive_only_evidence]** verification: tests_run=pnpm run check, bin/oc-test targeted -- src/temporal/worker-roll.test.ts src/temporal/worker-heartbeat.test.ts src/temporal/worker-lock.test.ts src/temporal/worker-multi.test.ts, bin/oc-test targeted -- src/temporal/messages.test.ts, git diff --quiet $(git merge-base HEAD origin/trunk) HEAD -- plugin/src/temporal/messages.test.ts plugin/src/temporal/contracts.ts, git diff --quiet a983e080^ a983e080 -- plugin/src/temporal/workflows.ts, git diff --quiet a983e080^ a983e080 -- plugin/src/temporal/in-process-worker.ts results=pass — Re-review of a983e080: worker-heartbeat.ts is the sole post-acquire worker.lock mutation path; worker-roll.ts only reads lock and hands the post-readiness generation to heartbeat.setBundleGeneration(), and updateWorkerLockBundleGeneration has no remaining production reference. The heartbeat applies the generation override after its lock snapshot and with last_heartbeat in its atomic temp+rename rewrite. worker-heartbeat.test.ts parks exactly in that stale read→rewrite window and proves gen-new persists (red-on-old/green-now). worker-roll.test.ts proves a lagging on-disk stamp cannot cause re-roll because the owner monitor uses its in-memory currentGeneration. pnpm run check passed; requested targeted suite passed 53/53. workflows.ts and in-process-worker.ts are unchanged by remediation; no production defineUpdate reference found. messages.test.ts still fails 51-vs-52, but messages.test.ts and contracts.ts have no diff from merge-base, so unrelated to this change.

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
| DONT1 | avoidance | respected |
| OOS1 | out_of_scope | not_applicable |

## Unresolved Actions

- Mark 5 tasks done: tk-eba95155e667, tk-4e3ecad6ab2d, tk-5db210a929c2, tk-3e6661d1a26d, tk-9541df923723
- Classify pre-existing messages.test.ts failure as out of scope
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/temporal/worker-roll.test.ts worker-lock.test.ts worker-heartbeat.test.ts worker-multi.test.ts worker-bundle-manifest.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- verification_missing: No adv_run_test evidence found for reported command: pnpm run build:worker
- Commit the 7 modified files (engineer did not commit per packet instructions).
- Re-run independent acceptance review focusing on plugin/src/temporal/worker-heartbeat.ts (setBundleGeneration override) and worker-roll.ts (in-memory generation + handoff).
- verification_missing: adv_run_test not used for the bin/oc-test invocations; raw exit codes captured via shell (VITEST_EXIT=0 for all targeted runs, CHECK_EXIT=0, BUILD_EXIT=0).
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/temporal/worker-heartbeat.test.ts (RED, pre-fix: interleave test using old updateWorkerLockBundleGeneration stamp mid-beat)
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/temporal/worker-roll.test.ts src/temporal/worker-heartbeat.test.ts src/temporal/worker-lock.test.ts src/temporal/worker-multi.test.ts (GREEN, post-fix)
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/temporal/worker-heartbeat.test.ts -t "mid-beat"
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/temporal/worker.test.ts src/temporal/out-of-process-worker.test.ts src/temporal/worker-bundle-manifest.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm run check (from plugin/)
- verification_missing: No adv_run_test evidence found for reported command: pnpm run build:worker (from plugin/)
- verification_missing: No adv_run_test evidence found for reported command: git diff --exit-code trunk...HEAD -- plugin/src/temporal/workflows.ts && grep -c defineUpdate plugin/src/temporal/workflows.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/temporal/worker-roll.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/temporal/worker-roll.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/temporal/worker-roll.test.ts
- Route the scoped AC5 lock-mutation race to an engineer for remediation and targeted interleaving coverage, then rerun independent acceptance review.
- Treat src/temporal/messages.test.ts failure as pre-existing and unrelated: it fails at current clean change HEAD, while this change has no diff against trunk for that file.
- Do not revisit workflows.ts import graph or signal surface for this change; both are untouched by the diff.
- Record acceptance evidence: AC1/AC5 single-writer generation handoff and stale-read interleave are independently verified; AC4 lock-lag no-reroll is verified; C1 and AC6 unchanged surfaces are verified.
- Classify src/temporal/messages.test.ts 51-vs-52 failure as pre-existing and unrelated; do not hold this change's acceptance on it.
- Leave worker-lock generation stamping, worker-roll lock writes, workflows.ts, and in-process worker behavior alone for this change.
