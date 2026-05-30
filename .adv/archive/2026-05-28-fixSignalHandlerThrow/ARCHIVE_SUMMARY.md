# Archive: Fix signal-handler throw antipattern

**Change ID:** fixSignalHandlerThrow
**Archived:** 2026-05-28T21:52:08.830Z
**Created:** 2026-05-28T20:44:57.112Z

## Tasks Completed

- ✅ Prepare isolated worktree and baseline
  > Materialized/reused branch change/fixSignalHandlerThrow at /home/jon/.local/share/opencode/worktree/bdf259aa162ae192af5b18899ccdc653b085528d/change/fixSignalHandlerThrow from trunk f5283934460814dafbadc90701317ae9072f4a69. Verified git status clean and recorded checkpoint metadata.
- ✅ RED tests for signal rejection behavior and structural wrapper guard
  > Added AC6 runtime test for signal rejection persistence and post-rejection signal processing. Added AC7 structural test requiring all signal handlers to route through signalMutation/signalAsync and forbidding safeUpdateHandler. Captured RED evidence: `pnpm exec vitest run src/temporal/workflows.signal-handlers.test.ts --maxWorkers=4` exited 1; failure highlights existing safeUpdateHandler and missing rejection fields.
- ✅ Add workflow-safe digest and SignalRejection state helper
  > Added workflow-safe `temporal/digest.ts` using stable sorted JSON + pure-JS FNV-1a; no node:* imports. Added `SignalPayloadDigest` tests for determinism/truncation. Added `SignalRejection`, optional `signal_rejections`, `signal_rejections_total` to ChangeWorkflowState and seed/continue-as-new preservation. Added `applySignalRejectionToState` with 20-entry FIFO buffer, cumulative counter, payload digest, error class/message, lastSignalAt update. Added state-helper tests. Targeted tests passed.
- ✅ Rewrite signal wrappers and migrate all signal handler call sites
  > Removed `safeUpdateHandler` and all `ApplicationFailure.nonRetryable` throw-normalization from signal handlers. Added `signalAsync` wrapper that catches sync/async ordinary errors, propagates Temporal system failures, records `applySignalRejectionToState`, logs `signal-rejected`, updates search attributes, and returns normally. Rewrote `signalMutation` through `signalAsync`. Migrated the 4 former direct `safeUpdateHandler` call sites (`gateCompleted`, `archiveRequested`, `changeCancelled`, `archiveChange`) to `signalAsync`. Targeted tests passed and structural guard now forbids `safeUpdateHandler`.
- ✅ Add ADR 0003: signal handlers must not throw
  > Added `docs/adr/0003-signal-handlers-must-not-throw.md`. ADR documents Temporal signal-handler exception semantics, ADV state-mutation rejection pattern, raw-payload/digest constraints, node:crypto workflow-bundle gotcha, Cancellation/TemporalFailure passthrough, consequences, and rejected alternatives. It cites Temporal docs and wisdom `pw-TPaAlADl`.
- ✅ Run targeted Temporal, bundle-boundary, full tests, check, and build
  > Ran targeted Temporal/bundle tests, replay determinism, deploy-local/overlay asset tests, full `pnpm test`, `pnpm run check`, and `pnpm run build`. Fixed two verification blockers: (1) replay nondeterminism from duplicate search-attribute upsert/projection in migrated direct handlers by adding `afterSuccess:false` for handlers that already perform success side effects; (2) stale deploy-local asset test expectation from previous `adv_subagent_report_submit` allowlist change. Final verification: all pass.
- ✅ Complete selected agenda follow-ups after implementation evidence
  > Marked ag-0k_M_4LL and ag-pxaVk4g6 complete with evidence from fixSignalHandlerThrow implementation. Lower-priority non-selected follow-ups remain pending per user-selected scope.

## Specs Modified


## Wisdom Accumulated

- **[gotcha]** Temporal workflow code cannot use `node:crypto` for diagnostic hashes even when the algorithm is deterministic; the worker bundle cannot include Node built-ins. Use pure-JS deterministic helpers under `plugin/src/temporal/` (e.g. sorted JSON + FNV-1a) and let workflow-bundle-boundary tests guard imports.
- **[pattern]** For Temporal signal wrappers, make the generic wrapper own state-mutation rejection for unexpected ordinary errors: catch sync + async handler failures, propagate Temporal system failures (`CancelledFailure`/`TemporalFailure`), record bounded rejection state, log structured warning, and return normally. Then enforce all `wf.setHandler(*Signal, ...)` call sites through `signalMutation`/`signalAsync` with a source-level structural test.
