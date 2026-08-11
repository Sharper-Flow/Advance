import { describe, expect, test } from "vitest";

import { safeExecute } from "./safe-execute";
import { DEFAULT_TOOL_TIMEOUT_MS } from "./tool-budgets";
import {
  getRemainingToolBudgetMs,
  getToolDeadline,
  withToolDeadline,
} from "./tool-deadline";

describe("tool deadline scope", () => {
  test("reports no budget outside a tool invocation", () => {
    expect(getToolDeadline()).toBeUndefined();
    expect(getRemainingToolBudgetMs()).toBeUndefined();
  });

  test("exposes a remaining budget bounded by the invocation budget", async () => {
    const remaining = await withToolDeadline(1_000, async () =>
      getRemainingToolBudgetMs(),
    );
    expect(remaining).toBeDefined();
    expect(remaining as number).toBeGreaterThan(0);
    expect(remaining as number).toBeLessThanOrEqual(1_000);
  });

  test("never reports a negative budget once the deadline has passed", async () => {
    const remaining = await withToolDeadline(20, async () => {
      await new Promise((resolve) => setTimeout(resolve, 40));
      return getRemainingToolBudgetMs();
    });
    expect(remaining).toBe(0);
  });

  test("keeps concurrent scopes isolated", async () => {
    const [wide, narrow] = await Promise.all([
      withToolDeadline(5_000, async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return getToolDeadline()?.budgetMs;
      }),
      withToolDeadline(50, async () => getToolDeadline()?.budgetMs),
    ]);
    expect(wide).toBe(5_000);
    expect(narrow).toBe(50);
  });

  test("ignores a non-positive budget rather than creating an expired scope", async () => {
    expect(
      await withToolDeadline(0, async () => getToolDeadline()),
    ).toBeUndefined();
  });

  test("safeExecute establishes the deadline for the wrapped handler", async () => {
    let observed: number | undefined;
    const wrapped = safeExecute(async () => {
      observed = getRemainingToolBudgetMs();
      return "ok";
    }, "test_tool");

    await wrapped({}, {});

    expect(observed).toBeDefined();
    expect(observed as number).toBeGreaterThan(0);
    expect(observed as number).toBeLessThanOrEqual(DEFAULT_TOOL_TIMEOUT_MS);
    // The scope must not leak past the invocation.
    expect(getRemainingToolBudgetMs()).toBeUndefined();
  });
});
