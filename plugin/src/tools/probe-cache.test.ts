import { describe, expect, test } from "vitest";

import { createProbeCache } from "./probe-cache";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("createProbeCache", () => {
  test("coalesces concurrent fetches for the same key", async () => {
    let calls = 0;
    const cache = createProbeCache<number>({
      name: "coalesce-probe",
      ttlMs: 1_000,
      fetch: async () => {
        calls += 1;
        await sleep(5);
        return 42;
      },
    });

    const results = await Promise.all(
      Array.from({ length: 10 }, () => cache.fetch("health")),
    );

    expect(calls).toBe(1);
    expect(results.map((result) => result.value)).toEqual(Array(10).fill(42));
    expect(results.every((result) => result.freshness.stale === false)).toBe(
      true,
    );
  });

  test("refreshes after TTL expiry", async () => {
    let calls = 0;
    const cache = createProbeCache<number>({
      name: "ttl-probe",
      ttlMs: 5,
      fetch: async () => {
        calls += 1;
        return calls;
      },
    });

    expect((await cache.fetch("health")).value).toBe(1);
    await sleep(10);
    expect((await cache.fetch("health")).value).toBe(2);
  });

  test("returns stale value when refresh aborts", async () => {
    let calls = 0;
    const cache = createProbeCache<number>({
      name: "abort-probe",
      ttlMs: 5,
      timeoutMs: 5,
      fetch: async (_key, { signal }) => {
        calls += 1;
        if (calls === 1) return 1;
        await new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new Error("aborted")), {
            once: true,
          });
        });
        return 2;
      },
    });

    expect((await cache.fetch("health")).value).toBe(1);
    await sleep(10);
    const result = await cache.fetch("health");

    expect(result.value).toBe(1);
    expect(result.freshness.stale).toBe(true);
    expect(result.freshness.error).toContain("aborted");
  });

  test("returns last-known-good stale value when refresh rejects", async () => {
    let calls = 0;
    const cache = createProbeCache<number>({
      name: "reject-probe",
      ttlMs: 5,
      fetch: async () => {
        calls += 1;
        if (calls === 1) return 7;
        throw new Error("probe exploded");
      },
    });

    expect((await cache.fetch("health")).value).toBe(7);
    await sleep(10);
    const result = await cache.fetch("health");

    expect(result.value).toBe(7);
    expect(result.freshness.stale).toBe(true);
    expect(result.freshness.error).toContain("probe exploded");
  });

  test("surfaces clear error on cold failure", async () => {
    const cache = createProbeCache<number>({
      name: "cold-probe",
      ttlMs: 1_000,
      fetch: async () => {
        throw new Error("network down");
      },
    });

    await expect(cache.fetch("cold")).rejects.toThrow(
      "Probe cache fetch failed for cold-probe[cold]: network down",
    );
  });
});
