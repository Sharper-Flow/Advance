## Executive Summary — reapLeakedTestServers

### Outcome
Temporal integration-test servers are now deterministically torn down and, when a crash skips teardown, conservatively reaped — closing a leak that left orphaned `/tmp/temporal-test-server-*` processes running for days.

### Why it matters
Every OOP Temporal integration test spawns a `/tmp/temporal-test-server-sdk-*` child. Crashes/timeouts and call sites bypassing the teardown helper left orphans that accumulated (two were found alive ~2 days, ~90MB), cluttering process lists and obscuring real worker/server diagnostics during incident triage.

### What was built
- **Helper-owned constructors**: all 33 raw `TestWorkflowEnvironment.create*` sites routed through named wrappers; a `check-test-isolation` guard now fails CI on any raw constructor outside the helper (planted-violation verified). Docstring corrected — the SDK's own `teardown()` swallows internal shutdown errors.
- **Signal-aware teardown regression**: throw path + Vitest `AbortSignal` timeout path prove `finally` teardown runs even on cancellation.
- **Conservative stale-only reaper** (`bin/lib/oc-test-reaper.bash`): same-UID, exact test-server basename, min-age ≫ suite duration (7200s), `/proc` cmdline+start on Linux / `ps -ww` on macOS, `start-dev`/port-7233 exclusion, pre-signal identity revalidation, TERM→wait→revalidate→KILL, skip-on-unknown-identity, never fails the caller.

### Verification
Reaper 14/14 bun tests; with-test-env 11 + 1 expected-fail; check-test-isolation 15/15; `pnpm run check` green. Independent reviewer verdict READY; live proof the reaper skipped a fresh orphan and left the real port-7233 dev server running.

### Risks / follow-ups
- `createLocal()` leaks stay outside the reaper's blast radius by design (argv indistinguishable from a real dev server); helper-owned teardown is the mitigation.
- Fresh crash leaks persist until the next run's pre-sweep (accepted tradeoff protecting concurrent peers).
- Pre-existing, unrelated: `bin/adv.test.ts` slop-scan failure reproduces on clean trunk.