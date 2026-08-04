import { describe, expect, test } from "vitest";
import {
  DEFAULT_TOOL_TIMEOUT_MS,
  STATUS_READ_DEADLINE_BUDGET_MS,
  TOOL_RESPONSE_HEADROOM_MS,
} from "./tool-budgets";

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
});
