/**
 * status-execution.test.ts
 *
 * TDD RED tests for the request-local health execution primitive.
 * The production module (./status-execution) does not yet exist.
 */

import { describe, test, expect, beforeEach } from "vitest";
import {
  executeHealthPlan,
  type Clock,
  type TimerService,
  type HealthExecutionPlanConfig,
  type HealthProviderDescriptor,
  type HealthProviderContext,
  type HealthProviderOutcome,
  type HealthExecutionResult,
} from "./status-execution";

const RESPONSE_DEADLINE_MS = 8_000;
const EXECUTION_CUTOFF_MS = 7_500;
const COMPOSITION_RESERVE_MS = 500;
const MAX_CONCURRENCY = 4;

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

class TestScheduler {
  private time = 0;
  private nextId = 1;
  private timers: Array<{ id: number; due: number; cb: () => void }> = [];

  readonly clock: Clock = { now: () => this.time };

  readonly timer: TimerService = {
    setTimeout: (cb, ms) => {
      const id = this.nextId++;
      this.timers.push({ id, due: this.time + ms, cb });
      this.timers.sort((a, b) => a.due - b.due);
      return id;
    },
    clearTimeout: (id) => {
      this.timers = this.timers.filter((t) => t.id !== id);
    },
  };

  async advance(ms: number): Promise<void> {
    await flushMicrotasks();
    const target = this.time + ms;
    while (this.timers.length > 0 && this.timers[0].due <= target) {
      const t = this.timers.shift()!;
      this.time = t.due;
      t.cb();
      await flushMicrotasks();
    }
    this.time = target;
    await flushMicrotasks();
  }

  now(): number {
    return this.time;
  }
}

function sleep(timer: TimerService, ms: number): Promise<void> {
  return new Promise((resolve) => {
    timer.setTimeout(resolve, ms);
  });
}

describe("request-local health execution primitive", () => {
  let scheduler: TestScheduler;

  beforeEach(() => {
    scheduler = new TestScheduler();
  });

  function baseConfig(
    providers: HealthProviderDescriptor[],
  ): HealthExecutionPlanConfig {
    return {
      responseDeadlineMs: RESPONSE_DEADLINE_MS,
      executionCutoffMs: EXECUTION_CUTOFF_MS,
      compositionReserveMs: COMPOSITION_RESERVE_MS,
      maxConcurrency: MAX_CONCURRENCY,
      providers,
      clock: scheduler.clock,
      timer: scheduler.timer,
    };
  }

  test("surfaces budget, reserve, and concurrency in result meta", async () => {
    const plan = executeHealthPlan(
      baseConfig([
        {
          source: "a",
          dependencies: [],
          cap: 1000,
          cancellability: "abortable",
          async run() {
            return { kind: "ok", value: true };
          },
        },
      ]),
    );
    await scheduler.advance(EXECUTION_CUTOFF_MS);
    const result: HealthExecutionResult = await plan;

    expect(result.meta.responseDeadlineMs).toBe(RESPONSE_DEADLINE_MS);
    expect(result.meta.executionCutoffMs).toBe(EXECUTION_CUTOFF_MS);
    expect(result.meta.compositionReserveMs).toBe(COMPOSITION_RESERVE_MS);
    expect(result.meta.maxConcurrency).toBe(MAX_CONCURRENCY);
  });

  test("runs at most maxConcurrency providers concurrently", async () => {
    const starts: number[] = [];
    const providers: HealthProviderDescriptor[] = Array.from(
      { length: 5 },
      (_, i) => ({
        source: `p${i}`,
        dependencies: [],
        cap: 10_000,
        cancellability: "abortable",
        async run(ctx: HealthProviderContext) {
          starts.push(ctx.clock.now());
          await sleep(scheduler.timer, 1000);
          return { kind: "ok", value: i } as HealthProviderOutcome;
        },
      }),
    );

    const plan = executeHealthPlan(baseConfig(providers));
    expect(starts.length).toBe(MAX_CONCURRENCY);

    await scheduler.advance(2000);
    await plan;

    expect(starts.length).toBe(5);
  });

  test("reduces outcomes in static descriptor order, not completion order", async () => {
    const providers: HealthProviderDescriptor[] = [
      {
        source: "slow",
        dependencies: [],
        cap: 10_000,
        cancellability: "abortable",
        async run() {
          await sleep(scheduler.timer, 500);
          return { kind: "ok", value: "slow" } as HealthProviderOutcome;
        },
      },
      {
        source: "fast",
        dependencies: [],
        cap: 10_000,
        cancellability: "abortable",
        async run() {
          await sleep(scheduler.timer, 10);
          return { kind: "ok", value: "fast" } as HealthProviderOutcome;
        },
      },
    ];

    const plan = executeHealthPlan(baseConfig(providers));
    await scheduler.advance(500);
    const result: HealthExecutionResult = await plan;

    expect(Object.keys(result.outcomes)).toEqual(["slow", "fast"]);
  });

  test("dependency is immediately not_admitted when dependency is unusable", async () => {
    const starts: string[] = [];
    const providers: HealthProviderDescriptor[] = [
      {
        source: "primary",
        dependencies: [],
        cap: 1000,
        cancellability: "abortable",
        async run() {
          starts.push("primary");
          return { kind: "unavailable", evidence: "primary unavailable" };
        },
      },
      {
        source: "dependent",
        dependencies: ["primary"],
        cap: 1000,
        cancellability: "abortable",
        async run() {
          starts.push("dependent");
          return { kind: "ok", value: "dependent" } as HealthProviderOutcome;
        },
      },
    ];

    const plan = executeHealthPlan(baseConfig(providers));
    await scheduler.advance(1000);
    const result: HealthExecutionResult = await plan;

    expect(starts).not.toContain("dependent");
    expect(result.outcomes.dependent.kind).toBe("not_admitted");
    expect(result.outcomes.dependent.evidence).toMatch(/primary/);
  });

  test("abortable provider is cancelled and times out when cap expires", async () => {
    const providers: HealthProviderDescriptor[] = [
      {
        source: "abortable",
        dependencies: [],
        cap: 500,
        cancellability: "abortable",
        async run(ctx: HealthProviderContext) {
          await sleep(ctx.timer, 10_000);
          return { kind: "ok", value: "never" } as HealthProviderOutcome;
        },
      },
    ];

    const plan = executeHealthPlan(baseConfig(providers));
    await scheduler.advance(1000);
    const result: HealthExecutionResult = await plan;

    expect(result.outcomes.abortable.kind).toBe("timeout");
  });

  test("bounded non-cancellable provider detaches after cap and does not delay response", async () => {
    let providerFinished = false;
    const providers: HealthProviderDescriptor[] = [
      {
        source: "detach",
        dependencies: [],
        cap: 500,
        cancellability: "bounded_non_cancellable",
        async run() {
          await sleep(scheduler.timer, 3000);
          providerFinished = true;
          return { kind: "ok", value: "late" } as HealthProviderOutcome;
        },
      },
      {
        source: "fast",
        dependencies: [],
        cap: 1000,
        cancellability: "abortable",
        async run() {
          return { kind: "ok", value: "fast" } as HealthProviderOutcome;
        },
      },
    ];

    const plan = executeHealthPlan(baseConfig(providers));
    await scheduler.advance(1000);
    const result: HealthExecutionResult = await plan;

    expect(result.outcomes.detach.kind).toBe("timeout");
    expect(result.outcomes.fast.kind).toBe("ok");

    await scheduler.advance(3000);
    expect(providerFinished).toBe(true);
  });

  test("all six outcome kinds are representable", async () => {
    const providers: HealthProviderDescriptor[] = [
      {
        source: "ok",
        dependencies: [],
        cap: 1000,
        cancellability: "abortable",
        async run() {
          return { kind: "ok", value: 1 };
        },
      },
      {
        source: "stale",
        dependencies: [],
        cap: 1000,
        cancellability: "abortable",
        async run() {
          return { kind: "stale", value: 2 };
        },
      },
      {
        source: "unavailable",
        dependencies: [],
        cap: 1000,
        cancellability: "abortable",
        async run() {
          return { kind: "unavailable", evidence: "down" };
        },
      },
      {
        source: "error",
        dependencies: [],
        cap: 1000,
        cancellability: "abortable",
        async run() {
          throw new Error("boom");
        },
      },
      {
        source: "timeout",
        dependencies: [],
        cap: 500,
        cancellability: "abortable",
        async run(ctx: HealthProviderContext) {
          await sleep(ctx.timer, 10_000);
          return { kind: "ok", value: 3 } as HealthProviderOutcome;
        },
      },
      {
        source: "not_admitted",
        dependencies: ["timeout"],
        cap: 1000,
        cancellability: "abortable",
        async run() {
          return { kind: "ok", value: 4 } as HealthProviderOutcome;
        },
      },
    ];

    const plan = executeHealthPlan(baseConfig(providers));
    await scheduler.advance(1000);
    const result: HealthExecutionResult = await plan;

    expect(result.outcomes.ok.kind).toBe("ok");
    expect(result.outcomes.stale.kind).toBe("stale");
    expect(result.outcomes.unavailable.kind).toBe("unavailable");
    expect(result.outcomes.error.kind).toBe("error");
    expect(result.outcomes.timeout.kind).toBe("timeout");
    expect(result.outcomes.not_admitted.kind).toBe("not_admitted");
  });

  test("no provider starts after execution cutoff", async () => {
    const starts: string[] = [];
    const providers: HealthProviderDescriptor[] = Array.from(
      { length: 6 },
      (_, i) => {
        const source = `p${i}`;
        return {
          source,
          dependencies: [],
          cap: 10_000,
          cancellability: "abortable" as const,
          async run() {
            starts.push(source);
            await sleep(scheduler.timer, 10_000);
            return { kind: "ok", value: i } as HealthProviderOutcome;
          },
        };
      },
    );

    const plan = executeHealthPlan(baseConfig(providers));
    expect(starts.length).toBe(MAX_CONCURRENCY);

    await scheduler.advance(RESPONSE_DEADLINE_MS);
    const result: HealthExecutionResult = await plan;

    expect(starts).toHaveLength(MAX_CONCURRENCY);
    for (let i = MAX_CONCURRENCY; i < 6; i++) {
      expect(result.outcomes[`p${i}`].kind).toBe("not_admitted");
    }
  });

  test("stale dependency is usable for dependent providers", async () => {
    const providers: HealthProviderDescriptor[] = [
      {
        source: "a",
        dependencies: [],
        cap: 1000,
        cancellability: "abortable",
        async run() {
          return { kind: "stale", value: 1 };
        },
      },
      {
        source: "b",
        dependencies: ["a"],
        cap: 1000,
        cancellability: "abortable",
        async run() {
          return { kind: "ok", value: 2 };
        },
      },
    ];

    const plan = executeHealthPlan(baseConfig(providers));
    await scheduler.advance(1000);
    const result: HealthExecutionResult = await plan;

    expect(result.outcomes.a.kind).toBe("stale");
    expect(result.outcomes.b.kind).toBe("ok");
  });

  test("empty provider list is complete and emits no outcomes", async () => {
    const plan = executeHealthPlan(baseConfig([]));
    const result: HealthExecutionResult = await plan;

    expect(result.outcomes).toEqual({});
    expect(result.meta.complete).toBe(true);
    expect(result.meta.degraded).toBe(false);
  });

  test("meta reports degraded when any provider is not ok or stale", async () => {
    const providers: HealthProviderDescriptor[] = [
      {
        source: "ok",
        dependencies: [],
        cap: 1000,
        cancellability: "abortable",
        async run() {
          return { kind: "ok", value: 1 };
        },
      },
      {
        source: "bad",
        dependencies: [],
        cap: 1000,
        cancellability: "abortable",
        async run() {
          throw new Error("bad");
        },
      },
    ];

    const plan = executeHealthPlan(baseConfig(providers));
    await scheduler.advance(1000);
    const result: HealthExecutionResult = await plan;

    expect(result.meta.complete).toBe(false);
    expect(result.meta.degraded).toBe(true);
  });

  test("bounded non-cancellable provider finishing before cap yields ok", async () => {
    const providers: HealthProviderDescriptor[] = [
      {
        source: "fast",
        dependencies: [],
        cap: 1000,
        cancellability: "bounded_non_cancellable",
        async run() {
          return { kind: "ok", value: 1 };
        },
      },
    ];

    const plan = executeHealthPlan(baseConfig(providers));
    await scheduler.advance(1000);
    const result: HealthExecutionResult = await plan;

    expect(result.outcomes.fast.kind).toBe("ok");
  });
});
