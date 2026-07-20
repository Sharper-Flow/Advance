/**
 * Bounded execution context for read-only worktree inventory.
 *
 * Interactive callers may reserve up to 60 seconds, but collectors stop at
 * 55 seconds. The five-second reserve is for rendering a typed partial result
 * before the caller-visible safety timeout fires.
 */
export const INVENTORY_INTERNAL_BUDGET_MS = 55_000;

export type InventoryStopReason =
  | "caller_cancelled"
  | "internal_budget_exhausted";

export interface InventoryBudget {
  readonly signal: AbortSignal;
  canStartInspection(): boolean;
  stopReason(): InventoryStopReason | undefined;
  snapshot(): { complete: boolean; stopReason?: InventoryStopReason };
  dispose(): void;
}

export interface CreateInventoryBudgetOptions {
  /** Signal supplied by the OpenCode tool host, when available. */
  callerSignal?: AbortSignal;
  /** Internal collector budget. Defaults to 55 seconds. */
  timeoutMs?: number;
  /** Injectable clock for deterministic admission checks. */
  now?: () => number;
}

/**
 * Stops new inspection admission when the caller cancels or the collector's
 * internal deadline expires. Work already started may still settle, so callers
 * must render incomplete state rather than infer completion from a late child.
 */
export function createInventoryBudget(
  options: CreateInventoryBudgetOptions = {},
): InventoryBudget {
  const now = options.now ?? Date.now;
  const timeoutMs = options.timeoutMs ?? INVENTORY_INTERNAL_BUDGET_MS;
  const deadlineAt = now() + timeoutMs;
  const controller = new AbortController();
  let reason: InventoryStopReason | undefined;

  const stop = (nextReason: InventoryStopReason) => {
    if (reason) return;
    reason = nextReason;
    controller.abort(nextReason);
  };

  const onCallerAbort = () => stop("caller_cancelled");
  if (options.callerSignal?.aborted) {
    onCallerAbort();
  } else {
    options.callerSignal?.addEventListener("abort", onCallerAbort, {
      once: true,
    });
  }

  const timer = setTimeout(
    () => stop("internal_budget_exhausted"),
    Math.max(0, timeoutMs),
  );
  timer.unref?.();

  const checkDeadline = () => {
    if (!reason && now() >= deadlineAt) {
      stop("internal_budget_exhausted");
    }
  };

  return {
    signal: controller.signal,
    canStartInspection() {
      checkDeadline();
      return !controller.signal.aborted;
    },
    stopReason() {
      checkDeadline();
      return reason;
    },
    snapshot() {
      checkDeadline();
      return reason
        ? { complete: false, stopReason: reason }
        : { complete: true };
    },
    dispose() {
      clearTimeout(timer);
      options.callerSignal?.removeEventListener("abort", onCallerAbort);
    },
  };
}
