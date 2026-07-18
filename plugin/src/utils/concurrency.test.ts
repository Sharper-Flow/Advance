import { describe, expect, it } from "vitest";

import { mapWithConcurrency, STORE_SCAN_CONCURRENCY } from "./concurrency";

function deferredDelay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("mapWithConcurrency", () => {
  it("preserves input order regardless of completion order", async () => {
    const input = [40, 5, 30, 10, 0, 25];
    const result = await mapWithConcurrency(input, 3, async (n) => {
      await deferredDelay(n);
      return n * 2;
    });
    expect(result).toEqual([80, 10, 60, 20, 0, 50]);
  });

  it("passes the index to the mapper", async () => {
    const input = ["a", "b", "c"];
    const result = await mapWithConcurrency(
      input,
      2,
      async (v, i) => `${v}${i}`,
    );
    expect(result).toEqual(["a0", "b1", "c2"]);
  });

  it("never exceeds the concurrency limit of in-flight tasks", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const items = Array.from({ length: 50 }, (_, i) => i);
    await mapWithConcurrency(items, 4, async (n) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await deferredDelay(n % 5);
      inFlight -= 1;
      return n;
    });
    expect(maxInFlight).toBeLessThanOrEqual(4);
    expect(maxInFlight).toBeGreaterThan(1);
  });

  it("clamps concurrency above item count without error", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const items = [1, 2, 3];
    const result = await mapWithConcurrency(items, 100, async (n) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await deferredDelay(1);
      inFlight -= 1;
      return n;
    });
    expect(result).toEqual([1, 2, 3]);
    expect(maxInFlight).toBeLessThanOrEqual(3);
  });

  it("treats concurrency < 1 as a single worker", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const items = [1, 2, 3, 4];
    const result = await mapWithConcurrency(items, 0, async (n) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await deferredDelay(1);
      inFlight -= 1;
      return n;
    });
    expect(result).toEqual([1, 2, 3, 4]);
    expect(maxInFlight).toBe(1);
  });

  it("returns an empty array for empty input without invoking the mapper", async () => {
    let called = false;
    const result = await mapWithConcurrency([], 8, async (n) => {
      called = true;
      return n;
    });
    expect(result).toEqual([]);
    expect(called).toBe(false);
  });

  it("propagates a mapper rejection", async () => {
    const items = [1, 2, 3];
    await expect(
      mapWithConcurrency(items, 2, async (n) => {
        if (n === 2) throw new Error("boom");
        return n;
      }),
    ).rejects.toThrow("boom");
  });

  it("exposes a sane default store-scan concurrency", () => {
    expect(STORE_SCAN_CONCURRENCY).toBeGreaterThanOrEqual(8);
    expect(STORE_SCAN_CONCURRENCY).toBeLessThanOrEqual(64);
  });
});
