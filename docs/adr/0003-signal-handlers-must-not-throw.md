# ADR-0003: Temporal signal handlers must not throw ordinary errors

**Status:** accepted  
**Date:** 2026-05-28  
**Change:** fixSignalHandlerThrow

## Decision

ADV Temporal workflow signal handlers use **state-mutation rejection** for ordinary domain/programmer errors:

1. Catch synchronous and asynchronous ordinary handler failures.
2. Record a bounded rejection entry in workflow state.
3. Preserve the target state that failed to mutate.
4. Emit structured workflow log evidence.
5. Return normally so the workflow remains queryable and can process later signals.

Signal handlers must not convert ordinary errors into `ApplicationFailure.nonRetryable`, and must not let ordinary `Error` instances escape the handler.

Temporal-system failures remain special: `CancelledFailure` and `TemporalFailure` propagate. Those failures represent workflow runtime semantics, not domain rejection.

## Context

Temporal's message-handler exception documentation states that an exception in a Signal handler fails the Workflow. `ApplicationFailure` fails the Workflow; other exceptions fail the Workflow Task and can leave the Workflow stuck retrying the same failing task.

Reference: <https://docs.temporal.io/handling-messages#exceptions>

ADV had a generic `safeUpdateHandler` wrapper that caught errors and re-threw `wf.ApplicationFailure.nonRetryable`. That wrapper is appropriate for future two-way `wf.defineUpdate` handlers, where a caller observes the rejection. ADV's current change workflow surface is signal-only, so the same wrapper turned fire-and-forget signal failures into workflow failures.

Existing ADV precedent already used the correct pattern:

- `applyGateStuckToState` records gate-blocker state instead of throwing.
- KD-8 Layer 2 artifact size guard records artifact rejection and leaves document content unchanged.
- Project wisdom `pw-TPaAlADl` captures the LBP: "State-mutation rejection over throw in Temporal signal handlers."

## ADR rubric

| Criterion | Result |
|---|---|
| Hard to reverse | Yes — signal-handler error semantics affect every change workflow and replayability. |
| Surprising without context | Yes — `ApplicationFailure.nonRetryable` looks like clean domain-error handling but is workflow-fatal for signals. |
| Result of real trade-off | Yes — catching ordinary errors risks masking bugs, but recording bounded rejection state + logs keeps observability while preserving workflow liveness. |

All 3 criteria met → ADR warranted.

## Implementation Pattern

Use a signal-safe wrapper:

```ts
const signalAsync = (signalName, handler) => (payload) => {
  try {
    const result = handler(payload);
    if (isPromiseLike(result)) {
      return Promise.resolve(result).catch((err) => rejectSignal(payload, err));
    }
  } catch (err) {
    rejectSignal(payload, err);
  }
};
```

`rejectSignal` must:

- rethrow `wf.CancelledFailure` and `wf.TemporalFailure`
- call `applySignalRejectionToState`
- log `wf.log.warn("signal-rejected", ...)`
- avoid raw payload retention
- return normally after ordinary rejection

`applySignalRejectionToState` records:

```ts
{
  signalName,
  errorMessage,
  errorClass,
  payloadDigest,
  rejectedAt,
}
```

State fields:

- `signal_rejections?: SignalRejection[]` — bounded FIFO ring buffer, max 20
- `signal_rejections_total?: number` — cumulative counter

## Payload Digest Rules

Do not store raw payloads in workflow state or logs. Signal payloads can contain large artifact prose and may exceed practical workflow-history budgets.

Do not use `node:crypto` in workflow code. Temporal TypeScript workflow bundles run in a sandbox; Node built-ins are not workflow-safe bundle dependencies.

Use deterministic pure JavaScript instead:

- sorted-key JSON serialization
- 256-character payload sample
- payload length
- non-cryptographic FNV-1a digest for correlation

The digest is diagnostic only, not a security identity.

## Consequences

**Positive:**

- One bad signal payload no longer bricks a change workflow.
- Later signals can still mutate/query the workflow.
- Operators get bounded recent rejection detail and cumulative count.
- Structural tests can enforce wrapper usage across all `wf.setHandler(*Signal, ...)` call sites.

**Negative:**

- Ordinary programmer errors no longer immediately fail the workflow. Mitigated by `signal_rejections_total`, bounded rejection details, and `wf.log.warn("signal-rejected", ...)`.
- Source-level structural tests must be updated if handler registration moves out of `workflows.ts`.

## Rejected Alternatives

| Option | Outcome |
|---|---|
| Keep `safeUpdateHandler` for signals | Rejected — still fails workflow via `ApplicationFailure.nonRetryable`. |
| Let ordinary errors escape | Rejected — causes Workflow Task failure retry loops and queryability loss. |
| Store raw payloads in rejection state | Rejected — history-size and sensitive-content risk. |
| Use `node:crypto` SHA-256 | Rejected — not workflow-bundle-safe. |
| Migrate signals to `wf.defineUpdate` | Rejected — ADV intentionally uses signal/query-only change workflows; update histories previously caused replay poisoning. |

## References

- Temporal docs: <https://docs.temporal.io/handling-messages#exceptions>
- Temporal deterministic constraints: <https://docs.temporal.io/workflow-definition#deterministic-constraints>
- Temporal safe deployments: <https://docs.temporal.io/develop/safe-deployments>
- SDK workflow sandbox note: `@temporalio/workflow` known problematic modules (`node:crypto`), SDK PR #519 / issue #1390
- `plugin/src/temporal/change-state.ts` — `applyGateStuckToState`, KD-8 Layer 2 size guard, `applySignalRejectionToState`
- `plugin/src/temporal/workflows.ts` — `signalMutation`, `signalAsync`
- Wisdom: `pw-TPaAlADl`
