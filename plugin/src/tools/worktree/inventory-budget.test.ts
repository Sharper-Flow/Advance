import { describe, expect, it } from "vitest";
import {
  INVENTORY_INTERNAL_BUDGET_MS,
  createInventoryBudget,
} from "./inventory-budget";

describe("createInventoryBudget", () => {
  it("reserves five seconds beneath the sixty-second caller-visible cap", () => {
    expect(INVENTORY_INTERNAL_BUDGET_MS).toBe(55_000);
  });

  it("prevents new inspection admission after its internal deadline", () => {
    let now = 1_000;
    const budget = createInventoryBudget({ now: () => now, timeoutMs: 10 });

    expect(budget.canStartInspection()).toBe(true);
    now += 10;

    expect(budget.canStartInspection()).toBe(false);
    expect(budget.stopReason()).toBe("internal_budget_exhausted");
    expect(budget.signal.aborted).toBe(true);
  });

  it("propagates caller cancellation and refuses later inspection", () => {
    const caller = new AbortController();
    const budget = createInventoryBudget({ callerSignal: caller.signal });

    caller.abort("caller cancelled");

    expect(budget.canStartInspection()).toBe(false);
    expect(budget.stopReason()).toBe("caller_cancelled");
    expect(budget.signal.aborted).toBe(true);
  });

  it("does not relabel a stopped inventory as complete", () => {
    let now = 0;
    const budget = createInventoryBudget({ now: () => now, timeoutMs: 1 });
    now = 1;

    expect(budget.snapshot()).toEqual({
      complete: false,
      stopReason: "internal_budget_exhausted",
    });
  });
});
