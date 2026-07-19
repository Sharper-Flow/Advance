# Executive Summary: fixTemporalQueryRecovery

## Outcome

Structurally classified ADV plugin Temporal control-plane failures into two independent axes (service diagnostic vs workflow diagnostic), introduced bounded authoritative reads via SDK-native deadlines/abort controllers, and wired fail-closed mutation-safety guards into all production signal/recovery paths. A workflow-axis failure can no longer authorize service reconnect; a service-axis failure can no longer authorize workflow mutation.

## Value / Why It Matters

Before: when shared Temporal service health was restored but an individual change workflow stayed unreachable (`Failed to query Workflow`), gate completion would fail closed while authoritative reads exceeded their bounded deadline. Mutation paths could incorrectly retry signals after ambiguous transport failures. There was no clean separation between "the service is down" and "this workflow is unreachable."

After: typed diagnostics distinguish the two failure domains. Reads use one absolute deadline + one AbortController per request, threaded through change/gate/status stages. Mutation-ineligible failure classes (no-poller, unregistered-query, deadline, unknown-query) are structurally prevented from authorizing signal/start/reset/terminate/projection-write operations at every production call site. Ambiguous post-signal readback failures report `outcome_unknown_readback_unavailable` instead of masquerading as signal failure.

## What Was Built

- **Typed diagnostic state machine** (`plugin/src/temporal/diagnostics.ts`): two-axis classification with nested gRPC cause extraction, corroborated shared-channel reconnect eligibility, mutation-ineligible predicate. 29 focused tests.
- **Bounded read primitive** (`plugin/src/storage/store-temporal/read-context.ts`): `TemporalReadContext` (one absolute deadline + one AbortController per request), `runTemporalRead` using SDK `Connection.withDeadline`/`withAbortSignal`. Threaded through changes.get, gates.get, store.status, listSummary visibility.
- **Mutation safety module** (`plugin/src/temporal/mutation-safety.ts`): explicit mutation outcomes (`confirmed` / `outcome_unknown_readback_unavailable` / `failed_before_ack`), outer-signal-retry prohibition, SC4 mutation-eligibility guards, destructive recovery precondition guard. 24 + 10 = 34 tests.
- **Production wiring** (post-reviewer-remediation): `fireSignalWithMutationGuard` (gates.ts), `fireGuardedSignal` (changes.ts), SC4 guards in `_adapters.ts:fireSignal`, `workflow-start.ts`, `tasks.ts`, `wisdom.ts`, `spec-deltas.ts`, `index.ts` (worktree migration). 28 production-wiring tests across gates/mutation-safety-wiring/_adapters.mutation-safety.
- **Aggregate budget fix** (post-reviewer-remediation): `gates.ts:105-134` threads one `TemporalReadContext` through primary + fallback; checks `isTemporalReadExpired` before fallback; throws typed degraded error on expiry.
- **Retry wrapper** (`plugin/src/temporal/retry-wrapper.ts`): `withTemporalRetry` accepts connection/abortSignal; uses SDK cancellation when Connection present, falls back to bounded Promise.race only for test fixtures.

## Verification

- `pnpm run check` green (schemas, typecheck, manifests, isolation, lockfile, lint, format)
- Targeted: 1179/1180 pass (1 expected fail) across `src/temporal/`, `src/storage/store-temporal/`, `src/tools/gate.test.ts`, `src/tools/change.test.ts`
- Independent acceptance reviewer (adv-reviewer) returned BLOCKED on 2 findings (mutation-safety unwired + gates.ts budget violation) → both remediated via review cycle → READY
- `workflows.signal-handlers.itest.ts` 28/28 pass (sequential lane)

## Risks / Follow-ups

- **Significant scope expansion during review remediation**: original 4 tasks produced focused modules; reviewer-remediation wired those modules into 8+ production storage paths (changes/tasks/wisdom/spec-deltas/gates/index/_adapters/workflow-start). 15 files changed, +1367/-135 lines in the remediation commit. The expanded surface is the correct shape for SC4/SC6 enforcement but increases review burden.
- **No full-suite re-run**: post-rebase verification used targeted tests only. A full-suite pass is recommended before archive to catch any cross-cutting regression from the broad wiring change.
- **Lost stash during rebase**: an experimental `workflows.signal-handlers.itest.ts` shared-env pattern modification was discarded during stash cleanup. The lane split from fixSuiteIsolation provides equivalent isolation; 28/28 signal-handlers tests pass in the sequential lane.
- **Rebase history**: branch was 134 commits behind trunk; rebased onto 5ac6cf84 (fixSuiteIsolation merged). Signature merge in store-temporal/index.ts combined both intents (TemporalReadContext union + trunk's sourceRanked/hydrationConcurrency options).