---
name: adv-runbook-ci
description: Full recipes, tier matrices, and command references for CI waiting (oc-ci-wait) and test throttling (oc-test-gate). Load when you need exact command syntax, lock paths, or tier details for CI/test operations.
---

# CI and Test Runbook

## GitHub CI Wait (`oc-ci-wait`)

Enforced by `~/.local/bin/oc-ci-wait` (source: `dev/ci-wait/main.go`). See `dev/ci-wait/main.go` `cmdStart` / `cmdWatch`.

| Constraint | Value |
|---|---|
| Start | `--repo OWNER/REPO`, exactly one of `--run-id`, `--sha`, `--pr`, plus `--json`. |
| Watch defaults | Poll interval `15s`; discovery timeout `2m`; overall timeout `30m`. |
| Spawn triggers | PR push/update; explicit user CI wait; parent release/archive needs terminal status. |
| Rate limits | Honor `Retry-After` and `X-RateLimit-Reset`; schedule next poll. |
| Statuses | `discovering`, `watching`, `completed`, `timeout`, `cancelled`, `error`. |
| Result | `oc-ci-wait result` accepts only `--watch-id <id> --json`; output stays bounded JSON. |
| Terminal evidence | Report status, conclusion, URL/check summary, and artifact path. |
| Release proof | CI `success` is not PR `MERGED`; require `gh pr view ... --json state` or merged `origin/{default-branch}` reachability. |
| Missing binary | Deploy from toolbox source: `bash scripts/deploy-ci-wait.sh`. |

### CI Anti-Patterns

- Never poll CI from the main agent's chat/tool turns; spawn `adv-ci-waiter` instead.
- Never use `gh run watch` or `gh pr checks --watch`.
- Classify failing checks from logs before reporting them.

## Local Test Throttle (`oc-test-gate`)

Enforced by `~/.local/bin/oc-test-gate` (source: `dev/oc-test-gate/oc-test-gate`). See the tier handlers there.

| Constraint | Value |
|---|---|
| Routing | Use `bin/oc-test full`, `smoke`, or `targeted -- <files>` when present. |
| Targeted | No lock, `nice`, `ionice`, timeout, or worker-cap injection; direct passthrough. |
| Smoke | Heavy admission; `nice 5`; `ionice -c2 -n7`; no timeout or worker-cap injection. |
| Full | Heavy admission; `nice 10`; `ionice -c2 -n7`; `20m` default timeout; `VITEST_MAX_WORKERS=4` unless caller sets it. |
| Locks | `/tmp/oc-test-gate-${UID}-<tier>.lock`; smoke/full serialize independently. |
| One-shot TDD | Use `adv_run_test` or repo equivalent, not `bin/oc-test`. |
| No wrapper | Native commands allowed; cap Vitest at `--maxWorkers=4`; run heavy suites sequentially. |

### Test Fallback

When `bin/oc-test` is absent, use native commands with equivalent care:

- Cap Vitest workers explicitly: `vitest run --maxWorkers=4`.
- Run heavy suites sequentially across agents; avoid simultaneous `git push`.
- Consider proposing a `bin/oc-test` wrapper for the repo.

### Test Anti-Patterns

- Never use `bunx vitest run --maxWorkers=100%` in pre-push hooks.
- Never run multiple concurrent `git push` operations from agents while heavy CI suites run.
- Never edit `~/.local/bin/oc-test-gate` directly; edit `~/toolbox/dev/oc-test-gate/`, then deploy.
- Never bypass `bin/oc-test` in repos that provide it because it seems faster.
