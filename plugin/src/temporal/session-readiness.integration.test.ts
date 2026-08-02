/**
 * Session-readiness integration matrix.
 *
 * Exercises the readiness barrier as a coherent whole across
 *  - session-readiness.ts (evaluateTargetReadiness / markStale)
 *  - _adapters.ts (fireSignalAndRefresh KD4 gate)
 *  - target-project.ts (ensureTargetMutationQueueReady AC7 parity)
 *  - orphan-queue-adopter.ts (markStale on worker death)
 *  - readiness-types.ts (typed ADV_SESSION_NOT_READY envelope)
 *
 * All Temporal I/O is mocked; this is a unit-level integration file.
 */

import { beforeEach, describe, expect, test, vi } from "vitest";
import { ensureTargetMutationQueueReady } from "../tools/target-project";
import { fireSignalAndRefresh, startChangeWorkflow } from "../tools/_adapters";
import {
  evaluateTargetReadiness,
  markStale,
  resetReadinessState,
  type QueryProbe,
} from "./session-readiness";
import { changeStateQuery } from "./messages";
import {
  isAdvSessionNotReady,
  ADV_SESSION_READINESS_RETRY_HINT,
} from "./readiness-types";
import { createMockOwnerFromClient } from "./__tests__/mock-owner";

const TARGET_PROJECT_ID = "a".repeat(40);
const EXPECTED_QUEUE = `advance-${TARGET_PROJECT_ID}`;

const mocks = vi.hoisted(() => {
  return {
    temporalBundle: null as any,
    ensureProjectTemporalQueue: vi.fn(async () => {}),
    getRegisteredTemporalWorkerQueues: vi.fn(() => [] as string[]),
    getTemporalWorkerAliveness: vi.fn(() => false),
    getTemporalWorkerDiagnostics: vi.fn(() => [] as any[]),
    getTemporalWorkerRole: vi.fn(() => "client" as const),
    probeTaskQueuePollers: vi.fn(async () => ({
      status: "unavailable" as const,
      lastAccessMs: null,
      error: "mock unavailable",
    })),
    ensureChangeWorkflowStarted: vi.fn(),
  };
});

mocks.temporalBundle = createMockOwnerFromClient({
  client: { workflow: { getHandle: vi.fn() } },
  connection: { workflowService: { describeTaskQueue: vi.fn() } },
  namespace: "default",
});

vi.mock("../plugin-init", () => ({
  ensureProjectTemporalQueue: mocks.ensureProjectTemporalQueue,
  getRegisteredTemporalWorkerQueues: mocks.getRegisteredTemporalWorkerQueues,
  getTemporalWorkerAliveness: mocks.getTemporalWorkerAliveness,
  getTemporalWorkerDiagnostics: mocks.getTemporalWorkerDiagnostics,
  getTemporalWorkerRole: mocks.getTemporalWorkerRole,
}));

vi.mock("../temporal/queue-serviceability", async () => {
  const actual = await vi.importActual<
    typeof import("../temporal/queue-serviceability")
  >("../temporal/queue-serviceability");
  return {
    ...actual,
    probeTaskQueuePollers: mocks.probeTaskQueuePollers,
  };
});

vi.mock("../temporal/workflow-start", () => ({
  ensureChangeWorkflowStarted: mocks.ensureChangeWorkflowStarted,
}));

beforeEach(() => {
  resetReadinessState();
  vi.clearAllMocks();
  mocks.ensureProjectTemporalQueue.mockResolvedValue(undefined);
  mocks.getRegisteredTemporalWorkerQueues.mockReturnValue([]);
  mocks.getTemporalWorkerAliveness.mockReturnValue(false);
  mocks.getTemporalWorkerDiagnostics.mockReturnValue([]);
  mocks.getTemporalWorkerRole.mockReturnValue("client");
  mocks.probeTaskQueuePollers.mockResolvedValue({
    status: "unavailable",
    lastAccessMs: null,
    error: "mock unavailable",
  });
});

function liveLocalDiagnostics(queue: string = EXPECTED_QUEUE) {
  return [
    {
      kind: "in_process" as const,
      queues: [queue],
      failedQueues: [] as string[],
      alive: true,
    },
  ];
}

function failedLocalDiagnostics(queue: string = EXPECTED_QUEUE) {
  return [
    {
      kind: "in_process" as const,
      queues: [queue],
      failedQueues: [queue],
      alive: false,
    },
  ];
}

function mockTemporalBundle() {
  return mocks.temporalBundle as unknown as NonNullable<
    Parameters<typeof ensureTargetMutationQueueReady>[0]["temporalBundle"]
  >;
}

function createMockHandle(taskQueue: string = EXPECTED_QUEUE) {
  return {
    query: vi.fn().mockResolvedValue({ status: "active" }),
    signal: vi.fn(),
    describe: vi.fn().mockResolvedValue({ taskQueue }),
    executeUpdate: vi.fn(),
    workflowId: `adv/change/proj/${Math.random().toString(36).slice(2)}`,
  };
}

function createMockStore() {
  return { changes: { refresh: vi.fn() } };
}

function expectAdvSessionNotReady(thrown: unknown): void {
  expect(isAdvSessionNotReady(thrown)).toBe(true);
  const envelope = thrown as {
    kind: string;
    blockers: string[];
    retryHint: string;
  };
  expect(envelope.kind).toBe("ADV_SESSION_NOT_READY");
  expect(envelope.blockers).toContain("ADV_SESSION_NOT_READY");
  expect(envelope.retryHint).toContain("heartbeat");
  expect(envelope.retryHint).toContain("10s");
}

describe("cross-project parity — ensureTargetMutationQueueReady (AC7)", () => {
  test("serviceable when local worker is alive and registered (owned)", async () => {
    mocks.getRegisteredTemporalWorkerQueues.mockReturnValue([EXPECTED_QUEUE]);
    mocks.getTemporalWorkerDiagnostics.mockReturnValue(liveLocalDiagnostics());
    mocks.getTemporalWorkerAliveness.mockReturnValue(true);
    mocks.getTemporalWorkerRole.mockReturnValue("host");

    const result = await ensureTargetMutationQueueReady({
      projectId: TARGET_PROJECT_ID,
      temporalBundle: mockTemporalBundle(),
    });

    expect(result.status).toBe("serviceable");
    expect(result.confidence).toBe("local");
    expect(result.blockers).toEqual([]);
    expect(mocks.probeTaskQueuePollers).not.toHaveBeenCalled();
  });

  test("serviceable via fresh server poller when local is absent", async () => {
    mocks.ensureProjectTemporalQueue.mockRejectedValue(
      new Error("no local worker"),
    );
    mocks.probeTaskQueuePollers.mockResolvedValue({
      status: "fresh",
      lastAccessMs: 12_000,
    });

    const result = await ensureTargetMutationQueueReady({
      projectId: TARGET_PROJECT_ID,
      temporalBundle: mockTemporalBundle(),
    });

    expect(result.status).toBe("serviceable");
    expect(result.confidence).toBe("server");
    expect(result.evidence.localRegistered).toBe(false);
    expect(result.evidence.localWorkerAlive).toBe(false);
  });

  test("not_serviceable when local worker is dead and server is stale", async () => {
    mocks.getRegisteredTemporalWorkerQueues.mockReturnValue([EXPECTED_QUEUE]);
    mocks.getTemporalWorkerDiagnostics.mockReturnValue(
      failedLocalDiagnostics(),
    );
    mocks.getTemporalWorkerRole.mockReturnValue("host");
    mocks.probeTaskQueuePollers.mockResolvedValue({
      status: "stale",
      lastAccessMs: 120_000,
    });

    await expect(
      ensureTargetMutationQueueReady({
        projectId: TARGET_PROJECT_ID,
        temporalBundle: mockTemporalBundle(),
      }),
    ).rejects.toThrow(/status=not_serviceable/);
  });

  test.each([
    {
      name: "none poller",
      probe: { status: "none" as const, lastAccessMs: null },
      expectedStatus: "not_serviceable",
    },
    {
      name: "unavailable DescribeTaskQueue",
      probe: {
        status: "unavailable" as const,
        lastAccessMs: null,
        error: "describeTaskQueue unavailable",
      },
      expectedStatus: "unknown",
    },
  ])(
    "$name when local worker absent and server evidence unusable",
    async ({ probe, expectedStatus }) => {
      mocks.ensureProjectTemporalQueue.mockRejectedValue(
        new Error("no local worker"),
      );
      mocks.probeTaskQueuePollers.mockResolvedValue(probe);

      await expect(
        ensureTargetMutationQueueReady({
          projectId: TARGET_PROJECT_ID,
          temporalBundle: mockTemporalBundle(),
        }),
      ).rejects.toThrow(new RegExp(`status=${expectedStatus}`));
    },
  );

  test("peer ownership requires fresh server poller", async () => {
    // getTemporalWorkerRole returns WorkerRole "client"; target-project.ts
    // derives ownership "peer" from that role.
    mocks.getRegisteredTemporalWorkerQueues.mockReturnValue([EXPECTED_QUEUE]);
    mocks.getTemporalWorkerDiagnostics.mockReturnValue(liveLocalDiagnostics());
    mocks.getTemporalWorkerRole.mockReturnValue("client");
    mocks.probeTaskQueuePollers.mockResolvedValue({
      status: "fresh",
      lastAccessMs: 12_000,
    });

    const result = await ensureTargetMutationQueueReady({
      projectId: TARGET_PROJECT_ID,
      temporalBundle: mockTemporalBundle(),
    });

    expect(result.status).toBe("serviceable");
    expect(result.confidence).toBe("server");
    expect(result.evidence.localOwnership).toBe("peer");
  });

  test("peer ownership without fresh server poller is not_serviceable", async () => {
    mocks.getRegisteredTemporalWorkerQueues.mockReturnValue([EXPECTED_QUEUE]);
    mocks.getTemporalWorkerDiagnostics.mockReturnValue(liveLocalDiagnostics());
    mocks.getTemporalWorkerRole.mockReturnValue("client");
    mocks.probeTaskQueuePollers.mockResolvedValue({
      status: "stale",
      lastAccessMs: 120_000,
    });

    await expect(
      ensureTargetMutationQueueReady({
        projectId: TARGET_PROJECT_ID,
        temporalBundle: mockTemporalBundle(),
      }),
    ).rejects.toThrow(/status=not_serviceable/);
  });
});

describe("acceptance matrix — fireSignalAndRefresh (AC1-AC7)", () => {
  test("AC1: orphaned prior-session queue returns ADV_SESSION_NOT_READY and does not fire the signal", async () => {
    const handle = createMockHandle("advance-proj-sess-prior");
    handle.query.mockRejectedValue(
      new Error("no poller is currently polling this task queue"),
    );
    const store = createMockStore();

    let caught: unknown;
    try {
      await fireSignalAndRefresh(
        handle as never,
        store as any,
        "chg-orphan",
        { name: "taskAdded" },
        { taskId: "tk-orphan" },
      );
    } catch (e) {
      caught = e;
    }

    expectAdvSessionNotReady(caught);
    expect(handle.signal).not.toHaveBeenCalled();
    expect(store.changes.refresh).not.toHaveBeenCalled();
    expect(handle.query).toHaveBeenCalledWith(changeStateQuery);
  });

  test("AC2: fresh own-queue mutation executes normally regardless of unrelated orphaned queue", async () => {
    const ownHandle = createMockHandle("advance-proj-sess-new");
    ownHandle.query.mockResolvedValue({ status: "active" });
    const ownStore = createMockStore();

    await fireSignalAndRefresh(
      ownHandle as never,
      ownStore as any,
      "chg-own",
      { name: "taskAdded" },
      { taskId: "tk-own" },
    );

    expect(ownHandle.signal).toHaveBeenCalledTimes(1);
    expect(ownStore.changes.refresh).toHaveBeenCalledWith("chg-own");

    const orphanHandle = createMockHandle("advance-proj-sess-prior");
    orphanHandle.query.mockRejectedValue(
      new Error("no poller is currently polling this task queue"),
    );
    const orphanStore = createMockStore();

    let caught: unknown;
    try {
      await fireSignalAndRefresh(
        orphanHandle as never,
        orphanStore as any,
        "chg-orphan",
        { name: "taskAdded" },
        { taskId: "tk-orphan" },
      );
    } catch (e) {
      caught = e;
    }

    expectAdvSessionNotReady(caught);
    expect(orphanHandle.signal).not.toHaveBeenCalled();
  });

  test("AC3: retry hint references the ~10s adoption heartbeat cadence", async () => {
    const handle = createMockHandle();
    handle.query.mockRejectedValue(new Error("query rejected"));
    const store = createMockStore();

    let caught: unknown;
    try {
      await fireSignalAndRefresh(
        handle as never,
        store as any,
        "chg",
        { name: "taskAdded" },
        { taskId: "tk" },
      );
    } catch (e) {
      caught = e;
    }

    expectAdvSessionNotReady(caught);
    expect((caught as { retryHint: string }).retryHint).toBe(
      ADV_SESSION_READINESS_RETRY_HINT,
    );
  });

  test("AC4: mid-session worker death re-rejects after initial readiness", async () => {
    const queue = "advance-proj-sess-mid-death";
    const handle = createMockHandle(queue);
    handle.query
      .mockResolvedValueOnce({ status: "active" })
      .mockRejectedValueOnce(
        new Error("no poller is currently polling this task queue"),
      );
    const store = createMockStore();

    // First mutation succeeds and caches readiness.
    await fireSignalAndRefresh(
      handle as never,
      store as any,
      "chg",
      { name: "taskAdded" },
      { taskId: "tk1" },
    );
    expect(handle.signal).toHaveBeenCalledTimes(1);

    // Worker dies; the readiness cache is invalidated.
    markStale(queue);

    let caught: unknown;
    try {
      await fireSignalAndRefresh(
        handle as never,
        store as any,
        "chg",
        { name: "taskAdded" },
        { taskId: "tk2" },
      );
    } catch (e) {
      caught = e;
    }

    expectAdvSessionNotReady(caught);
    expect(handle.signal).toHaveBeenCalledTimes(1);
    expect(handle.query).toHaveBeenCalledTimes(2);
  });

  test("AC5: ADV_SESSION_READINESS_BYPASS=1 skips the barrier and fires the signal", async () => {
    const previousBypass = process.env.ADV_SESSION_READINESS_BYPASS;
    process.env.ADV_SESSION_READINESS_BYPASS = "1";
    try {
      const handle = createMockHandle();
      handle.query.mockRejectedValue(
        new Error("no poller is currently polling this task queue"),
      );
      const store = createMockStore();

      await fireSignalAndRefresh(
        handle as never,
        store as any,
        "chg-bypass",
        { name: "taskAdded" },
        { taskId: "tk-bypass" },
      );

      expect(handle.query).not.toHaveBeenCalled();
      expect(handle.signal).toHaveBeenCalledTimes(1);
      expect(store.changes.refresh).toHaveBeenCalledWith("chg-bypass");
    } finally {
      if (previousBypass === undefined) {
        delete process.env.ADV_SESSION_READINESS_BYPASS;
      } else {
        process.env.ADV_SESSION_READINESS_BYPASS = previousBypass;
      }
    }
  });

  test("AC6 + C1: startChangeWorkflow does not await readiness probe", async () => {
    const handle = createMockHandle();
    mocks.ensureChangeWorkflowStarted.mockResolvedValue(handle);

    await startChangeWorkflow(
      {
        workflow: {
          start: vi.fn(),
          getHandle: vi.fn(() => handle),
        },
      },
      {
        projectId: "0000abc000000000000000000000000000000000",
        changeId: "chg-def",
        title: "Test Change",
        initializedAt: new Date().toISOString(),
      },
    );

    expect(handle.query).not.toHaveBeenCalled();
    expect(handle.describe).not.toHaveBeenCalled();
  });

  test("AC7: cross-project target_path readiness behavior unchanged (covered by ensureTargetMutationQueueReady parity)", async () => {
    mocks.getRegisteredTemporalWorkerQueues.mockReturnValue([EXPECTED_QUEUE]);
    mocks.getTemporalWorkerDiagnostics.mockReturnValue(liveLocalDiagnostics());
    mocks.getTemporalWorkerAliveness.mockReturnValue(true);
    mocks.getTemporalWorkerRole.mockReturnValue("host");

    const result = await ensureTargetMutationQueueReady({
      projectId: TARGET_PROJECT_ID,
      temporalBundle: mockTemporalBundle(),
    });

    expect(result.status).toBe("serviceable");
    expect(result.confidence).toBe("local");
    expect(result.evidence.localRegistered).toBe(true);
    expect(result.evidence.localWorkerAlive).toBe(true);
  });
});

describe("DDC budget compliance", () => {
  test("DDC1: probe budget is capped at 2s and fail-closed on timeout", async () => {
    vi.useFakeTimers();
    try {
      const queryProbe: QueryProbe = vi.fn(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve({ ok: true }), 10_000),
          ),
      );

      const pending = evaluateTargetReadiness({
        targetQueue: "advance-ddc1",
        hasWorkflow: true,
        queryProbe,
        probeBudgetMs: 100_000,
        nowMs: () => 0,
      });

      await vi.advanceTimersByTimeAsync(2_001);
      const result = await pending;

      expect(result.ready).toBe(false);
      expect(result.blockers).toContain("ADV_SESSION_NOT_READY");
      expect(queryProbe).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  test("DDC2: cache TTL is capped at 10s", async () => {
    const queryProbe: QueryProbe = vi.fn().mockResolvedValue({ ok: true });
    const now = { value: 0 };

    await evaluateTargetReadiness({
      targetQueue: "advance-ddc2",
      hasWorkflow: true,
      queryProbe,
      nowMs: () => now.value,
      cacheTtlMs: 100_000,
    });
    expect(queryProbe).toHaveBeenCalledTimes(1);

    now.value = 10_001;
    await evaluateTargetReadiness({
      targetQueue: "advance-ddc2",
      hasWorkflow: true,
      queryProbe,
      nowMs: () => now.value,
      cacheTtlMs: 100_000,
    });
    expect(queryProbe).toHaveBeenCalledTimes(2);
  });

  test("DDC3: cache-hit overhead is under 1ms", async () => {
    const queryProbe: QueryProbe = vi.fn().mockResolvedValue({ ok: true });
    const input = {
      targetQueue: "advance-ddc3",
      hasWorkflow: true,
      queryProbe,
      nowMs: () => 0,
      cacheTtlMs: 10_000,
    };

    await evaluateTargetReadiness(input);
    const start = performance.now();
    const cached = await evaluateTargetReadiness(input);
    const elapsed = performance.now() - start;

    expect(cached.ready).toBe(true);
    expect(queryProbe).toHaveBeenCalledTimes(1);
    expect(elapsed).toBeLessThan(1);
  });

  test("DDC4: ensureTargetMutationQueueReady uses 60s DescribeTaskQueue threshold", async () => {
    mocks.ensureProjectTemporalQueue.mockRejectedValue(
      new Error("no local worker"),
    );
    mocks.probeTaskQueuePollers.mockResolvedValue({
      status: "fresh",
      lastAccessMs: 59_000,
    });

    await ensureTargetMutationQueueReady({
      projectId: TARGET_PROJECT_ID,
      temporalBundle: mockTemporalBundle(),
    });

    expect(mocks.probeTaskQueuePollers).toHaveBeenCalledWith(
      expect.objectContaining({
        taskQueue: EXPECTED_QUEUE,
        freshPollerMs: 60_000,
      }),
    );
  });

  test("DDC5: orphan adopter marks target queue stale within a single heartbeat tick on worker death", async () => {
    const projectId = "0000000000000000000000000000000000000000";
    const queue = `advance-${projectId}-sess_death`;
    const { OrphanQueueAdopter } = await import("./orphan-queue-adopter");

    const worker = {
      queues: [] as readonly string[],
      registerQueue: vi.fn(async () => {
        throw new Error("worker is shutting down");
      }),
    };

    const owner = createMockOwnerFromClient({
      client: {
        workflow: {
          list: async function* () {
            yield {
              workflowId: `adv/change/${projectId}/${queue}/wf1`,
              taskQueue: queue,
              startTime: new Date("2026-07-22T00:00:00Z"),
              status: { name: "RUNNING" },
            };
          },
        },
      },
    });

    const adopter = new OrphanQueueAdopter({
      owner,
      projectId,
      worker,
      tickTimeoutMs: 20,
      now: () => 1000,
    });

    const queryProbe: QueryProbe = vi
      .fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, error: "worker_dead" });

    await evaluateTargetReadiness({
      targetQueue: queue,
      hasWorkflow: true,
      queryProbe,
      nowMs: () => 0,
      cacheTtlMs: 10_000,
    });
    expect(queryProbe).toHaveBeenCalledTimes(1);

    await adopter.adoptNextOrphan();

    expect(worker.registerQueue).toHaveBeenCalled();

    const result = await evaluateTargetReadiness({
      targetQueue: queue,
      hasWorkflow: true,
      queryProbe,
      nowMs: () => 1,
      cacheTtlMs: 10_000,
    });

    expect(result.ready).toBe(false);
    expect(result.blockers).toContain("ADV_SESSION_NOT_READY");
    expect(queryProbe).toHaveBeenCalledTimes(2);
  });
});

describe("rq-isolSessionTaskQueue05 regression — worker startup non-blocking (C1/AC6)", () => {
  test("worker startup path does not await or register readiness probes", async () => {
    const handle = createMockHandle();
    mocks.ensureChangeWorkflowStarted.mockResolvedValue(handle);

    await startChangeWorkflow(
      {
        workflow: {
          start: vi.fn(),
          getHandle: vi.fn(() => handle),
        },
      },
      {
        projectId: "0000abc000000000000000000000000000000000",
        changeId: "chg-def",
        title: "Test Change",
        initializedAt: new Date().toISOString(),
      },
    );

    expect(handle.query).not.toHaveBeenCalled();
    expect(handle.describe).not.toHaveBeenCalled();
  });
});
