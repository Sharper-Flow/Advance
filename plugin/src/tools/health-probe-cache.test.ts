/**
 * health-probe-cache.test.ts
 *
 * Request-owned health probe cache isolation and monotonic publication tests.
 */

import { describe, test, expect } from "vitest";
import { createProbeCache } from "./probe-cache";
import { createHealthProbeCache } from "./health-probe-cache";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("createHealthProbeCache", () => {
  test("request-owned direct force refresh bypasses shared same-key inflight fetch", async () => {
    let calls = 0;
    const cache = createHealthProbeCache<number>({
      name: "isolated",
      ttlMs: 60_000,
      fetch: async () => {
        calls += 1;
        await sleep(20);
        return calls;
      },
    });

    const p1 = cache.refresh("a");
    const p2 = cache.refresh("a");
    const [r1, r2] = await Promise.all([p1, p2]);

    expect(calls).toBe(2);
    expect(r1.generation).not.toBe(r2.generation);
  });

  test("monotonic per-key publication generation/CAS", async () => {
    const cache = createHealthProbeCache<number>({
      name: "generations",
      ttlMs: 60_000,
      fetch: async () => 1,
    });

    const g0 = cache.currentGeneration("a");
    const r1 = await cache.refresh("a");
    expect(r1.generation).toBeGreaterThan(g0);
    expect(cache.currentGeneration("a")).toBe(r1.generation);

    const r2 = await cache.refresh("a");
    expect(r2.generation).toBeGreaterThan(r1.generation);
    expect(cache.currentGeneration("a")).toBe(r2.generation);
  });

  test("newer refresh wins over older late completion", async () => {
    const resolvers: Array<(value: number) => void> = [];
    let call = 0;
    const cache = createHealthProbeCache<number>({
      name: "race",
      ttlMs: 60_000,
      fetch: async () => {
        call += 1;
        return new Promise((resolve) => {
          resolvers[call - 1] = resolve;
        });
      },
    });

    const pOlder = cache.refresh("a");
    const pNewer = cache.refresh("a");

    resolvers[1](20); // newer resolves first
    const rNewer = await pNewer;
    expect(rNewer.value).toBe(20);
    expect(cache.read("a")?.value).toBe(20);

    resolvers[0](10); // older resolves later
    const rOlder = await pOlder;
    expect(rOlder.value).toBe(10); // request still sees its own value
    expect(cache.read("a")?.value).toBe(20); // cache stays with newer
    expect(cache.read("a")?.generation).toBe(rNewer.generation);
  });

  test("aborted refresh cannot publish late", async () => {
    let resolveFetch: ((value: number) => void) | undefined;
    const cache = createHealthProbeCache<number>({
      name: "aborted",
      ttlMs: 60_000,
      fetch: async () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    });

    const controller = new AbortController();
    const p = cache.refresh("a", { signal: controller.signal });
    controller.abort();

    // Even if the underlying fetch completes after abort, it must not publish.
    resolveFetch?.(5);
    await expect(p).rejects.toThrow("aborted");
    expect(cache.read("a")).toBeUndefined();
  });

  test("cutoff refresh cannot publish late", async () => {
    let now = 0;
    let resolveFetch: ((value: number) => void) | undefined;
    const cache = createHealthProbeCache<number>({
      name: "cutoff",
      ttlMs: 60_000,
      clock: { now: () => now },
      fetch: async () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    });

    const p = cache.refresh("a", { cutoffTime: 50 });
    now = 100; // past cutoff before the fetch resolves
    resolveFetch?.(5);

    const result = await p;
    expect(result.value).toBe(5); // caller still observes its own result
    expect(cache.read("a")).toBeUndefined(); // but no publication happened
  });

  test("older request cannot publish after newer request has settled", async () => {
    const resolvers: Array<(value: number) => void> = [];
    let call = 0;
    const cache = createHealthProbeCache<number>({
      name: "older-blocked",
      ttlMs: 60_000,
      fetch: async () => {
        call += 1;
        return new Promise((resolve) => {
          resolvers[call - 1] = resolve;
        });
      },
    });

    const p1 = cache.refresh("a");
    const p2 = cache.refresh("a");

    resolvers[1](200);
    await p2;
    expect(cache.read("a")?.value).toBe(200);

    resolvers[0](100);
    await p1;
    expect(cache.read("a")?.value).toBe(200);
  });
});

describe("legacy createProbeCache", () => {
  test("coalesces concurrent same-key fetches unchanged", async () => {
    let calls = 0;
    const cache = createProbeCache<number>({
      name: "legacy-coalesce",
      ttlMs: 60_000,
      fetch: async () => {
        calls += 1;
        await sleep(20);
        return 42;
      },
    });

    const results = await Promise.all(
      Array.from({ length: 10 }, () => cache.fetch("a")),
    );

    expect(calls).toBe(1);
    expect(results.every((r) => r.value === 42)).toBe(true);
  });
});
