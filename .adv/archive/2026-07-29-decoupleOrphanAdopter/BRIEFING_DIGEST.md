# Archive Briefing Digest

**Change ID:** decoupleOrphanAdopter
**Title:** Decouple orphan adopter construction
**Status:** archived
**Generated:** 2026-07-29T03:35:41.158Z

## Identity Anchors

- CHANGE
- STATUS
- TERMINAL_GATE_SUMMARY
- Origin: triage

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

- **[unresolved_action]** scope_drift: finish_owned_scope_then_report: No scope drift. T8 confined to plugin-init.ts export change + source assertion test.
- **[archive_only_evidence]** verification: tests_run=plugin-init.registrar-guard.test.ts results=pass — adv_run_test tr_ms58uwdn (phase:green) includes plugin-init.registrar-guard.test.ts: source assertion confirms registerInProcessTemporalWorker is not exported via function or re-export pattern. 41/41 tests pass. Zero external production callers found via grep audit.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: plugin-init.registrar-guard.test.ts
- **[unresolved_action]** scope_drift: finish_owned_scope_then_report: No scope drift. T8 confined to plugin-init.ts export change + source assertion test.
- **[archive_only_evidence]** verification: tests_run=plugin-init.registrar-guard.test.ts results=pass — adv_run_test run tr_ms59ljkc (phase:green, taskId tk-6a2c0bb6f909): pnpm vitest run src/__tests__/plugin-init.registrar-guard.test.ts — 2/2 pass. Source assertion confirms registerInProcessTemporalWorker is not exported via function or re-export pattern.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: plugin-init.registrar-guard.test.ts
- **[unresolved_action]** required_main_agent_actions: Remediate blocker ac5-ac9-c6-lifecycle-1 in plugin/src/plugin-init.ts and add regression coverage before acceptance.
- **[unresolved_action]** required_main_agent_actions: Update doctor recommendation selection so any `verification.healthy === false` outcome never states `System healthy; no action needed.`
- **[unresolved_action]** required_main_agent_actions: Re-run the cited unit, Temporal integration, and typecheck verification after remediation.
- **[unresolved_action]** required_main_agent_actions: AC review: AC1-AC4, AC6-AC8, and AC10 have implementation/test evidence; AC5 and AC9 fail lifecycle-state inspection. Constraints C1-C5 and C7 pass; C6 fails on init-failure cleanup. DONT1-DONT3 and DONT5-DONT8 pass by reviewed implementation; DONT4 has no adoption-path restart advice, though pre-existing generic fallback text remains in doctor.ts.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] A global active-adopter diagnostic must be cleared or recomputed when its worker attachment tears down; stopping only the interval leaves a stale healthy-looking adoption state after drain.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/plugin-init.orphan-adopter-restart.test.ts src/plugin-init.worker-singleton.test.ts src/plugin-init.session-registration.test.ts src/tools/doctor.test.ts src/__tests__/plugin-init.registrar-guard.test.ts, bin/oc-test targeted -- --project temporal src/temporal/__tests__/orphan-session-adoption.itest.ts, pnpm --dir plugin run typecheck results=pass — Targeted unit suite: 41/41 passed. Real Temporal integration: 2/2 passed. Typecheck passed. Initial wrapper invocation with plugin-prefixed paths found no tests; corrected paths are relative to plugin and passed. Review inspection identified untested teardown/init-failure state leakage.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/plugin-init.orphan-adopter-restart.test.ts src/plugin-init.worker-singleton.test.ts src/plugin-init.session-registration.test.ts src/tools/doctor.test.ts src/__tests__/plugin-init.registrar-guard.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- --project temporal src/temporal/__tests__/orphan-session-adoption.itest.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir plugin run typecheck
- **[archive_only_evidence]** changes_made: plugin/src/plugin-init.ts: teardownWorkerAttachment clears activeOrphanQueueAdopter and adoptionConstructionState when the torn-down attachment was the active one
- **[archive_only_evidence]** changes_made: plugin/src/plugin-init.ts: Init-failure catch calls teardownWorkerAttachment(worker) before worker.shutdown()
- **[unresolved_action]** scope_drift: finish_owned_scope_then_report: No scope drift. All changes confined to plugin host. No Temporal workflow-code changes (C5).
- **[archive_only_evidence]** verification: tests_run=plugin-init.orphan-adopter-restart.test.ts (10), plugin-init.worker-singleton.test.ts (4), plugin-init.session-registration.test.ts (5), doctor.test.ts (18), plugin-init.registrar-guard.test.ts (1), orphan-session-adoption.itest.ts (2 integration) results=pass — 42/42 unit tests pass (tr_ms59ijyb green), 2/2 integration tests pass (tr_ms5981s8 real Temporal server), typecheck/lint/format clean. All 10 ACs verified: AC1-AC10 pass. All C1-C7 constraints and DONT1-DONT8 avoidances verified.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: plugin-init.orphan-adopter-restart.test.ts (10)
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: plugin-init.worker-singleton.test.ts (4)
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: plugin-init.session-registration.test.ts (5)
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: doctor.test.ts (18)
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: plugin-init.registrar-guard.test.ts (1)
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: orphan-session-adoption.itest.ts (2 integration)

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
| AC8 | acceptance_criterion | pass |
| AC9 | acceptance_criterion | pass |
| AC10 | acceptance_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| C4 | constraint | respected |
| C5 | constraint | respected |
| C6 | constraint | respected |
| C7 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |
| DONT4 | avoidance | respected |
| DONT5 | avoidance | respected |
| DONT6 | avoidance | respected |
| DONT7 | avoidance | respected |
| DONT8 | avoidance | respected |

## Unresolved Actions

- finish_owned_scope_then_report: No scope drift. T8 confined to plugin-init.ts export change + source assertion test.
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: plugin-init.registrar-guard.test.ts
- finish_owned_scope_then_report: No scope drift. T8 confined to plugin-init.ts export change + source assertion test.
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: plugin-init.registrar-guard.test.ts
- Remediate blocker ac5-ac9-c6-lifecycle-1 in plugin/src/plugin-init.ts and add regression coverage before acceptance.
- Update doctor recommendation selection so any `verification.healthy === false` outcome never states `System healthy; no action needed.`
- Re-run the cited unit, Temporal integration, and typecheck verification after remediation.
- AC review: AC1-AC4, AC6-AC8, and AC10 have implementation/test evidence; AC5 and AC9 fail lifecycle-state inspection. Constraints C1-C5 and C7 pass; C6 fails on init-failure cleanup. DONT1-DONT3 and DONT5-DONT8 pass by reviewed implementation; DONT4 has no adoption-path restart advice, though pre-existing generic fallback text remains in doctor.ts.
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/plugin-init.orphan-adopter-restart.test.ts src/plugin-init.worker-singleton.test.ts src/plugin-init.session-registration.test.ts src/tools/doctor.test.ts src/__tests__/plugin-init.registrar-guard.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- --project temporal src/temporal/__tests__/orphan-session-adoption.itest.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir plugin run typecheck
- finish_owned_scope_then_report: No scope drift. All changes confined to plugin host. No Temporal workflow-code changes (C5).
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: plugin-init.orphan-adopter-restart.test.ts (10)
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: plugin-init.worker-singleton.test.ts (4)
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: plugin-init.session-registration.test.ts (5)
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: doctor.test.ts (18)
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: plugin-init.registrar-guard.test.ts (1)
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: orphan-session-adoption.itest.ts (2 integration)
