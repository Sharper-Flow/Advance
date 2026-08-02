/**
 * Regression coverage for the stalled orphan-queue adoption blackout (#327).
 *
 * Reported fingerprint: ~17 orphan queues, `scanInFlight: true`, and ALL
 * `attemptCount: 0` — permanently, while every liveness probe reported healthy
 * and the last Visibility RPC showed `1 CANCELLED: context canceled`.
 *
 * Mechanism: `listOrphanSessionQueues` was awaited OUTSIDE the tick's only
 * try/catch and had no bound. A Visibility stream that never yielded suspended
 * the tick forever, so:
 *   - the `finally` that releases single-flight never ran;
 *   - the register race (whose timeout is DOWNSTREAM of that await) never began;
 *   - `recordFailure` never ran, so the attempt counter never advanced.
 *
 * These tests pin the bound, the cancellation, and the observability.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { listOrphanSessionQueues } from "./list-orphan-session-queues";
import {
  ORPHAN_MAX_CONSECUTIVE_SCAN_FAILURES,
  ORPHAN_STUCK_SCAN_MS,
  OrphanQueueAdopter,
  evaluateOrphanAdoptionHealth,
  type OrphanQueueAdoptionDiagnostics,
} from "./orphan-queue-adopter";
import { resetReadinessState } from "./session-readiness";
import {
  createMockOwner,
  createMockOwnerFromClient,
} from "./__tests__/mock-owner";
import type { TemporalOperations } from "./operations";

const PROJECT_ID = "0000000000000000000000000000000000000000";
const Q1 = `advance-${PROJECT_ID}-sess_aaa`;
const Q2 = `advance-${PROJECT_ID}-sess_bbb`;
const T0 = new Date("2026-07-22T00:00:00Z");

/** Per-tick bound used across these tests; small enough to keep them fast. */
const TICK_MS = 25;

type VisRecord = {
  workflowId: string;
  taskQueue: string;
  startTime: Date;
  status: { name: string };
};

function record(queue: string, startTime = T0): VisRecord {
  return {
    workflowId: `adv/change/${PROJECT_ID}/${queue}/wf1`,
    taskQueue: queue,
    startTime,
    status: { name: "RUNNING" },
  };
}

/** An async iterable whose first `next()` never settles. */
function hangingIterable(): AsyncIterable<VisRecord> {
  return {
    [Symbol.asyncIterator]() {
      return {
        next: () => new Promise<IteratorResult<VisRecord>>(() => {}),
      };
    },
  } as AsyncIterable<VisRecord>;
}

function mockWorker(initialQueues: string[] = []) {
  const queues = new Set(initialQueues);
  let registerImpl: (queue: string) => Promise<void> = async (queue) => {
    queues.add(queue);
  };
  const registerQueue = vi.fn((queue: string) => registerImpl(queue));
  return {
    registerQueue,
    setRegisterImpl(fn: (queue: string) => Promise<void>) {
      registerImpl = fn;
    },
    get polledQueues() {
      return [...queues];
    },
  };
}

function adopterFor(
  owner: TemporalOperations,
  worker: ReturnType<typeof mockWorker>,
) {
  return new OrphanQueueAdopter({
    owner,
    projectId: PROJECT_ID,
    worker: {
      registerQueue: worker.registerQueue,
      queues: worker.polledQueues,
    },
    tickTimeoutMs: TICK_MS,
  });
}

function adopterForClient(
  client: unknown,
  worker: ReturnType<typeof mockWorker>,
) {
  return adopterFor(createMockOwnerFromClient(client), worker);
}

beforeEach(() => {
  resetReadinessState();
});

describe("OrphanQueueAdopter — Visibility scan resilience (#327)", () => {
  it("releases single-flight when the Visibility stream never yields", async () => {
    const worker = mockWorker();
    const adopter = adopterForClient(
      { workflow: { list: hangingIterable } },
      worker,
    );

    await adopter.adoptNextOrphan();

    // The precise regression: the latch must not survive a hung enumeration.
    expect(adopter.getState().scanInFlight).toBe(false);
    expect(worker.registerQueue).not.toHaveBeenCalled();
  });

  it("counts the stall instead of failing silently", async () => {
    const worker = mockWorker();
    const adopter = adopterForClient(
      { workflow: { list: hangingIterable } },
      worker,
    );

    await adopter.adoptNextOrphan();

    const diag = adopter.getDiagnostics();
    expect(diag.scanFailureCount).toBe(1);
    expect(diag.consecutiveScanFailures).toBe(1);
    expect(diag.lastScanError).toMatch(/timed out/i);
  });

  it("keeps advancing the failure counter across repeated hung ticks", async () => {
    const worker = mockWorker();
    const adopter = adopterForClient(
      { workflow: { list: hangingIterable } },
      worker,
    );

    await adopter.adoptNextOrphan();
    await adopter.adoptNextOrphan();
    await adopter.adoptNextOrphan();

    // #327's signature was a counter frozen at 0 forever. It must advance.
    expect(adopter.getDiagnostics().scanFailureCount).toBe(3);
    expect(adopter.getState().scanInFlight).toBe(false);
  });

  it("times out hung enumeration without leaking the scan latch", async () => {
    const worker = mockWorker();
    const owner = createMockOwner({
      list: vi.fn(async function* () {
        // Never yield; the tick timeout must release the latch.
        await new Promise<void>(() => {});
        yield record(Q1);
      }),
    });

    await adopterFor(owner, worker).adoptNextOrphan();

    expect(owner.list).toHaveBeenCalledTimes(1);
    expect(worker.registerQueue).not.toHaveBeenCalled();
  });

  it("records a scan failure when Visibility rejects with context canceled", async () => {
    const worker = mockWorker();
    const client = {
      workflow: {
        list: () =>
          ({
            [Symbol.asyncIterator]() {
              return {
                next: () =>
                  Promise.reject(new Error("1 CANCELLED: context canceled")),
              };
            },
          }) as AsyncIterable<VisRecord>,
      },
    };

    const adopter = adopterForClient(client, worker);
    await adopter.adoptNextOrphan();

    expect(adopter.getState().scanInFlight).toBe(false);
    expect(adopter.getDiagnostics().scanFailureCount).toBe(1);
    expect(adopter.getDiagnostics().lastScanError).toMatch(/context canceled/i);
  });

  it("recovers and adopts once enumeration succeeds again", async () => {
    const worker = mockWorker();
    let healthy = false;
    const client = {
      workflow: {
        list: () =>
          healthy
            ? (async function* () {
                yield record(Q1);
              })()
            : hangingIterable(),
      },
    };

    const adopter = adopterForClient(client, worker);
    await adopter.adoptNextOrphan();
    expect(adopter.getDiagnostics().consecutiveScanFailures).toBe(1);

    healthy = true;
    await adopter.adoptNextOrphan();

    expect(worker.registerQueue).toHaveBeenCalledWith(Q1);
    const diag = adopter.getDiagnostics();
    expect(diag.consecutiveScanFailures).toBe(0);
    expect(diag.lastScanError).toBeUndefined();
    // Historical total is retained for operator forensics.
    expect(diag.scanFailureCount).toBe(1);
  });

  it("counts suppressed shutdown refusals rather than dropping them", async () => {
    const worker = mockWorker();
    worker.setRegisterImpl(async () => {
      throw new Error('Cannot register queue "x" — worker is shutting down');
    });
    const client = {
      workflow: {
        list: () =>
          (async function* () {
            yield record(Q1);
          })(),
      },
    };

    const adopter = adopterForClient(client, worker);
    await adopter.adoptNextOrphan();

    const diag = adopter.getDiagnostics();
    // Suppression must remain non-counting for retries (unchanged contract)...
    expect(diag.trackedQueues).toHaveLength(0);
    // ...but must no longer be indistinguishable from "nothing was attempted".
    expect(diag.suppressedShutdownCount).toBe(1);
  });
});

describe("listOrphanSessionQueues — bounded enumeration", () => {
  it("stops at the deadline and returns partial results", async () => {
    let calls = 0;
    const owner = createMockOwner({
      list: async () => ({
        kind: "complete",
        value: [record(Q1), record(Q2, new Date(T0.getTime() + 5_000))],
        truncated: false,
      }),
    });

    const outcome = await listOrphanSessionQueues(owner, PROJECT_ID, [], {
      deadlineMs: 100,
      now: () => {
        // startedAt and the first loop check are at 1000ms; the second check
        // advances past the 100ms deadline so only the first record is kept.
        calls++;
        return calls <= 2 ? 1_000 : 1_500;
      },
    });

    // Partial results are still adoptable; the caller re-enumerates next tick.
    expect(outcome.kind).toBe("complete");
    expect(
      (outcome as { kind: "complete"; value: { queue: string }[] }).value.map(
        (r) => r.queue,
      ),
    ).toEqual([Q1]);
  });

  it("stops immediately when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    const result = await listOrphanSessionQueues(
      createMockOwnerFromClient({
        workflow: {
          list: () =>
            (async function* () {
              yield record(Q1);
              yield record(Q2);
            })(),
        },
      }),
      PROJECT_ID,
      [],
      { signal: controller.signal },
    );

    expect(result.kind).toBe("complete");
    expect(
      (result as { kind: "complete"; value: { queue: string }[] }).value,
    ).toEqual([]);
  });

  it("routes enumeration through the TemporalOperations owner list API", async () => {
    const list = vi.fn(async () => ({
      kind: "complete",
      value: [record(Q1)],
      truncated: false,
    }));
    const owner = createMockOwner({
      list,
    });

    const outcome = await listOrphanSessionQueues(owner, PROJECT_ID, [], {
      signal: new AbortController().signal,
    });

    expect(list).toHaveBeenCalledTimes(1);
    expect(outcome.kind).toBe("complete");
    expect(
      (outcome as { kind: "complete"; value: { queue: string }[] }).value.map(
        (r) => r.queue,
      ),
    ).toEqual([Q1]);
  });

  it("breaks iteration when the signal is aborted mid-enumeration", async () => {
    const controller = new AbortController();
    function* recordsWithAbort() {
      yield record(Q1);
      controller.abort();
      yield record(Q2);
    }
    const list = vi.fn(async () => ({
      kind: "complete",
      value: { [Symbol.iterator]: recordsWithAbort } as unknown as VisRecord[],
      truncated: false,
    }));
    const owner = createMockOwner({ list });

    const outcome = await listOrphanSessionQueues(owner, PROJECT_ID, [], {
      signal: controller.signal,
    });

    expect(outcome.kind).toBe("complete");
    expect(
      (outcome as { kind: "complete"; value: { queue: string }[] }).value.map(
        (r) => r.queue,
      ),
    ).toEqual([Q1]);
  });
});

describe("evaluateOrphanAdoptionHealth", () => {
  const NOW = 1_000_000;

  function diag(
    over: Partial<OrphanQueueAdoptionDiagnostics> = {},
  ): OrphanQueueAdoptionDiagnostics {
    return {
      scanInFlight: false,
      scanFailureCount: 0,
      consecutiveScanFailures: 0,
      lastScanStartedAt: NOW,
      lastScanDurationMs: 5,
      suppressedShutdownCount: 0,
      trackedQueues: [],
      ...over,
    };
  }

  it("reports ok for a healthy snapshot", () => {
    expect(evaluateOrphanAdoptionHealth(diag(), NOW)).toEqual({ state: "ok" });
  });

  it("reports ok while a scan is in flight but still within bounds", () => {
    const health = evaluateOrphanAdoptionHealth(
      diag({ scanInFlight: true, lastScanStartedAt: NOW - 1_000 }),
      NOW,
    );
    expect(health.state).toBe("ok");
  });

  it("reports stuck_scan once the latch is held past the bound", () => {
    const health = evaluateOrphanAdoptionHealth(
      diag({
        scanInFlight: true,
        lastScanStartedAt: NOW - ORPHAN_STUCK_SCAN_MS - 1,
      }),
      NOW,
    );
    expect(health).toMatchObject({ state: "stuck_scan" });
    if (health.state === "stuck_scan") {
      expect(health.stuckForMs).toBeGreaterThanOrEqual(ORPHAN_STUCK_SCAN_MS);
    }
  });

  it("does not report stuck_scan when no scan has ever started", () => {
    const health = evaluateOrphanAdoptionHealth(
      diag({ scanInFlight: true, lastScanStartedAt: 0 }),
      NOW,
    );
    expect(health.state).toBe("ok");
  });

  it("reports failing_scans at the consecutive-failure threshold", () => {
    const health = evaluateOrphanAdoptionHealth(
      diag({
        consecutiveScanFailures: ORPHAN_MAX_CONSECUTIVE_SCAN_FAILURES,
        lastScanError: "1 CANCELLED: context canceled",
      }),
      NOW,
    );
    expect(health).toMatchObject({
      state: "failing_scans",
      lastScanError: "1 CANCELLED: context canceled",
    });
  });

  it("stays ok below the consecutive-failure threshold", () => {
    const health = evaluateOrphanAdoptionHealth(
      diag({
        consecutiveScanFailures: ORPHAN_MAX_CONSECUTIVE_SCAN_FAILURES - 1,
      }),
      NOW,
    );
    expect(health.state).toBe("ok");
  });

  it("prefers stuck_scan over failing_scans when both hold", () => {
    const health = evaluateOrphanAdoptionHealth(
      diag({
        scanInFlight: true,
        lastScanStartedAt: NOW - ORPHAN_STUCK_SCAN_MS - 1,
        consecutiveScanFailures: 99,
      }),
      NOW,
    );
    // A held latch is the more actionable signal: nothing else can progress.
    expect(health.state).toBe("stuck_scan");
  });

  it("honours injected thresholds", () => {
    const health = evaluateOrphanAdoptionHealth(
      diag({ consecutiveScanFailures: 1 }),
      NOW,
      { maxConsecutiveScanFailures: 1 },
    );
    expect(health.state).toBe("failing_scans");
  });
});

describe("OrphanQueueAdopter — batched adoption", () => {
  const many = Array.from(
    { length: 12 },
    (_, i) => `advance-${PROJECT_ID}-sess_q${i}`,
  );

  function ownerWith(queues: string[]) {
    return createMockOwnerFromClient({
      workflow: {
        list: () =>
          (async function* () {
            for (let i = 0; i < queues.length; i++) {
              yield record(queues[i], new Date(T0.getTime() + i * 1000));
            }
          })(),
      },
    });
  }

  it("adopts up to maxAdoptionsPerTick in a single tick", async () => {
    const worker = mockWorker();
    const adopter = new OrphanQueueAdopter({
      owner: ownerWith(many),
      projectId: PROJECT_ID,
      worker: {
        registerQueue: worker.registerQueue,
        queues: worker.polledQueues,
      },
      tickTimeoutMs: TICK_MS,
      maxAdoptionsPerTick: 4,
    });

    await adopter.adoptNextOrphan();

    expect(worker.registerQueue).toHaveBeenCalledTimes(4);
  });

  it("preserves FIFO order across the batch", async () => {
    const worker = mockWorker();
    const adopter = new OrphanQueueAdopter({
      owner: ownerWith(many),
      projectId: PROJECT_ID,
      worker: {
        registerQueue: worker.registerQueue,
        queues: worker.polledQueues,
      },
      tickTimeoutMs: TICK_MS,
      maxAdoptionsPerTick: 3,
    });

    await adopter.adoptNextOrphan();

    expect(worker.registerQueue.mock.calls.map((c) => c[0])).toEqual(
      many.slice(0, 3),
    );
  });

  it("stops the batch early when the worker is shutting down", async () => {
    const worker = mockWorker();
    worker.setRegisterImpl(async () => {
      throw new Error("worker is shutting down");
    });
    const adopter = new OrphanQueueAdopter({
      owner: ownerWith(many),
      projectId: PROJECT_ID,
      worker: {
        registerQueue: worker.registerQueue,
        queues: worker.polledQueues,
      },
      tickTimeoutMs: TICK_MS,
      maxAdoptionsPerTick: 5,
    });

    await adopter.adoptNextOrphan();

    // Every subsequent register would fail identically; hammering the shutting-
    // down worker 5x per tick is pure noise.
    expect(worker.registerQueue).toHaveBeenCalledTimes(1);
    expect(adopter.getDiagnostics().suppressedShutdownCount).toBe(1);
  });

  it("stops the batch once the per-tick budget is exhausted", async () => {
    let clock = 0;
    const worker = mockWorker();
    worker.setRegisterImpl(async () => {
      clock += 1000;
    });
    const adopter = new OrphanQueueAdopter({
      owner: ownerWith(many),
      projectId: PROJECT_ID,
      worker: {
        registerQueue: worker.registerQueue,
        queues: worker.polledQueues,
      },
      tickTimeoutMs: 2_500,
      maxAdoptionsPerTick: 10,
      now: () => clock,
    });

    await adopter.adoptNextOrphan();

    // 1000ms per register against a 2500ms budget: 3 land, then the batch
    // yields so the tick cannot overrun the driver interval.
    expect(worker.registerQueue).toHaveBeenCalledTimes(3);
  });

  it("skips queues still in cooldown when batching", async () => {
    const worker = mockWorker();
    let failing = true;
    worker.setRegisterImpl(async (queue) => {
      if (failing && queue === many[0]) throw new Error("boom");
    });
    const adopter = new OrphanQueueAdopter({
      owner: ownerWith(many.slice(0, 3)),
      projectId: PROJECT_ID,
      worker: {
        registerQueue: worker.registerQueue,
        queues: worker.polledQueues,
      },
      tickTimeoutMs: TICK_MS,
      maxAdoptionsPerTick: 3,
      maxAttempts: 1,
      cooldownMs: 60_000,
    });

    await adopter.adoptNextOrphan();
    const cooled = adopter
      .getDiagnostics()
      .trackedQueues.find((q) => q.queue === many[0]);
    expect(cooled?.inCooldown).toBe(true);

    failing = false;
    worker.registerQueue.mockClear();
    await adopter.adoptNextOrphan();

    // The cooled queue is excluded from the next batch.
    expect(worker.registerQueue.mock.calls.map((c) => c[0])).not.toContain(
      many[0],
    );
  });
});
