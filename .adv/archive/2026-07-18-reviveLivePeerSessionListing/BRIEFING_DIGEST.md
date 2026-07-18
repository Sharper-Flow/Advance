# Archive Briefing Digest

**Change ID:** reviveLivePeerSessionListing
**Title:** Revive live peer session listing
**Status:** archived
**Generated:** 2026-07-18T20:04:04.079Z

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

Showing 25 of 25 durable facts.

- **[archive_only_evidence]** decisions: Mocked detectPeerSessions and procfs helpers with vi.mock + importActual instead of using the raw __setProcessScannerForTests seam. — Keeps the listPeerSessions tests deterministic and isolated from git-common-dir matching; the peer-sessions module already has its own tests for matching logic.
- **[archive_only_evidence]** decisions: Preserved the existing adv_session_show tests and the isPidAlive helper test unchanged. — The approved design explicitly excludes adv_session_show/ACL changes; keeping them green validates no accidental regression.
- **[archive_only_evidence]** decisions: Computed expected sessionId and startedAt deterministically in the test helpers. — Makes the stable-ID and timestamp contracts explicit without relying on the implementation.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/tools/session/index.test.ts (1) — 13 tests, 5 failed (new adv_session_list live-source assertions), 8 passed (preserved isPidAlive + adv_session_show ACL). Failures are semantic: production still returns empty listSessions stub and does not set unavailable.
- **[archive_only_evidence]** decisions: Added the terminology assertion as a hard equality rather than a loose substring match — The existing test used expect.objectContaining({ source: 'peer_sessions' }), which allowed the stale 'session registry' wording to pass. A hard equality forces the terminology update and makes the RED failure unambiguous.
- **[archive_only_evidence]** decisions: Did not edit production code despite the RED failure — Task is explicitly TDD RED PHASE ONLY; production fix is intentionally left for the next task/attempt so the RED failure is the deliverable.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/backlog.test.ts (1) — Expected RED failure: 1 failed (uses live peer-session detection terminology when sessions are unavailable), 10 passed. Failure: production emits 'session registry unavailable' but test expects 'live peer-session detection unavailable'.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/backlog.test.ts
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/backlog.test.ts (0) — 12 passed (1 test file), GREEN: live peer-session detection terminology and projection mapping verified
- **[archive_only_evidence]** verification: pnpm run format:check (0) — All matched files use Prettier code style; only the two target files changed.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run format:check
- **[archive_only_evidence]** verification: pnpm run check (0) — Passed: schemas:check, typecheck, generate:manifests:check, test-isolation, lockfile-policy, lint, format:check.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/session/index.test.ts src/tools/backlog.test.ts src/utils/peer-sessions.test.ts src/migration/procfs.test.ts (0) — Passed: 4 test files, 45 tests.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] PID-reuse-safe liveness needs a start-tick snapshot captured during process discovery. Reading start ticks only after a scan completes compares a process to itself and can accept a newly reused PID with stale discovery metadata.
- **[archive_only_evidence]** changes_made: plugin/src/utils/peer-sessions.ts: Captured each scanned process's /proc start ticks before executable/CWD reads and preserved them as internal peer metadata, creating a scan-time identity snapshot for PID-reuse validation.
- **[archive_only_evidence]** changes_made: plugin/src/tools/session/index.ts: Validated detected peers against scan-time start ticks rather than a post-scan-only read, preventing a reused PID from being projected with stale peer metadata.
- **[archive_only_evidence]** changes_made: plugin/src/tools/session/index.test.ts: Added regression coverage proving list projection supplies scan-time ticks to PID-reuse-safe liveness validation.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/tools/session/index.test.ts, bin/oc-test targeted -- src/tools/session/index.test.ts src/utils/peer-sessions.test.ts src/tools/backlog.test.ts, pnpm run check results=pass — Added regression test failed before remediation (0 sessions where self plus peer expected because post-scan ticks were used). Final focused suite: 3 files, 33 tests passed. pnpm run check passed schemas, typecheck, manifests, isolation, lockfile policy, lint, and format checks. git diff --check passed for branch and reviewer edits.
- **[unresolved_action]** required_main_agent_actions: Route production-readiness-1 for an in-scope remediation: reject peer candidates without scan-time startTicks and add regression coverage; rerun focused session/backlog/procfs tests.
- **[unresolved_action]** required_main_agent_actions: Do not release until AC5 regression test and remediation are accepted.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] PID-reuse safety requires preserving a scan-time process-identity snapshot. Re-reading /proc start ticks after discovery cannot distinguish a replacement process from the discovered process.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/tools/session/index.test.ts src/tools/backlog.test.ts src/utils/peer-sessions.test.ts src/migration/procfs.test.ts results=pass — 45/45 focused tests passed. Latest attempt-2 reports also show pnpm run check passed and this focused suite passed. The passing suite lacks null scan-time startTicks coverage, so it does not discharge AC5.
- **[unresolved_action]** required_main_agent_actions: Release hardening clear; proceed with normal release gate actions.
- **[wisdom_candidate]** wisdom_candidates: [success] Fail-closed omission of peers without scan-time start ticks preserves PID-reuse safety: missing identity evidence is not replaced with a fresh /proc read.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/tools/session/index.test.ts src/tools/backlog.test.ts src/utils/peer-sessions.test.ts src/migration/procfs.test.ts, pnpm run check results=pass — Durable focused evidence tr_mrqslg6y_2aa56c87 passed 46/46 after the AC5 regression test; latest engineer report states pnpm run check passed. Re-review confirmed lines 194-205 omit and count peers with null scan-time startTicks without a fresh tick read. git status --porcelain empty and git diff --check trunk...HEAD clean.

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
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |

## Unresolved Actions

- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/backlog.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm run format:check
- Route production-readiness-1 for an in-scope remediation: reject peer candidates without scan-time startTicks and add regression coverage; rerun focused session/backlog/procfs tests.
- Do not release until AC5 regression test and remediation are accepted.
- Release hardening clear; proceed with normal release gate actions.
