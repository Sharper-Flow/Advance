# Fix Signal-Handler Throw Antipattern (LBP capture)

## Why

Per Temporal docs (https://docs.temporal.io/handling-messages#exceptions), throwing in a signal handler fails the **entire workflow**:
- `ApplicationFailure` → workflow failure (terminal)
- Other exceptions → Workflow Task Failure → stuck workflow (poisoned history)

Current ADV code (`plugin/src/temporal/workflows.ts:350-397`) routes every signal handler through `safeUpdateHandler`, which catches errors and **re-throws as `ApplicationFailure.nonRetryable`**. This is the antipattern KD-8 Layer 2 specifically calls out as the failure mode the size-guard pattern fixes.

Affected handlers: 30+ signals registered via `signalMutation(...)` wrapper at `workflows.ts:701-710`. All flow:
```
wf.setHandler(someSignal, signalMutation("someName", payload => apply...(state, payload)))
  → safeUpdateHandler wraps handler
  → on throw: ApplicationFailure.nonRetryable → workflow fails
```

The canonical ADV pattern is **state-mutation rejection** (`applyGateStuckToState` at `change-state.ts:761`, Layer 2 size-guard at `change-state.ts:170-209`): record the failure in workflow state, leave target state unchanged, return state. Workflow continues; tool layer observes via next query.

Wisdom entry `pw-TPaAlADl` already captures this LBP at project scope. This change makes it spec-law and refactors the offending handlers.

## What Changes

### 1. ADR 0003: Signal handlers must not throw

New file `docs/adr/0003-signal-handlers-must-not-throw.md` documenting:
- The Temporal exception semantics
- The state-mutation rejection pattern
- When `safeUpdateHandler` is appropriate (update handlers, future use)
- When state-mutation rejection is required (signal handlers, all current ADV cases)
- Reference to wisdom `pw-TPaAlADl` and existing canonical examples

### 2. Split `safeUpdateHandler` into two distinct wrappers

- `safeUpdateHandler` — retained as-is for future `wf.defineUpdate` use (two-way RPC; throw is meaningful to caller)
- `safeSignalHandler(signalName, applyFn)` — new wrapper for signals; catches errors and records to `state.signal_rejections[]` (new field), returns state unchanged on rejection. Never throws.

### 3. Add `state.signal_rejections[]` to `ChangeWorkflowState`

Bounded ring buffer (e.g., last 20 rejections) tracking:
```ts
{ signalName, errorMessage, payloadDigest, rejectedAt }
```

Exposed via existing `getStateQuery` so the tool layer can surface "workflow continued despite N rejected signals" diagnostics.

### 4. Convert the 30+ `signalMutation(...)` call sites to use `safeSignalHandler`

Mechanical; the wrapper has the same signature.

## Success Criteria

- [ ] `docs/adr/0003-signal-handlers-must-not-throw.md` exists and is referenced from project wisdom export
- [ ] `safeSignalHandler` exists in `workflows.ts` (or a new module) with full unit test coverage
- [ ] `state.signal_rejections[]` field added to `ChangeWorkflowState` with bounded ring buffer
- [ ] All `signalMutation(...)` call sites use `safeSignalHandler` (NOT `safeUpdateHandler`)
- [ ] New test asserts: a signal handler that throws does NOT fail the workflow; rejection is recorded in `state.signal_rejections`; subsequent signals process normally
- [ ] `pnpm run check` clean
- [ ] `pnpm test` passes (the existing `applyGateStuckToState` and size-guard tests should already pass; new tests cover the new wrapper)
- [ ] No new tool drift; no spec-law citations break

## Affected Code

- `plugin/src/temporal/workflows.ts:350-397` — `safeUpdateHandler` split
- `plugin/src/temporal/workflows.ts:701-710` — `signalMutation` wrapper change
- `plugin/src/temporal/workflows.ts:916-1224` — 30+ `wf.setHandler(...Signal, signalMutation(...))` call sites
- `plugin/src/temporal/change-state.ts` — add `signal_rejections` field + applier function
- `plugin/src/types/...` — `ChangeWorkflowState` schema/type updates
- `docs/adr/0003-signal-handlers-must-not-throw.md` — new ADR

## Constraints

- No spec-law change required (this is an internal implementation hardening; the workflow contract surface stays the same)
- `safeUpdateHandler` itself MUST remain available for future `wf.defineUpdate` use (do not delete)
- Bounded ring buffer for `signal_rejections` (NOT unbounded — workflow history limit risk)
- All work in worktree isolation (P32)
- TDD: write a failing test that throws in a handler and asserts workflow continues + rejection recorded, BEFORE the implementation

## Impact

- Workflow durability dramatically improved: a bad signal payload no longer fails the entire workflow
- Tool layer gains observability into signal rejections (currently silent or workflow-killing)
- LBP captured in wisdom `pw-TPaAlADl` becomes structural law via the new wrapper

## Validation Plan

1. Write failing test: signal handler that throws → assert workflow continues + rejection recorded
2. Implement `safeSignalHandler` + `state.signal_rejections` field
3. Add ADR 0003
4. Refactor all 30+ call sites
5. Run `pnpm test` and `pnpm run check`
6. Manual smoke: send a malformed signal payload via existing tooling, verify rejection is captured

## Out of Scope

- Migrating off `signalMutation` entirely (still useful as a composition point)
- Adding new query surfaces beyond the existing `getStateQuery`
- Behavioral changes to existing handlers — they continue to throw on validation failure; only the wrapper changes
