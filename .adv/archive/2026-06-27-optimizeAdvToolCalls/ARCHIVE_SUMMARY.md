# Archive: Optimize ADV tool calls

**Change ID:** optimizeAdvToolCalls
**Archived:** 2026-06-27T23:06:15.532Z
**Created:** 2026-06-27T20:32:20.048Z

## Tasks Completed

- ✅ Add speed/reliability spec deltas
  > Updated advance-meta spec/docs to v1.20.0 with rq-statusSummaryLazy01, expanded rq-statusProbeCache01 AbortSignal/non-cancellable semantics, expanded rq-advLatencyBench01 mode/stat labeling, and rq-advRunTestLatency01.4 explicit recording-degradation contract. Added asset tests for status summary/probe/benchmark and adv_run_test recording status.
- ✅ Implement bounded status probe semantics
  > Forwarded probe cache AbortSignal from status temporal health and worktree census probe closures into cancellable providers. Added AbortSignal support to Temporal reachability socket probe and git worktree census execFile invocation. Added probe-cache coverage for cold non-cancellable timeout behavior and status coverage proving cancellable providers receive AbortSignal.
- ✅ Add adv_run_test recording status
  > Task checkpoint completed
- ✅ Verify Visibility project-scope cleanup
  > Task checkpoint completed
- ✅ Optimize adv_status summary residuals
  > Task checkpoint completed
- ✅ Add live/disk latency benchmark evidence
  > Task checkpoint completed
- ✅ Verify final latency contract and Tron disposition
  > Task checkpoint completed

## Specs Modified


## Wisdom Accumulated

- **[gotcha]** When updating advance-meta spec deltas, mirror `docs/specs/advance-meta.md` manually with the same version/updated date because no generate:docs script exists; `schemas:check` only verifies JSON schemas, not spec markdown mirrors. Broad deploy-local.test can fail unrelated canonical prompt ceiling checks, so pair focused asset tests with schemas:check for spec-only task evidence.
- **[pattern]** Probe-cache timeout behavior is only structurally useful when provider closures thread `{ signal }` into cancellable adapters. `lru-cache` can bound/stale-return ignored signals, but provider-level cancellation still needs explicit options (`net` socket abort, child_process execFile signal) to avoid background work after status timeouts.
