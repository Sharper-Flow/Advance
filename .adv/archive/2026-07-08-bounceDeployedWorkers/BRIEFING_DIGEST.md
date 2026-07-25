# Archive Briefing Digest

**Change ID:** bounceDeployedWorkers
**Title:** Bounce deployed workers
**Status:** archived
**Generated:** 2026-07-25T19:26:48.844Z

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

Showing 13 of 13 durable facts.

- **[report_follow_up]** follow_ups: Prep: add task/criterion for multi-PID bounce (multiple OpenCode sessions/checkouts can each spawn a worker against the same synced dist/temporal/worker.js).
- **[report_follow_up]** follow_ups: Prep: add task/criterion that post-SIGTERM verification is a single bounded liveness re-check, not a poll loop, to satisfy C2/DDC2.
- **[report_follow_up]** follow_ups: Prep: confirm advance-meta spec requirement wording covers exact-path matching, read-only no-signal, and loud non-zero failure so the law matches DDC1-DDC4.
- **[research_citation]** sources: deploy-local.sh runtime sync boundary: Runtime plugin sync via rsync -a --delete into $ADV_RUNTIME_PLUGIN_PATH; 'synced runtime plugin' echo at line 1145 is the exact insertion point the design cites. Confirms bounce-after-sync ordering is correct. (/home/jon/dev/advance/scripts/deploy-local.sh:1130-1146)
- **[research_citation]** sources: deploy-local.sh --check early exit: --check runs check_config/check_adv_cli_install then exits BEFORE asset sync (line 1128+). Confirms design step 4: --check must be reporting-only and cannot rely on a fresh sync. Also confirms --dry-run guards at 1139-1140 skip real rsync. (/home/jon/dev/advance/scripts/deploy-local.sh:1116-1123)
- **[research_citation]** sources: resolveWorkerScriptPath: Worker resolved as ../dist/temporal/worker.js relative to dist/index.js → resolves to $ADV_RUNTIME_PLUGIN_PATH/dist/temporal/worker.js at runtime. Matches the design's exact target path. (/home/jon/dev/advance/plugin/src/plugin-init.ts:140-156)
- **[research_citation]** sources.omitted: 5 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: The design localizes bounce behavior at the one correct control surface: deploy-local.sh is the sole local runtime plugin sync owner (verified 1130-1146), and inserting bounce handling right after the 'synced runtime plugin' echo makes the observable deploy result match the file-sync result. The load-bearing correctness claim — exact-path process matching — is structurally supported by source: the OOP worker is spawned as `process.execPath <abs>/dist/temporal/worker.js` (runtime-manager.ts:306-307, worker-multi.ts:322), so the absolute runtime worker path appears verbatim in argv and can be matched exactly against process command lines, satisfying AC2/DONT2/DDC1. SIGTERM-by-default is consistent with the established graceful shutdown signal (worker-multi.ts:511). Read-only mode safety is well-founded: --check exits before sync (1116-1123) and --dry-run guards rsync (1139-1140), so the design's insistence that --check be reporting-only and never require a fresh sync is correct and non-obvious — a real correctness catch. The test strategy matches the existing deploy-local.test.ts contents-assertion pattern. Two residual gaps are acknowledged in the design itself (SIGTERM may leave no respawned worker if the owning session exited; command-line truncation/inaccessibility on some systems) with loud-failure mitigations, consistent with KD4/AC3. No spec-law contradiction found; the design plans to add advance-meta requirements rather than violate existing ones.
- **[archive_only_evidence]** verification: tests_run=bash -n scripts/deploy-local.sh, bin/oc-test targeted -- src/deploy-local.test.ts results=pass — Path preflight OK for all focus files. Reviewed branch diff against merge-base e7b017a692d6626894e7af4cc5ec66ac564ba72d and inspected source lines for worker matching, SIGTERM bounce, read-only modes, ACTION_REQUIRED output, spec/doc additions, and deploy-local tests. `bash -n scripts/deploy-local.sh` passed. `bin/oc-test targeted -- src/deploy-local.test.ts` passed: 70/70 tests. Initial wrapper invocation with repo-prefixed test path found no tests; corrected to plugin-relative path and passed.
- **[archive_only_evidence]** findings: [info] release-deploy-readiness: DEP-1 resolved: git hooks now capture deploy-local failure output and print it to stderr instead of suppressing [ADV:ACTION_REQUIRED].
- **[archive_only_evidence]** findings: [info] release-deploy-readiness: DEP-2 resolved: deployed worker script path is canonicalized before exact argv matching.
- **[archive_only_evidence]** findings: [info] test-coverage: Affected deploy-local behavior, spec requirements, hook-output regression, and docs mention are covered by tests.
- **[archive_only_evidence]** findings: [info] cleanup-readiness: No cleanup candidates found; tree clean after harden checkpoint.

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| SC1 | success_criterion | pass |
| SC2 | success_criterion | pass |
| SC3 | success_criterion | pass |
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
| DONT4 | avoidance | respected |
| DONT5 | avoidance | respected |
| OOS1 | out_of_scope | not_applicable |
| OOS2 | out_of_scope | not_applicable |
| OOS3 | out_of_scope | not_applicable |

## Unresolved Actions

None
