/**
 * OrphanQueueAdopter coordinator — state machine that adopts one orphan
 * session task queue per heartbeat tick (rq-isolSessionTaskQueue05 / D2-D8).
 *
 * Behaviors: single-flight (scanInFlight + finally-release), per-tick hard
 * timeout, capped retries (3) with cooldown (5 min), FIFO selection after
 * the helper's client-side sort, shutdown-error suppression, process-local
 * idempotency via worker.queues.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { OrphanListClient } from "./list-orphan-session-queues";
import {
  evaluateTargetReadiness,
  resetReadinessState,
  type QueryProbe,
} from "./session-readiness";

// Late-import so the RED run fails on the missing module before GREEN creates it.
async function loadAdopter() {
  return await import("./orphan-queue-adopter");
}

/** Build a mock worker exposing registerQueue + a mutable queues set. */
function mockWorker(initialQueues: string[] = []) {
  const queues = new Set(initialQueues);
  let registerImpl: (queue: string) => Promise<void> = async (queue) => {
    queues.add(queue);
  };
  const registerQueue = vi.fn((queue: string) => registerImpl(queue));
  return {
    queues,
    registerQueue,
    setRegisterImpl(fn: (queue: string) => Promise<void>) {
      registerImpl = fn;
    },
    /** Match the readonly-string[] accessor shape the adopter reads. */
    get polledQueues() {
      return [...queues];
    },
  };
}

/** Build a mock Visibility client returning the given orphan queue set. */
function mockClient(
  orphans: Array<{ queue: string; oldestStartTime: Date }>,
): OrphanListClient {
  const items = orphans.flatMap((o) => [
    {
      workflowId: `adv/change/P/${o.queue}/wf1`,
      taskQueue: o.queue,
      startTime: o.oldestStartTime,
      status: { name: "RUNNING" },
    },
  ]);
  return {
    workflow: {
      list: async function* () {
        for (const item of items) yield item;
      },
    },
  };
}

const Q = (n: number, t: string) => `advance-P-sess_${n}${t}`;
const T0 = new Date("2026-07-22T00:00:00Z");

beforeEach(() => {
  resetReadinessState();
});

describe("OrphanQueueAdopter", () => {
  it("adopts the first (oldest) orphan via registerQueue", async () => {
    const worker = mockWorker();
    const client = mockClient([
      { queue: Q(2, ""), oldestStartTime: new Date(T0.getTime() + 2000) },
      { queue: Q(1, ""), oldestStartTime: T0 }, // oldest → FIFO first
    ]);
    const { OrphanQueueAdopter } = await loadAdopter();
    const adopter = new OrphanQueueAdopter({
      client,
      projectId: "P",
      worker: {
        registerQueue: worker.registerQueue,
        queues: worker.polledQueues,
      },
    });
    await adopter.adoptNextOrphan();
    expect(worker.registerQueue).toHaveBeenCalledWith(Q(1, ""));
    expect(worker.registerQueue).toHaveBeenCalledTimes(1);
  });

  it("skips a queue already in worker.queues (idempotent)", async () => {
    const worker = mockWorker([Q(1, "")]);
    const client = mockClient([
      { queue: Q(1, ""), oldestStartTime: T0 }, // already polled
      { queue: Q(2, ""), oldestStartTime: new Date(T0.getTime() + 1000) },
    ]);
    const { OrphanQueueAdopter } = await loadAdopter();
    const adopter = new OrphanQueueAdopter({
      client,
      projectId: "P",
      worker: {
        registerQueue: worker.registerQueue,
        queues: worker.polledQueues,
      },
    });
    await adopter.adoptNextOrphan();
    expect(worker.registerQueue).toHaveBeenCalledWith(Q(2, ""));
    expect(worker.registerQueue).toHaveBeenCalledTimes(1);
  });

  it("does nothing when there are no orphans", async () => {
    const worker = mockWorker();
    const client = mockClient([]);
    const { OrphanQueueAdopter } = await loadAdopter();
    const adopter = new OrphanQueueAdopter({
      client,
      projectId: "P",
      worker: {
        registerQueue: worker.registerQueue,
        queues: worker.polledQueues,
      },
    });
    await adopter.adoptNextOrphan();
    expect(worker.registerQueue).not.toHaveBeenCalled();
  });

  it("enforces single-flight: concurrent ticks do not overlap", async () => {
    const worker = mockWorker();
    const client = mockClient([{ queue: Q(1, ""), oldestStartTime: T0 }]);
    let resolveRegister!: () => void;
    worker.setRegisterImpl(
      () => new Promise<void>((resolve) => (resolveRegister = resolve)),
    );
    const { OrphanQueueAdopter } = await loadAdopter();
    const adopter = new OrphanQueueAdopter({
      client,
      projectId: "P",
      worker: {
        registerQueue: worker.registerQueue,
        queues: worker.polledQueues,
      },
    });
    const tick1 = adopter.adoptNextOrphan();
    const tick2 = adopter.adoptNextOrphan(); // overlaps while tick1 in flight
    // tick1 awaits the Visibility list before calling registerQueue; flush
    // microtasks until register is actually invoked, then release it.
    await vi.waitFor(() => expect(worker.registerQueue).toHaveBeenCalled());
    resolveRegister();
    await Promise.all([tick1, tick2]);
    // tick2 saw scanInFlight and skipped; only one register attempt.
    expect(worker.registerQueue).toHaveBeenCalledTimes(1);
  });

  it("releases single-flight in finally even when registerQueue times out", async () => {
    const worker = mockWorker();
    const client = mockClient([{ queue: Q(1, ""), oldestStartTime: T0 }]);
    // registerQueue never resolves → tick timeout must fire + release.
    worker.setRegisterImpl(() => new Promise<void>(() => {}));
    const { OrphanQueueAdopter } = await loadAdopter();
    const adopter = new OrphanQueueAdopter({
      client,
      projectId: "P",
      worker: {
        registerQueue: worker.registerQueue,
        queues: worker.polledQueues,
      },
      tickTimeoutMs: 20,
      now: (() => {
        let t = 1000;
        return () => (t += 0);
      })(),
    });
    await adopter.adoptNextOrphan();
    // After the timed-out tick, a fresh tick must be able to run (scanInFlight released).
    expect(adopter.getState().scanInFlight).toBe(false);
  });

  it("applies cooldown after 3 failed attempts and re-attempts after cooldown expires", async () => {
    const worker = mockWorker();
    const client = mockClient([{ queue: Q(1, ""), oldestStartTime: T0 }]);
    worker.setRegisterImpl(async () => {
      throw new Error("run-error: worker failed");
    });
    let now = 10_000;
    const { OrphanQueueAdopter } = await loadAdopter();
    const adopter = new OrphanQueueAdopter({
      client,
      projectId: "P",
      worker: {
        registerQueue: worker.registerQueue,
        queues: worker.polledQueues,
      },
      maxAttempts: 3,
      cooldownMs: 5_000,
      now: () => now,
    });
    // 3 failing ticks → 3 attempts.
    await adopter.adoptNextOrphan();
    await adopter.adoptNextOrphan();
    await adopter.adoptNextOrphan();
    expect(worker.registerQueue).toHaveBeenCalledTimes(3);
    // After 3rd failure, queue is in cooldown.
    const state = adopter.getState().perQueueState.get(Q(1, ""));
    expect(state?.cooldownUntil).toBe(now + 5_000);
    // While in cooldown, the queue is skipped (no 4th attempt).
    await adopter.adoptNextOrphan();
    expect(worker.registerQueue).toHaveBeenCalledTimes(3);
    // After cooldown expires, re-attempt is allowed.
    now += 5_001;
    await adopter.adoptNextOrphan();
    expect(worker.registerQueue).toHaveBeenCalledTimes(4);
  });

  it("resets attempt state on a successful adoption", async () => {
    const worker = mockWorker();
    const client = mockClient([{ queue: Q(1, ""), oldestStartTime: T0 }]);
    const { OrphanQueueAdopter } = await loadAdopter();
    const adopter = new OrphanQueueAdopter({
      client,
      projectId: "P",
      worker: {
        registerQueue: worker.registerQueue,
        queues: worker.polledQueues,
      },
      maxAttempts: 3,
      cooldownMs: 5_000,
      now: () => 1000,
    });
    // One failed attempt, then succeed.
    worker.setRegisterImpl(async () => {
      throw new Error("run-error");
    });
    await adopter.adoptNextOrphan();
    expect(adopter.getState().perQueueState.get(Q(1, ""))?.attemptCount).toBe(
      1,
    );
    worker.setRegisterImpl(async () => {
      /* success */
    });
    await adopter.adoptNextOrphan();
    // Success clears attempt state for the queue.
    const state = adopter.getState().perQueueState.get(Q(1, ""));
    expect(state?.attemptCount).toBe(0);
    expect(state?.cooldownUntil).toBe(0);
  });

  it("suppresses shutdown-class errors without bumping attempts", async () => {
    const worker = mockWorker();
    const client = mockClient([{ queue: Q(1, ""), oldestStartTime: T0 }]);
    worker.setRegisterImpl(async () => {
      throw new Error("worker is shutting down");
    });
    const { OrphanQueueAdopter } = await loadAdopter();
    const adopter = new OrphanQueueAdopter({
      client,
      projectId: "P",
      worker: {
        registerQueue: worker.registerQueue,
        queues: worker.polledQueues,
      },
      now: () => 1000,
    });
    await expect(adopter.adoptNextOrphan()).resolves.toBeUndefined();
    // Shutdown error is suppressed — not counted as a retry attempt.
    expect(
      adopter.getState().perQueueState.get(Q(1, ""))?.attemptCount ?? 0,
    ).toBe(0);
  });

  it("marks the target queue stale when the worker dies during adoption (AC4)", async () => {
    const worker = mockWorker();
    const client = mockClient([{ queue: Q(1, ""), oldestStartTime: T0 }]);
    worker.setRegisterImpl(async () => {
      throw new Error("worker is shutting down");
    });
    const { OrphanQueueAdopter } = await loadAdopter();
    const adopter = new OrphanQueueAdopter({
      client,
      projectId: "P",
      worker: {
        registerQueue: worker.registerQueue,
        queues: worker.polledQueues,
      },
      now: () => 1000,
    });

    // Establish initial readiness for the target queue.
    const queryProbe: QueryProbe = vi
      .fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, error: "worker_dead" });
    await evaluateTargetReadiness({
      targetQueue: Q(1, ""),
      hasWorkflow: true,
      queryProbe,
      nowMs: () => 0,
      cacheTtlMs: 10_000,
    });
    expect(queryProbe).toHaveBeenCalledTimes(1);

    // Worker dies during the adoption heartbeat tick.
    await adopter.adoptNextOrphan();

    // The next mutation re-probes and fails because the worker is dead.
    const result = await evaluateTargetReadiness({
      targetQueue: Q(1, ""),
      hasWorkflow: true,
      queryProbe,
      nowMs: () => 1,
      cacheTtlMs: 10_000,
    });
    expect(result.ready).toBe(false);
    expect(result.blockers).toContain("ADV_SESSION_NOT_READY");
    expect(queryProbe).toHaveBeenCalledTimes(2);
  });

  it("marks the target queue stale when registerQueue times out (worker unresponsive)", async () => {
    const worker = mockWorker();
    const client = mockClient([{ queue: Q(1, ""), oldestStartTime: T0 }]);
    // Never resolves → tick timeout wins.
    worker.setRegisterImpl(() => new Promise<void>(() => {}));
    const { OrphanQueueAdopter } = await loadAdopter();
    const adopter = new OrphanQueueAdopter({
      client,
      projectId: "P",
      worker: {
        registerQueue: worker.registerQueue,
        queues: worker.polledQueues,
      },
      tickTimeoutMs: 20,
      now: () => 1000,
    });

    const queryProbe: QueryProbe = vi
      .fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, error: "worker_unresponsive" });
    await evaluateTargetReadiness({
      targetQueue: Q(1, ""),
      hasWorkflow: true,
      queryProbe,
      nowMs: () => 0,
      cacheTtlMs: 10_000,
    });

    await adopter.adoptNextOrphan();

    const result = await evaluateTargetReadiness({
      targetQueue: Q(1, ""),
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

describe("isOrphanQueueAdoptionEnabled — ADV_ORPHAN_QUEUE_ADOPTION kill-switch", () => {
  // Adoption is always-on in production (rq-isolSessionTaskQueue05). The env
  // flag is an emergency kill-switch: default ON; only "0" disables. This
  // preserves the shipped unconditional behavior while giving operators an
  // escape hatch (design DDC8, reconciled to kill-switch-default-on because
  // the bundle already deploys adoption always-on).
  it("is enabled by default when the flag is unset", async () => {
    const { isOrphanQueueAdoptionEnabled } = await loadAdopter();
    expect(isOrphanQueueAdoptionEnabled({})).toBe(true);
  });

  it("is enabled when explicitly set to 1", async () => {
    const { isOrphanQueueAdoptionEnabled, ADV_ORPHAN_QUEUE_ADOPTION_ENV } =
      await loadAdopter();
    expect(
      isOrphanQueueAdoptionEnabled({
        [ADV_ORPHAN_QUEUE_ADOPTION_ENV]: "1",
      }),
    ).toBe(true);
  });

  it("is DISABLED when set to 0 (kill-switch)", async () => {
    const { isOrphanQueueAdoptionEnabled, ADV_ORPHAN_QUEUE_ADOPTION_ENV } =
      await loadAdopter();
    expect(
      isOrphanQueueAdoptionEnabled({
        [ADV_ORPHAN_QUEUE_ADOPTION_ENV]: "0",
      }),
    ).toBe(false);
  });

  it("is enabled on empty string and unrecognized values (only 0 disables)", async () => {
    const { isOrphanQueueAdoptionEnabled, ADV_ORPHAN_QUEUE_ADOPTION_ENV } =
      await loadAdopter();
    expect(
      isOrphanQueueAdoptionEnabled({ [ADV_ORPHAN_QUEUE_ADOPTION_ENV]: "" }),
    ).toBe(true);
    expect(
      isOrphanQueueAdoptionEnabled({
        [ADV_ORPHAN_QUEUE_ADOPTION_ENV]: "no",
      }),
    ).toBe(true);
    expect(
      isOrphanQueueAdoptionEnabled({
        [ADV_ORPHAN_QUEUE_ADOPTION_ENV]: "false",
      }),
    ).toBe(true);
  });

  it("reads process.env when no env argument is supplied", async () => {
    const { isOrphanQueueAdoptionEnabled } = await loadAdopter();
    // process.env.ADV_ORPHAN_QUEUE_ADOPTION is unset in the test process.
    expect(isOrphanQueueAdoptionEnabled()).toBe(true);
  });
});

describe("review remediation — failure accounting + late-settlement safety", () => {
  // Covers acceptance-review findings: timeout-path failure counting, cooldown
  // via timeout, lastError capture (AC6 operability), and the late-rejection
  // unhandledRejection fix (correctness-1).

  function makeAdopter(
    worker: ReturnType<typeof mockWorker>,
    opts: {
      tickTimeoutMs?: number;
      maxAttempts?: number;
      now?: () => number;
    } = {},
  ) {
    // Late-import to exercise the real module.
    return loadAdopter().then(({ OrphanQueueAdopter }) => {
      const client = mockClient([{ queue: Q(1, ""), oldestStartTime: T0 }]);
      return new OrphanQueueAdopter({
        client,
        projectId: "P",
        worker: {
          registerQueue: worker.registerQueue,
          queues: worker.polledQueues,
        },
        tickTimeoutMs: opts.tickTimeoutMs ?? 20,
        maxAttempts: opts.maxAttempts ?? 3,
        now: opts.now ?? (() => 1000),
      });
    });
  }

  it("a fast registerQueue rejection bumps attemptCount and captures lastError (AC6)", async () => {
    const worker = mockWorker();
    worker.setRegisterImpl(async () => {
      throw new Error("worker run-error: stale bundle");
    });
    const adopter = await makeAdopter(worker);
    await adopter.adoptNextOrphan();
    const entry = adopter.getDiagnostics().trackedQueues[0];
    expect(entry?.queue).toBe(Q(1, ""));
    expect(entry?.attemptCount).toBe(1);
    expect(entry?.lastError).toBe("worker run-error: stale bundle");
  });

  it("a timed-out registerQueue bumps attemptCount (timeout-path coverage)", async () => {
    const worker = mockWorker();
    // Never resolves → tick timeout wins.
    worker.setRegisterImpl(() => new Promise<void>(() => undefined));
    const adopter = await makeAdopter(worker);
    await adopter.adoptNextOrphan();
    const entry = adopter.getState().perQueueState.get(Q(1, ""));
    expect(entry?.attemptCount).toBe(1);
    expect(entry?.cooldownUntil).toBe(0);
  });

  it("three timed-out ticks enter cooldown (cooldown-via-timeout)", async () => {
    const worker = mockWorker();
    worker.setRegisterImpl(() => new Promise<void>(() => undefined));
    const adopter = await makeAdopter(worker);
    await adopter.adoptNextOrphan();
    await adopter.adoptNextOrphan();
    await adopter.adoptNextOrphan();
    const entry = adopter.getState().perQueueState.get(Q(1, ""));
    expect(entry?.attemptCount).toBe(3);
    expect(entry?.cooldownUntil).toBeGreaterThan(0);
  });

  it("does not produce an unhandled rejection when registerQueue rejects after the tick timeout (correctness-1)", async () => {
    const worker = mockWorker();
    // Reject AFTER the tick timeout (20ms) wins the race.
    worker.setRegisterImpl(
      () =>
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error("late register failure")), 80),
        ),
    );
    const adopter = await makeAdopter(worker);

    const rejections: unknown[] = [];
    const handler = (reason: unknown) => rejections.push(reason);
    process.on("unhandledRejection", handler);
    try {
      await adopter.adoptNextOrphan();
      // Wait well past the late-rejection delay so any stray rejection surfaces.
      await new Promise((resolve) => setTimeout(resolve, 200));
    } finally {
      process.off("unhandledRejection", handler);
    }
    expect(rejections).toEqual([]);
  });
});
