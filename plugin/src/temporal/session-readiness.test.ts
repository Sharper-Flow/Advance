import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  evaluateTargetReadiness,
  markStale,
  registerReadinessProbes,
  resetReadinessState,
  type DescribeTaskQueueProbe,
  type EvaluateTargetReadinessInput,
  type QueryProbe,
} from "./session-readiness";

beforeEach(() => {
  resetReadinessState();
});

function baseInput(
  overrides: Partial<EvaluateTargetReadinessInput> = {},
): EvaluateTargetReadinessInput {
  return {
    targetQueue: "advance-proj-a",
    hasWorkflow: false,
    localSignal: {
      localRegistered: true,
      localWorkerAlive: true,
      localOwnership: "owned",
    },
    serverPollerStatus: "unavailable",
    staleRunningWorkflowCount: 0,
    nowMs: () => 0,
    cacheTtlMs: 10_000,
    probeBudgetMs: 2_000,
    ...overrides,
  };
}

describe("evaluateTargetReadiness", () => {
  it("exists + Query pass -> READY with probeKind query", async () => {
    const queryProbe: QueryProbe = vi.fn().mockResolvedValue({ ok: true });
    const result = await evaluateTargetReadiness(
      baseInput({ hasWorkflow: true, queryProbe }),
    );

    expect(result.ready).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.probeKind).toBe("query");
    expect(queryProbe).toHaveBeenCalledTimes(1);
    expect(queryProbe).toHaveBeenCalledWith("advance-proj-a");
  });

  it("exists + Query FAIL -> NOT_READY even if DescribeTaskQueue is fresh", async () => {
    const queryProbe: QueryProbe = vi
      .fn()
      .mockResolvedValue({ ok: false, error: "query_rejected" });
    const describeTaskQueueProbe: DescribeTaskQueueProbe = vi
      .fn()
      .mockResolvedValue({
        status: "fresh",
        lastAccessMs: 1_000,
        pollerCount: 1,
        lastPollerAt: "1970-01-01T00:00:01.000Z",
      });

    const result = await evaluateTargetReadiness(
      baseInput({
        hasWorkflow: true,
        queryProbe,
        describeTaskQueueProbe,
        serverPollerStatus: "fresh",
      }),
    );

    expect(result.ready).toBe(false);
    expect(result.blockers).toContain("ADV_SESSION_NOT_READY");
    expect(result.probeKind).toBe("none");
    expect(describeTaskQueueProbe).not.toHaveBeenCalled();
  });

  it("no-workflow + local-worker up -> READY with probeKind local", async () => {
    const result = await evaluateTargetReadiness(
      baseInput({
        hasWorkflow: false,
        localSignal: {
          localRegistered: true,
          localWorkerAlive: true,
          localOwnership: "owned",
        },
      }),
    );

    expect(result.ready).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.probeKind).toBe("local");
  });

  it("no-workflow + local-worker down -> NOT_READY", async () => {
    const result = await evaluateTargetReadiness(
      baseInput({
        hasWorkflow: false,
        localSignal: {
          localRegistered: true,
          localWorkerAlive: false,
          localOwnership: "owned",
        },
      }),
    );

    expect(result.ready).toBe(false);
    expect(result.blockers).toContain("ADV_SESSION_NOT_READY");
    expect(result.probeKind).toBe("none");
  });

  it("no-workflow + server-only fresh does not override missing local worker", async () => {
    const result = await evaluateTargetReadiness(
      baseInput({
        hasWorkflow: false,
        localSignal: {
          localRegistered: false,
          localWorkerAlive: false,
          localOwnership: "peer",
        },
        serverPollerStatus: "fresh",
      }),
    );

    expect(result.ready).toBe(false);
    expect(result.blockers).toContain("ADV_SESSION_NOT_READY");
    expect(result.probeKind).toBe("none");
  });

  it("TTL expiry -> STALE -> re-probe", async () => {
    const queryProbe: QueryProbe = vi.fn().mockResolvedValue({ ok: true });
    const now = { value: 0 };
    const input = baseInput({
      hasWorkflow: true,
      queryProbe,
      nowMs: () => now.value,
      cacheTtlMs: 10_000,
    });

    const first = await evaluateTargetReadiness(input);
    expect(first.ready).toBe(true);
    expect(queryProbe).toHaveBeenCalledTimes(1);

    // cache hit within TTL
    now.value = 9_999;
    const second = await evaluateTargetReadiness(input);
    expect(second.ready).toBe(true);
    expect(queryProbe).toHaveBeenCalledTimes(1);

    // TTL expired -> stale -> re-probe
    now.value = 10_001;
    const third = await evaluateTargetReadiness(input);
    expect(third.ready).toBe(true);
    expect(queryProbe).toHaveBeenCalledTimes(2);
  });

  it("markStale -> STALE -> re-probe on next access", async () => {
    const queryProbe: QueryProbe = vi.fn().mockResolvedValue({ ok: true });
    const input = baseInput({
      hasWorkflow: true,
      queryProbe,
      nowMs: () => 0,
      cacheTtlMs: 10_000,
    });

    const first = await evaluateTargetReadiness(input);
    expect(first.ready).toBe(true);
    expect(queryProbe).toHaveBeenCalledTimes(1);

    markStale("advance-proj-a");

    // Next evaluation re-probes even though TTL is still valid.
    const second = await evaluateTargetReadiness(input);
    expect(second.ready).toBe(true);
    expect(queryProbe).toHaveBeenCalledTimes(2);
  });

  it("cache-hit fast path returns without calling probes", async () => {
    const queryProbe: QueryProbe = vi.fn().mockResolvedValue({ ok: true });
    const input = baseInput({
      hasWorkflow: true,
      queryProbe,
      nowMs: () => 0,
      cacheTtlMs: 10_000,
    });

    await evaluateTargetReadiness(input);
    const start = performance.now();
    const cached = await evaluateTargetReadiness(input);
    const elapsed = performance.now() - start;

    expect(cached.ready).toBe(true);
    expect(cached.blockers).toEqual([]);
    expect(queryProbe).toHaveBeenCalledTimes(1);
    expect(elapsed).toBeLessThan(1);
  });

  it("probe budget timeout is fail-closed", async () => {
    const queryProbe: QueryProbe = vi
      .fn()
      .mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve({ ok: true }), 10_000),
          ),
      );
    const input = baseInput({
      hasWorkflow: true,
      queryProbe,
      probeBudgetMs: 50,
      nowMs: () => 0,
    });

    const result = await evaluateTargetReadiness(input);

    expect(result.ready).toBe(false);
    expect(result.blockers).toContain("ADV_SESSION_NOT_READY");
    expect(result.probeKind).toBe("none");
  });

  it("registered probes are used when per-call probes are omitted", async () => {
    const queryProbe: QueryProbe = vi.fn().mockResolvedValue({ ok: true });
    registerReadinessProbes({ query: queryProbe });

    const result = await evaluateTargetReadiness(
      baseInput({ hasWorkflow: true }),
    );

    expect(result.ready).toBe(true);
    expect(queryProbe).toHaveBeenCalledTimes(1);
  });

  it("per-call probe overrides registered probe", async () => {
    const registeredProbe: QueryProbe = vi.fn().mockResolvedValue({ ok: true });
    const perCallProbe: QueryProbe = vi.fn().mockResolvedValue({ ok: true });
    registerReadinessProbes({ query: registeredProbe });

    await evaluateTargetReadiness(
      baseInput({ hasWorkflow: true, queryProbe: perCallProbe }),
    );

    expect(perCallProbe).toHaveBeenCalledTimes(1);
    expect(registeredProbe).not.toHaveBeenCalled();
  });

  it("no-workflow records advisory DescribeTaskQueue stale blocker when local fails", async () => {
    const describeTaskQueueProbe: DescribeTaskQueueProbe = vi
      .fn()
      .mockResolvedValue({
        status: "stale",
        lastAccessMs: 90_000,
        pollerCount: 1,
        lastPollerAt: "1970-01-01T00:00:10.000Z",
      });

    const result = await evaluateTargetReadiness(
      baseInput({
        hasWorkflow: false,
        localSignal: {
          localRegistered: true,
          localWorkerAlive: false,
          localOwnership: "owned",
        },
        describeTaskQueueProbe,
      }),
    );

    expect(result.ready).toBe(false);
    expect(result.blockers).toContain("ADV_SESSION_NOT_READY");
    expect(result.blockers).toContain("describe_task_queue_stale");
  });

  it("DescribeTaskQueue diagnostic never overrides a ready local signal", async () => {
    const describeTaskQueueProbe: DescribeTaskQueueProbe = vi
      .fn()
      .mockResolvedValue({
        status: "stale",
        lastAccessMs: 90_000,
        pollerCount: 1,
        lastPollerAt: "1970-01-01T00:00:10.000Z",
      });

    const result = await evaluateTargetReadiness(
      baseInput({
        hasWorkflow: false,
        localSignal: {
          localRegistered: true,
          localWorkerAlive: true,
          localOwnership: "owned",
        },
        describeTaskQueueProbe,
      }),
    );

    expect(result.ready).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(describeTaskQueueProbe).not.toHaveBeenCalled();
  });

  it("DDC2: cache TTL is capped at 10s", async () => {
    const queryProbe: QueryProbe = vi.fn().mockResolvedValue({ ok: true });
    const now = { value: 0 };
    const input = baseInput({
      hasWorkflow: true,
      queryProbe,
      nowMs: () => now.value,
      cacheTtlMs: 100_000,
    });

    await evaluateTargetReadiness(input);
    expect(queryProbe).toHaveBeenCalledTimes(1);

    // 10s cap means the entry should be treated as stale at 10_001ms.
    now.value = 10_001;
    const result = await evaluateTargetReadiness(input);
    expect(result.ready).toBe(true);
    expect(queryProbe).toHaveBeenCalledTimes(2);
  });

  it("DDC1: probe budget is capped at 2s and fail-closed on timeout", async () => {
    const queryProbe: QueryProbe = vi
      .fn()
      .mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve({ ok: true }), 10_000),
          ),
      );
    const input = baseInput({
      hasWorkflow: true,
      queryProbe,
      probeBudgetMs: 100_000,
      nowMs: () => 0,
    });

    const result = await evaluateTargetReadiness(input);
    expect(result.ready).toBe(false);
    expect(result.blockers).toContain("ADV_SESSION_NOT_READY");
    expect(queryProbe).toHaveBeenCalledTimes(1);
  });
});

describe("markStale", () => {
  it("creates a stale entry for an unknown target", async () => {
    markStale("advance-proj-a");

    const queryProbe: QueryProbe = vi.fn().mockResolvedValue({ ok: true });
    const input = baseInput({ hasWorkflow: true, queryProbe });
    const result = await evaluateTargetReadiness(input);

    expect(result.ready).toBe(true);
    expect(queryProbe).toHaveBeenCalledTimes(1);
  });
});
