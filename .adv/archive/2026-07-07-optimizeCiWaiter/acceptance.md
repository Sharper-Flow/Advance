# Acceptance

Reviewed at: 2026-07-07T04:11:33.068Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| AC1 | acceptance_criterion | Given `adv-ci-waiter` starts a new `oc-ci-wait` watch, when it waits for status, then instructions say to start exactly one watch and sample `oc-ci-wait result --watch-id <id> --json` every 20–30 seconds until `completed`, `timeout`, `cancelled`, or `error`. | pass | plugin/src/adv-ci-waiter-assets.test.ts: uses/starts-exactly-one-watch-per-target + 20-30s sampling + --watch-id args assertions all green (11/11). |
| AC2 | acceptance_criterion | Given `oc-ci-wait` handles GitHub API polling, when instructions mention sleep/backoff, then they state not to reimplement API backoff in the agent and cite the tool-owned polling/rate-limit behavior. | pass | plugin/src/adv-ci-waiter-assets.test.ts: uses-oc-ci-wait-as-single-GitHub-polling-backoff-owner + no sleep 15 assertions green; live instructions and backups updated. |
| AC3 | acceptance_criterion | Given a PR auto-merge/archive flow needs final release proof, when CI reaches `success`, then instructions distinguish CI success from PR `MERGED` and require PR merge-state evidence before reporting merge-ready completion. | pass | plugin/src/adv-ci-waiter-assets.test.ts: distinguishes-CI-success-from-PR-MERGED + archive-Phase-9.5-does-not-equate-waiter-success-with-PR-MERGED assertions green; spec rq-releaseFinalization02 body updated to require explicit PR merge-state evidence. |
| AC4 | acceptance_criterion | Given CI fails, times out, is cancelled, credentials are missing, API/tooling is unavailable, or three remediation strategies fail, when waiter returns, then final output includes conclusion, failed checks if any, URL(s), watch ID, and next action. | pass | plugin/src/adv-ci-waiter-assets.test.ts: forbids-gh-run-watch + preserves-bounded-output + final-response-shape assertions green; rq-releaseFinalization04 body updated to include CI-success-but-not-MERGED non-terminal case. |
| AC5 | acceptance_criterion | Given docs/agent prompts are changed, when validation runs, then targeted asset/instruction tests pass and no main-agent inline CI polling loop is introduced. | pass | bin/oc-test smoke clean (schemas:check, typecheck, lint, format:check, targeted suites 46/46). Red->green runIds tr_mra44b6s_24dd53db -> tr_mra493bm_552668b6 captured. |
| C1 | constraint | Main agents must not poll CI inline; `adv-ci-waiter` remains the bounded polling exception. | respected | adv-ci-waiter.md: 'this agent is the explicit exception to the normal no-polling rule'; oc-ci-wait.md routing instruction preserves main-agent 'MUST NOT poll CI itself'. |
| C2 | constraint | Do not use `gh run watch` or `gh pr checks --watch` in instructions. | respected | adv-ci-waiter.md: 'Prefer oc-ci-wait over gh run watch or gh pr checks --watch'; routing instruction prohibits both. |
| C3 | constraint | Do not edit live deployed scripts in `~/.local/bin/`; source/deploy paths remain authoritative. | respected | No edits to ~/.local/bin/ deployed scripts. Live config edits at ~/.config/opencode/ synced to /home/jon/toolbox/backups/dotfiles/opencode/ before completion (diff -q matches). |
| C4 | constraint | Preserve bounded output; no raw log dumps except concise failing-check evidence. | respected | adv-ci-waiter.md: 'Do not dump raw logs unless needed for failing-check summary'; bounded output preserved in final response shape. |

