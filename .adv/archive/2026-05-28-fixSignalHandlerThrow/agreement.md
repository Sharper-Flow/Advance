# Agreement — fixSignalHandlerThrow

## Objectives

1. Eliminate the antipattern where Temporal signal handlers throw `ApplicationFailure.nonRetryable` on unexpected errors, which fails the entire workflow per Temporal docs.
2. Replace the throw-on-error path with state-mutation rejection (workflow continues; rejection is recorded in queryable state) for all 38 signal handlers in `workflows.ts`.
3. Capture the long-term best practice as ADR 0003 and structural guardrails so future signal handlers cannot regress to the antipattern.
4. Preserve the existing `applyGateStuckToState` and Layer 2 size-guard rejection patterns — they already implement the LBP correctly.
5. Convert the 4 direct `safeUpdateHandler` call sites (`gateCompleted`, `archiveRequested`, `changeCancelled`, `archiveChange`) to the new signal-safe wrapper too, because the old wrapper still fails the workflow on unexpected errors.

## Acceptance Criteria

1. **AC1.** New ADR `docs/adr/0003-signal-handlers-must-not-throw.md` exists, cites the Temporal docs reference (https://docs.temporal.io/handling-messages#exceptions), documents the state-mutation rejection pattern, and references wisdom `pw-TPaAlADl` and existing canonical examples (`applyGateStuckToState`, Layer 2 size-guard).
2. **AC2.** `ChangeWorkflowState` gains optional additive fields: `signal_rejections?: SignalRejection[]` (max 20 entries) and `signal_rejections_total?: number`. `SignalRejection` includes `{ signalName, errorMessage, errorClass, payloadDigest, rejectedAt }`. Fields are additive-only and Temporal replay-safe.
3. **AC3.** New helper `applySignalRejectionToState(state, { signalName, error, payload, rejectedAt })` exists in `change-state.ts`, computes a stable structural digest of the payload (not the raw payload), enforces the ring-buffer cap, increments `signal_rejections_total`, and updates `lastSignalAt`.
4. **AC4.** `signalMutation(...)` wrapper at `workflows.ts:701-710` no longer routes through `safeUpdateHandler`. Instead it delegates to `signalAsync(...)`, catches synchronous and Promise rejections from the apply function, calls `applySignalRejectionToState`, logs `wf.log.warn("signal-rejected", ...)`, and returns/resolves normally. The wrapper never throws except for `wf.CancelledFailure` / `wf.TemporalFailure` passthrough.
5. **AC5.** All 4 former direct `safeUpdateHandler` call sites (`gateCompleted`, `archiveRequested`, `changeCancelled`, `archiveChange`) are converted to `signalAsync(...)`. `safeUpdateHandler` is removed if unused. No active signal handler may use a throw-normalizing wrapper.
6. **AC6.** A failing-first TDD test asserts: a signal whose apply function throws does NOT fail the workflow; `state.signal_rejections` contains exactly one entry naming the signal and error; `signal_rejections_total` increments; subsequent signals to the same workflow process normally; `getStateQuery` returns the rejection alongside normal state.
7. **AC7.** A structural test asserts every `wf.setHandler(*Signal, ...)` call site in `workflows.ts` goes through either `signalMutation(...)` or `signalAsync(...)` — no direct unwrapped `wf.setHandler(*Signal, handler)` form and no `safeUpdateHandler` signal wrapper are permitted.
8. **AC8.** `plugin/src/temporal/workflow-bundle-boundary.test.ts` and existing replay-safety tests still pass with no new boundary violations; the payload digest implementation imports no `node:*` modules and stays workflow-safe.
9. **AC9.** `pnpm test` and `pnpm run check` pass clean. No spec-citation drift; no deploy-local drift.

## Constraints

1. **C1. Worktree isolation (P32).** All implementation work runs in worktree `change/fixSignalHandlerThrow`, not the trunk checkout.
2. **C2. Replay safety.** `signal_rejections` and `signal_rejections_total` are additive-optional; histories predating the fields MUST replay cleanly. Payload digests use deterministic structural hashing (sorted JSON + pure-JS FNV-1a), not `Math.random()`, wall-clock timestamps inside the hash input, or `node:crypto`.
3. **C3. Bounded buffer.** `signal_rejections` is capped at 20 entries with FIFO eviction so workflow state stays bounded. `signal_rejections_total` is an unbounded numeric counter only.
4. **C4. No spec-law change required.** This is internal hardening; the workflow public signal names, gate semantics, and existing query contracts MUST remain compatible. Existing spec citations MUST NOT break.
5. **C5. TDD-first (P24).** Write the AC6 failing test before any production change. Verify it fails for the right reason (current behavior throws or lacks rejection capture), then implement, then verify it passes.
6. **C6. Locality (P04).** Keep `applySignalRejectionToState` and `SignalRejection` type co-located with `applyGateStuckToState` in `change-state.ts` and `contracts.ts` respectively; keep digest helper under `temporal/` so bundle-boundary tests enforce workflow safety.

## Avoidances

1. **A1.** Do NOT migrate signals to `wf.defineUpdate` as part of this change. The signal-only surface is enforced by `workflow-bundle-boundary.test.ts`; migrating to updates re-introduces a different antipattern (poisoned `WorkflowExecutionUpdateAccepted` history events).
2. **A2.** Do NOT keep any active signal handler on `safeUpdateHandler` or any wrapper that converts signal-handler errors into `ApplicationFailure.nonRetryable`.
3. **A3.** Do NOT log raw payloads inside `signal_rejections`. Use a structural digest only. Raw payloads may contain large prose content (proposals, agreements, etc.) and would blow the workflow history budget.
4. **A4.** Do NOT swallow `wf.CancelledFailure` or `wf.TemporalFailure`. These Temporal-system errors must propagate.
5. **A5.** No campsite-rule expansion into unrelated workflow refactors. Touched scope is the wrapper + the new fields + helper + digest + ADR + tests.

## Out of Scope

1. Migrating any signals to `wf.defineUpdate` (see A1).
2. Adding new user-facing tool fields for `signal_rejections` beyond what existing `getStateQuery` / `adv_change_show` already returns through state.
3. Refactoring `applyGateStuckToState` or KD-8 Layer 2 size-guard (they already implement the LBP).
4. Worktree, agenda, subagent-report migration, or threshold-consolidation follow-ups.

## Affected Code

- `plugin/src/temporal/workflows.ts:701-710` — `signalMutation` wrapper rewrite and `signalAsync` addition
- `plugin/src/temporal/workflows.ts:1046-1224` — convert 4 direct `safeUpdateHandler` call sites
- `plugin/src/temporal/change-state.ts` — add `applySignalRejectionToState` helper
- `plugin/src/temporal/contracts.ts:216-346` — add `SignalRejection` type + `signal_rejections?: SignalRejection[]` + `signal_rejections_total?: number`
- `plugin/src/temporal/digest.ts` — new deterministic workflow-safe digest helper
- `docs/adr/0003-signal-handlers-must-not-throw.md` — new ADR
- `plugin/src/temporal/workflows.signal-handlers.test.ts` — add AC6 + AC7 tests

## Validation Plan

1. RED: write the AC6 test asserting state-mutation rejection behavior. Verify it fails against current code.
2. RED: write AC7 structural test; verify it fails for the 4 direct `safeUpdateHandler` sites.
3. Add `SignalRejection` type + `applySignalRejectionToState` helper + deterministic digest helper.
4. Rewrite `signalMutation` through `signalAsync`; convert 4 direct sites; remove `safeUpdateHandler` if unused.
5. Verify AC6 and AC7 tests pass.
6. Add ADR 0003.
7. Run targeted Temporal tests, then full `pnpm test`, `pnpm run check`, and `pnpm run build`.
8. Verify no asset-test, bundle-boundary, or spec-citation drift.
