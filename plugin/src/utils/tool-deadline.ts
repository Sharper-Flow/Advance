/**
 * Ambient deadline for one host-tool invocation.
 *
 * The tool boundary (`safeExecute` / `safeExecuteSimple`) races the handler
 * against a wall-clock timeout. Inner blocking work must be able to size its
 * own wait against what is *left* of that budget, not against the budget the
 * invocation started with — otherwise a late inner wait can outlive the outer
 * timeout and the host safety-net wins instead of a typed failure.
 *
 * Tool execution is asynchronous and invocations overlap, so this uses
 * AsyncLocalStorage rather than a module-level current value, mirroring
 * `tool-operation-context.ts`. Outside a tool invocation the store is empty and
 * callers fall back to their own bounded default.
 */
import { AsyncLocalStorage } from "node:async_hooks";

export interface ToolDeadline {
  /** Budget the invocation started with. */
  readonly budgetMs: number;
  /** Absolute `Date.now()` value at which the outer budget expires. */
  readonly deadlineAt: number;
}

const toolDeadlineStorage = new AsyncLocalStorage<ToolDeadline>();

/** Runs `execute` under a deadline of `budgetMs` from now. */
export function withToolDeadline<T>(
  budgetMs: number,
  execute: () => Promise<T>,
): Promise<T> {
  if (!Number.isFinite(budgetMs) || budgetMs <= 0) return execute();
  return toolDeadlineStorage.run(
    { budgetMs, deadlineAt: Date.now() + budgetMs },
    execute,
  );
}

/** The active invocation deadline, or `undefined` outside a tool invocation. */
export function getToolDeadline(): ToolDeadline | undefined {
  return toolDeadlineStorage.getStore();
}

/**
 * Milliseconds left in the active invocation budget, or `undefined` outside a
 * tool invocation. Never negative: an already-expired budget reports `0`.
 */
export function getRemainingToolBudgetMs(): number | undefined {
  const deadline = toolDeadlineStorage.getStore();
  if (!deadline) return undefined;
  return Math.max(0, deadline.deadlineAt - Date.now());
}
