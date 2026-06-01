# Executive Summary

`adv_run_test` now has a typed, backward-compatible evidence contract while preserving exact shell-command execution semantics.

## Delivered

- Replaced buffered `exec()` internals with streaming `spawn(..., { shell: true })` runner.
- Added typed result fields: `passed`, `classification`, `durationMs`, `outputBytesSeen`, `outputBytesRetained`, `outputTruncated`, `executionMode`, and compact `adv_run_test.v1` evidence.
- Preserved legacy fields: `success`, `exitCode`, `output`, `command`, `timedOut`, `maxBufferExceeded`, `timeoutMs`.
- Restored optional descriptive `phase: red|green|verify`; explicitly not gate enforcement.
- Added structured sub-agent verification consumption of `adv_run_test.v1` evidence.
- Added repo-local `bin/oc-test` wrapper and `adv_run_test` advisory only; supplied commands are never silently rewritten.
- Promoted project wisdom: ADV/Temporal should own durable evidence/orchestration, while repo-local tooling/CI owns suite policy and throttling.
- Fixed verification-environment leakage from `ADV_WORKTREE_HOME` and aligned project worktree guard config with existing spec tests.

## Verified

- `bin/oc-test smoke` passed.
- `bin/oc-test full` passed.
- Acceptance review by `adv-reviewer`: READY, 0 blocking findings.
- Contract review matrix: 27 rows, 0 failures.
- Benchmark sample: hot `true` p50 2.3ms wall / 2.2ms subprocess duration; noisy stdout p50 21.8ms wall / 21.4ms subprocess duration with truncation but no maxBuffer failure.

## Remaining Concerns

- Source changes require rebuild/deploy/restart before live OpenCode plugin tool behavior reflects the new `adv_run_test` implementation in this running session.