# Executive Summary

## Outcome

ADV local deployment now completes independent asset synchronization even when a deployed Temporal worker survives its bounded refresh attempt. The deploy remains explicitly unsuccessful until that stale worker is restarted or exits.

## Value

Bundled `adv-engineer` instructions now reach the global profile instead of remaining stale behind a worker-refresh failure. Engineers receive the required Morph call contract: both `workdir` and `taskId`.

## What changed

- Captured post-sync worker-refresh failure instead of allowing `set -e` to stop the deploy before command, agent, skill, CLI, and config work.
- Added an explicit stale-worker line in the deploy summary.
- Preserved deterministic final failure precedence: CLI install, config repair, then worker refresh.
- Added a hermetic stuck-worker regression harness and an agent-profile contract assertion.

## Verification

- 107 focused deploy and agent-contract tests passed.
- `bash -n scripts/deploy-local.sh` passed.
- Morph source authorization suite passed: 141 tests.
- Independent acceptance review: READY; no findings.

## Risks and follow-up

A stale deployed worker still requires OpenCode restart or worker exit; the deploy prints `[ADV:ACTION_REQUIRED]` and exits nonzero. No authorization boundary, exact-path worker matching, SIGTERM behavior, grace period, or read-only behavior changed.

## Release Readiness Summary

Ready for release review. This is a local developer-environment deployment change: no production migration, data impact, frontend preview, or external service rollout. The only operational consequence is explicit restart remediation when a stale worker remains.
