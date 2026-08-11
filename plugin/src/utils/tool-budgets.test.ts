import { describe, expect, test } from "vitest";
import { HEALTH_EXECUTION_CUTOFF_MS } from "../tools/status-health-plan";
import {
  DEFAULT_LOCK_BUDGET_MS,
  DEFAULT_TOOL_TIMEOUT_MS,
  deriveLockBudgetMs,
  LOCK_ACQUISITION_DEADLINE_BUDGET_MS,
  STATUS_READ_DEADLINE_BUDGET_MS,
  TOOL_RESPONSE_HEADROOM_MS,
} from "./tool-budgets";
import { DEFAULT_LOCK_TIMEOUT_MS } from "./fs";

describe("status read/tool timeout budget contract", () => {
  test("keeps the measured response headroom and derived status budget", () => {
    // These fixed measurements make changing either source constant alone a
    // deliberate CI decision instead of a silent erosion of the margin.
    expect(DEFAULT_TOOL_TIMEOUT_MS).toBe(10_000);
    expect(TOOL_RESPONSE_HEADROOM_MS).toBe(199);
    expect(STATUS_READ_DEADLINE_BUDGET_MS).toBe(
      DEFAULT_TOOL_TIMEOUT_MS - TOOL_RESPONSE_HEADROOM_MS,
    );
    expect(STATUS_READ_DEADLINE_BUDGET_MS).toBe(9_801);
  });

  test("AC5: budget + headroom never exceeds the host tool cap", () => {
    // Machine-checked invariant: regardless of how the source constants
    // change, the serialization headroom must always fit beneath the cap so
    // degradation can be reached and serialized before the host fires.
    expect(
      STATUS_READ_DEADLINE_BUDGET_MS + TOOL_RESPONSE_HEADROOM_MS,
    ).toBeLessThanOrEqual(DEFAULT_TOOL_TIMEOUT_MS);
    // Headroom must be strictly positive — a zero/negative margin means
    // the degraded response has no time to serialize.
    expect(TOOL_RESPONSE_HEADROOM_MS).toBeGreaterThan(0);
  });

  test("health execution cutoff stays inside the status read budget", () => {
    // The health executor has its own provider cutoff, but the outer status
    // deadline is authoritative. Keep the inner cutoff strictly below it so
    // the health guard can never outlive the remaining status-read budget.
    expect(HEALTH_EXECUTION_CUTOFF_MS).toBeLessThan(
      STATUS_READ_DEADLINE_BUDGET_MS,
    );
  });

  test("AC5: lock ceiling plus response reserve stays inside the outer tool budget", () => {
    expect(
      LOCK_ACQUISITION_DEADLINE_BUDGET_MS + TOOL_RESPONSE_HEADROOM_MS,
    ).toBeLessThanOrEqual(DEFAULT_TOOL_TIMEOUT_MS);
    expect(LOCK_ACQUISITION_DEADLINE_BUDGET_MS).toBe(
      DEFAULT_TOOL_TIMEOUT_MS - TOOL_RESPONSE_HEADROOM_MS,
    );
  });

  test("AC5: derived lock budget never exceeds the remaining outer budget", () => {
    // Sweep the whole invocation: a wait that starts late must shrink with the
    // budget that is actually left, not with the budget it started with.
    for (let elapsed = 0; elapsed <= DEFAULT_TOOL_TIMEOUT_MS; elapsed += 137) {
      const remaining = DEFAULT_TOOL_TIMEOUT_MS - elapsed;
      const derived = deriveLockBudgetMs(undefined, remaining);
      expect(derived).toBeGreaterThanOrEqual(0);
      expect(derived + TOOL_RESPONSE_HEADROOM_MS).toBeLessThanOrEqual(
        remaining + TOOL_RESPONSE_HEADROOM_MS,
      );
      expect(derived).toBeLessThanOrEqual(remaining);
      expect(derived).toBeLessThanOrEqual(LOCK_ACQUISITION_DEADLINE_BUDGET_MS);
    }
  });

  test("AC5: an exhausted outer budget leaves no lock wait", () => {
    expect(deriveLockBudgetMs(undefined, 0)).toBe(0);
    expect(deriveLockBudgetMs(60_000, TOOL_RESPONSE_HEADROOM_MS)).toBe(0);
  });

  test("AC5: an explicit caller timeout can only lower the derived budget", () => {
    expect(deriveLockBudgetMs(50, DEFAULT_TOOL_TIMEOUT_MS)).toBe(50);
    expect(deriveLockBudgetMs(60_000, DEFAULT_TOOL_TIMEOUT_MS)).toBe(
      LOCK_ACQUISITION_DEADLINE_BUDGET_MS,
    );
  });

  test("AC6: no-deadline callers retain a bounded default budget", () => {
    expect(deriveLockBudgetMs(undefined, undefined)).toBe(
      DEFAULT_LOCK_BUDGET_MS,
    );
    expect(DEFAULT_LOCK_BUDGET_MS).toBe(DEFAULT_LOCK_TIMEOUT_MS);
    expect(Number.isFinite(deriveLockBudgetMs(undefined, undefined))).toBe(
      true,
    );
    expect(deriveLockBudgetMs(undefined, undefined)).toBeGreaterThan(0);
  });
});
