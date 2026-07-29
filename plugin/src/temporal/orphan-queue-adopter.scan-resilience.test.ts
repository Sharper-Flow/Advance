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
import type { OrphanListClient } from "./list-orphan-session-queues";
import { listOrphanSessionQueues } from "./list-orphan-session-queues";
import {
  ORPHAN_MAX_CONSECUTIVE_SCAN_FAILURES,
  ORPHAN_STUCK_SCAN_MS,
  OrphanQueueAdopter,
  evaluateOrphanAdoptionHealth,
  type OrphanQueueAdoptionDiagnostics,
} from "./orphan-queue-adopter";
import { resetReadinessState } from "./session-readiness";

const PROJECT = "P";
const Q1 = "advance-P-sess_aaa";
const Q2 = "advance-P-sess_bbb";
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
    workflowId: `adv/change/${PROJECT}/${queue}/wf1`,
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
  client: OrphanListClient,
  worker: ReturnType<typeof mockWorker>,
) {
  return new OrphanQueueAdopter({
    client,
    projectId: PROJECT,
    worker: {
      registerQueue: worker.registerQueue,
      queues: worker.polledQueues,
    },
    tickTimeoutMs: TICK_MS,
  });
}

beforeEach(() => {
  resetReadinessState();
});

describe("OrphanQueueAdopter — Visibility scan resilience (#327)", () => {
  it("releases single-flight when the Visibility stream never yields", async () => {
    const worker = mockWorker();
    const adopter = adopterFor({ workflow: { list: hangingIterable } }, worker);

    await adopter.adoptNextOrphan();

    // The precise regression: the latch must not survive a hung enumeration.
    expect(adopter.getState().scanInFlight).toBe(false);
    expect(worker.registerQueue).not.toHaveBeenCalled();
  });

  it("counts the stall instead of failing silently", async () => {
    const worker = mockWorker();
    const adopter = adopterFor({ workflow: { list: hangingIterable } }, worker);

    await adopter.adoptNextOrphan();

    const diag = adopter.getDiagnostics();
    expect(diag.scanFailureCount).toBe(1);
    expect(diag.consecutiveScanFailures).toBe(1);
    expect(diag.lastScanError).toMatch(/timed out/i);
  });

  it("keeps advancing the failure counter across repeated hung ticks", async () => {
    const worker = mockWorker();
    const adopter = adopterFor({ workflow: { list: hangingIterable } }, worker);

    await adopter.adoptNextOrphan();
    await adopter.adoptNextOrphan();
    await adopter.adoptNextOrphan();

    // #327's signature was a counter frozen at 0 forever. It must advance.
    expect(adopter.getDiagnostics().scanFailureCount).toBe(3);
    expect(adopter.getState().scanInFlight).toBe(false);
  });

  it("aborts the in-flight Visibility RPC so streams are not leaked per tick", async () => {
    const worker = mockWorker();
    let captured: AbortSignal | undefined;
    const client: OrphanListClient = {
      workflow: { list: hangingIterable },
      connection: {
        withAbortSignal: async (signal, fn) => {
          captured = signal;
          return await fn();
        },
      },
    };

    await adopterFor(client, worker).adoptNextOrphan();

    expect(captured).toBeDefined();
    // ListOptions carries no abortSignal/deadline (SDK v1.16), so the
    // connection scope is the only teardown path available.
    expect(captured?.aborted).toBe(true);
  });

  it("records a scan failure when Visibility rejects with context canceled", async () => {
    const worker = mockWorker();
    const client: OrphanListClient = {
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

    const adopter = adopterFor(client, worker);
    await adopter.adoptNextOrphan();

    expect(adopter.getState().scanInFlight).toBe(false);
    expect(adopter.getDiagnostics().scanFailureCount).toBe(1);
    expect(adopter.getDiagnostics().lastScanError).toMatch(/context canceled/i);
  });

  it("recovers and adopts once enumeration succeeds again", async () => {
    const worker = mockWorker();
    let healthy = false;
    const client: OrphanListClient = {
      workflow: {
        list: () =>
          healthy
            ? (async function* () {
                yield record(Q1);
              })()
            : hangingIterable(),
      },
    };

    const adopter = adopterFor(client, worker);
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
    const client: OrphanListClient = {
      workflow: {
        list: () =>
          (async function* () {
            yield record(Q1);
          })(),
      },
    };

    const adopter = adopterFor(client, worker);
    await adopter.adoptNextOrphan();

    const diag = adopter.getDiagnostics();
    // Suppression must remain non-counting for retries (unchanged contract)...
    expect(diag.trackedQueues).toHaveLength(0);
    // ...but must no longer be indistinguishable from "nothing was attempted".
    expect(diag.suppressedShutdownCount).toBe(1);
  });
});

describe("listOrphanSessionQueues — bounded enumeration", () => {
  it("stops at the deadline and releases the stream via iterator return()", async () => {
    let now = 1_000;
    const onReturn = vi.fn();
    const items = [record(Q1), record(Q2, new Date(T0.getTime() + 5_000))];
    let index = 0;

    const client: OrphanListClient = {
      workflow: {
        list: () =>
          ({
            [Symbol.asyncIterator]() {
              return {
                next: async () => {
                  if (index >= items.length) {
                    return { value: undefined, done: true };
                  }
                  const value = items[index++];
                  // Blow the deadline only from the SECOND record onward, so
                  // the first is processed and the bound is observed between
                  // records (not before the first one is ever seen).
                  if (index > 1) now += 500;
                  return { value, done: false };
                },
                return: async () => {
                  onReturn();
                  return { value: undefined, done: true };
                },
              };
            },
          }) as AsyncIterable<VisRecord>,
      },
    };

    const result = await listOrphanSessionQueues(client, PROJECT, [], {
      deadlineMs: 100,
      now: () => now,
    });

    // Partial results are still adoptable; the caller re-enumerates next tick.
    expect(result.map((r) => r.queue)).toEqual([Q1]);
    // `break` (not `return`) is what triggers this — it is the stream teardown.
    expect(onReturn).toHaveBeenCalledTimes(1);
  });

  it("stops immediately when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    const result = await listOrphanSessionQueues(
      {
        workflow: {
          list: () =>
            (async function* () {
              yield record(Q1);
              yield record(Q2);
            })(),
        },
      },
      PROJECT,
      [],
      { signal: controller.signal },
    );

    expect(result).toEqual([]);
  });

  it("routes enumeration through connection.withAbortSignal when available", async () => {
    const withAbortSignal = vi.fn(
      async <T>(_s: AbortSignal, fn: () => Promise<T>) => await fn(),
    );
    const client: OrphanListClient = {
      workflow: {
        list: () =>
          (async function* () {
            yield record(Q1);
          })(),
      },
      connection: { withAbortSignal },
    };

    const result = await listOrphanSessionQueues(client, PROJECT, [], {
      signal: new AbortController().signal,
    });

    expect(withAbortSignal).toHaveBeenCalledTimes(1);
    expect(result.map((r) => r.queue)).toEqual([Q1]);
  });

  it("skips the connection scope when no signal is supplied (back-compat)", async () => {
    const withAbortSignal = vi.fn(
      async <T>(_s: AbortSignal, fn: () => Promise<T>) => await fn(),
    );
    const client: OrphanListClient = {
      workflow: {
        list: () =>
          (async function* () {
            yield record(Q1);
          })(),
      },
      connection: { withAbortSignal },
    };

    const result = await listOrphanSessionQueues(client, PROJECT, []);

    expect(withAbortSignal).not.toHaveBeenCalled();
    expect(result.map((r) => r.queue)).toEqual([Q1]);
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
