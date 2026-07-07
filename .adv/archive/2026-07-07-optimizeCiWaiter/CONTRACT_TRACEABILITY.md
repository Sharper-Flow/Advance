# Contract Traceability

**Change ID:** optimizeCiWaiter
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-07T04:11:33.068Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | plugin/src/adv-ci-waiter-assets.test.ts: uses/starts-exactly-one-watch-per-target + 20-30s sampling + --watch-id args assertions all green (11/11). |
| AC2 | acceptance_criterion | pass | test | plugin/src/adv-ci-waiter-assets.test.ts: uses-oc-ci-wait-as-single-GitHub-polling-backoff-owner + no sleep 15 assertions green; live instructions and backups updated. |
| AC3 | acceptance_criterion | pass | test | plugin/src/adv-ci-waiter-assets.test.ts: distinguishes-CI-success-from-PR-MERGED + archive-Phase-9.5-does-not-equate-waiter-success-with-PR-MERGED assertions green; spec rq-releaseFinalization02 body updated to require explicit PR merge-state evidence. |
| AC4 | acceptance_criterion | pass | test | plugin/src/adv-ci-waiter-assets.test.ts: forbids-gh-run-watch + preserves-bounded-output + final-response-shape assertions green; rq-releaseFinalization04 body updated to include CI-success-but-not-MERGED non-terminal case. |
| AC5 | acceptance_criterion | pass | test | bin/oc-test smoke clean (schemas:check, typecheck, lint, format:check, targeted suites 46/46). Red->green runIds tr_mra44b6s_24dd53db -> tr_mra493bm_552668b6 captured. |
| C1 | constraint | respected | static_check | adv-ci-waiter.md: 'this agent is the explicit exception to the normal no-polling rule'; oc-ci-wait.md routing instruction preserves main-agent 'MUST NOT poll CI itself'. |
| C2 | constraint | respected | static_check | adv-ci-waiter.md: 'Prefer oc-ci-wait over gh run watch or gh pr checks --watch'; routing instruction prohibits both. |
| C3 | constraint | respected | static_check | No edits to ~/.local/bin/ deployed scripts. Live config edits at ~/.config/opencode/ synced to /home/jon/toolbox/backups/dotfiles/opencode/ before completion (diff -q matches). |
| C4 | constraint | respected | static_check | adv-ci-waiter.md: 'Do not dump raw logs unless needed for failing-check summary'; bounded output preserved in final response shape. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-3552ac793bff | AC5 | AC1, AC2, AC3, AC5 | C1, C2, C4 |  |
| tk-e4d9be105e1f | AC1, AC2 | AC1, AC2, AC5 | C1, C2, C3, C4 |  |
| tk-0821c3d14313 | AC3, AC4 | AC3, AC4, AC5 | C1, C2 |  |
| tk-a53e8943a3c7 | AC1, AC2, AC4 | AC1, AC2, AC4 | C1, C2, C3, C4 |  |
| tk-9c739dd31cee | AC5 | AC1, AC2, AC3, AC4, AC5 | C1, C2, C3, C4 |  |
