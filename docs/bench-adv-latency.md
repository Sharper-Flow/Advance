# ADV latency benchmark

<!-- rq-advLatencyBench01 -->

`plugin/scripts/bench-adv-latency.ts` runs ADV read/test tools repeatedly
and reports min/p50/p95/max/avg latency. It is a manual / nightly
diagnostic, not a CI gate (CI uses structural regression tests instead;
see `KD-7` in the change design).

## When to run

- Before/after a latency-affecting change to capture before/after numbers.
- When evaluating telemetry overhead, summary read-model wins, or
  worktree/Visibility regressions.
- When debugging "ADV feels slow" reports to localize the slow tool or
  named phase.

## Modes

### `--mode disk` (default — documented substitute)

Backed by `createDiskStore` so the harness initializes without a live
Temporal worker. Exercises:

- `adv_status view:"summary"`
- `adv_status view:"health"`
- `adv_change_list`
- `adv_change_show`
- `store.tasks.list` (disk fallback because `adv_task_list` requires a
  Temporal handle)
- `adv_run_test echo bench`
- `adv_run_test true`

This mode does NOT measure Temporal RTT. Use it to compare tool-shape
changes (lazy view planning, summary memo, telemetry overhead) against a
stable substrate.

### `--mode temporal` (real Temporal worker — opt-in)

The script intentionally refuses to fabricate a Temporal bundle. To run
the authoritative number, start Temporal locally and invoke the bench
with the real bundle plumbed in:

```bash
systemctl --user status temporal-dev    # confirm dev server alive
# (then run a wrapper that constructs a TemporalClientBundle and passes
# it into createStore() — wrapper is operator-owned for now)
```

The mode flag is wired so future automation can refuse to silently
substitute the disk path when "real Temporal" is requested.

## Command

```bash
cd plugin
pnpm exec tsx scripts/bench-adv-latency.ts \
  --repo-root <repo-root> \
  --change-id <existing-change-id> \
  --iterations 10 \
  --warmup 2 \
  --out reports/latency.md
```

Output is Markdown on stdout and written to `--out` when provided.

## Fixture shape

- `--repo-root` defaults to `..` relative to `plugin/`. Pass the repo
  root that holds the `.adv/` you want to measure against.
- `--change-id` must reference a change that exists on disk (the harness
  uses it for `adv_change_show` and finds a task for the `adv_run_test`
  samples).
- The harness writes its own `XDG_DATA_HOME` temp dir during the run so
  it cannot pollute real ADV state.

## Output

A Markdown report with two sections:

1. `## Metadata` — repo root, change id, mode, substitute, iterations,
   warmup, task id used (or note when `adv_run_test` samples were
   skipped), `ADV_PROFILE` flag.
2. `## Operations` — `Operation | Samples | min | p50 | p95 | max | avg`
   table for each timed surface.

Manual benchmark output is the acceptance evidence for `AC9` / `AC10` —
preserve the `--out` file when promoting a change that touches latency.
