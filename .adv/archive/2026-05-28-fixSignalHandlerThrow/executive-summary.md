# Executive Summary — fixSignalHandlerThrow

## Outcome

ADV Temporal signal handlers no longer convert ordinary signal-handler errors into workflow-failing `ApplicationFailure.nonRetryable` exceptions.

## What Changed

- Added ADR 0003: Temporal signal handlers must not throw ordinary errors.
- Added workflow-safe deterministic payload digest helpers using sorted JSON + pure-JS FNV-1a.
- Added `SignalRejection` state with bounded `signal_rejections` ring buffer and cumulative `signal_rejections_total`.
- Added `applySignalRejectionToState` to record ordinary signal failures without retaining raw payloads.
- Replaced `safeUpdateHandler` signal usage with `signalAsync` / `signalMutation` state-mutation rejection wrappers.
- Converted the four direct signal handlers (`gateCompleted`, `archiveRequested`, `changeCancelled`, `archiveChange`) and preserved their success side-effect ordering with `afterSuccess:false`.
- Added RED→GREEN runtime and structural tests for signal rejection behavior and wrapper enforcement.
- Updated a stale deploy-local asset test expectation to match current primary-agent `adv_subagent_report_submit` allowlist behavior.

## Verification

- Targeted Temporal/bundle tests: pass (4 files, 28 tests)
- Replay determinism: pass
- Deploy-local/overlay asset tests: pass (87 tests)
- `pnpm test`: pass
- `pnpm run check`: pass
- `pnpm run build`: pass
- Independent acceptance review (`adv-reviewer`): READY, no findings

## Remaining Concerns

- PokeEdge/PokeEdge-web issue is separate: artifact-backed gate readiness still reads disk after artifact content moved to Temporal state. Recorded as critical follow-up `ag-mgupBeWk`.