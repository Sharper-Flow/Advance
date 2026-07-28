/**
 * Bun tests for the bounded optional-enrichment wrapper.
 *
 * Regression cover for fixWorkerDependentResume: an advisory enrichment must
 * never gate primary CLI output. Before this change, `runStatus` and
 * `runEpicListCommand` awaited `loadLiveResumeProjection` inside a
 * `Promise.all`, so a projection that never resolved (no worker polling the
 * task queue) held the status table hostage for N x timeout.
 *
 * Run with: bun test bin/lib/optional-enrichment.test.ts
 */

import { describe, expect, test } from "bun:test";

import { settleWithinBudget } from "./optional-enrichment";

/** A promise that never settles — models a query with zero pollers. */
const never = () => new Promise<never>(() => {});

describe("settleWithinBudget", () => {
  test("returns unsettled within budget when the promise never resolves", async () => {
    const start = Date.now();
    const result = await settleWithinBudget(never(), 100);
    const elapsed = Date.now() - start;

    expect(result.settled).toBe(false);
    if (!result.settled) {
      expect(result.reason).toBeTruthy();
    }
    expect(elapsed).toBeLessThan(500);
  });

  test("passes a resolved value through unchanged", async () => {
    const result = await settleWithinBudget(Promise.resolve("ok"), 100);

    expect(result).toEqual({ settled: true, value: "ok" });
  });

  test("converts rejection into unsettled rather than throwing", async () => {
    const result = await settleWithinBudget(
      Promise.reject(new Error("boom")),
      100,
    );

    expect(result.settled).toBe(false);
    if (!result.settled) {
      expect(result.reason).toContain("boom");
    }
  });

  test("reports a distinct reason for timeout vs failure", async () => {
    const timedOut = await settleWithinBudget(never(), 50);
    const failed = await settleWithinBudget(
      Promise.reject(new Error("boom")),
      50,
    );

    expect(timedOut.settled).toBe(false);
    expect(failed.settled).toBe(false);
    if (!timedOut.settled && !failed.settled) {
      // A consumer must be able to tell "we ran out of time" from "it broke".
      expect(timedOut.reason).not.toEqual(failed.reason);
    }
  });

  test("N pending enrichments do not sum their budgets (AC4)", async () => {
    const start = Date.now();

    await Promise.all(
      Array.from({ length: 25 }, () => settleWithinBudget(never(), 100)),
    );

    const elapsed = Date.now() - start;

    // Sequential behaviour would be 25 x 100ms = 2500ms. Concurrent is ~100ms.
    expect(elapsed).toBeLessThan(500);
  });

  test("does not leave a pending timer that keeps the process alive", async () => {
    // A settled promise must clear its timeout; otherwise `bun test` hangs on
    // the longest budget passed anywhere in the run.
    const start = Date.now();
    await settleWithinBudget(Promise.resolve(1), 30_000);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(500);
  });
});
