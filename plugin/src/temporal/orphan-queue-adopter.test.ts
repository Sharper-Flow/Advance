import { describe, expect, test, vi } from "vitest";
import { OrphanQueueAdopter } from "./orphan-queue-adopter";
import type { OrphanListClient } from "./list-orphan-session-queues";
import { ADVANCE_TEMPORAL_TASK_QUEUE_PREFIX } from "./contracts";

const PID = "pid-test";
const PROJ_Q = `${ADVANCE_TEMPORAL_TASK_QUEUE_PREFIX}-${PID}`;
const SESS_A = `${ADVANCE_TEMPORAL_TASK_QUEUE_PREFIX}-${PID}-sess_aaaa`;
const SESS_B = `${ADVANCE_TEMPORAL_TASK_QUEUE_PREFIX}-${PID}-sess_bbbb`;

/** Minimal mock client whose list() yields the given entries. */
function mockClient(
  entries: Array<{ workflowId: string; taskQueue: string; startTime: Date }>,
): OrphanListClient {
  return {
    workflow: {
      async *list(_opts: { query: string }) {
        for (const e of entries) {
          yield { ...e, status: { name: "RUNNING" } };
        }
      },
    },
  };
}

/** Mock worker with controllable registerQueue + tracked queues set. */
function mockWorker(initialQueues: string[] = [PROJ_Q]) {
  const queues = new Set(initialQueues);
  const registerQueue = vi.fn(async (q: string) => {
    queues.add(q);
  });
  return {
    registerQueue,
    get queues() {
      return [...queues];
    },
  };
}

describe("OrphanQueueAdopter", () => {
  test("adopts oldest orphan queue on first tick", async () => {
    const t0 = new Date("2026-07-19T00:00:00Z");
    const t1 = new Date("2026-07-20T00:00:00Z");
    const client = mockClient([
      {
        workflowId: "adv/change/pid-test/older",
        taskQueue: SESS_A,
        startTime: t0,
      },
      {
        workflowId: "adv/change/pid-test/newer",
        taskQueue: SESS_B,
        startTime: t1,
      },
    ]);
    const worker = mockWorker();
    const adopter = new OrphanQueueAdopter({ client, projectId: PID, worker });

    await adopter.adoptNextOrphan();

    // Oldest orphan (SESS_A) should be adopted first
    expect(worker.registerQueue).toHaveBeenCalledWith(SESS_A);
    expect(worker.registerQueue).not.toHaveBeenCalledWith(SESS_B);
    expect(adopter.getDiagnostics().adoptedQueues).toContain(SESS_A);
  });

  test("single-flight: concurrent calls do not overlap", async () => {
    const client = mockClient([
      {
        workflowId: "adv/change/pid-test/a",
        taskQueue: SESS_A,
        startTime: new Date(),
      },
    ]);
    const worker = mockWorker();
    const adopter = new OrphanQueueAdopter({ client, projectId: PID, worker });

    // Interleave two calls
    const p1 = adopter.adoptNextOrphan();
    const p2 = adopter.adoptNextOrphan();
    await Promise.all([p1, p2]);

    // registerQueue called at most once (second call was single-flighted)
    expect(worker.registerQueue).toHaveBeenCalledTimes(1);
  });

  test("finally-release: scanInFlight released even on timeout", async () => {
    const client = mockClient([
      {
        workflowId: "adv/change/pid-test/a",
        taskQueue: SESS_A,
        startTime: new Date(),
      },
    ]);
    const worker = mockWorker();
    // registerQueue never resolves → triggers timeout
    worker.registerQueue.mockImplementation(() => new Promise(() => {}));

    const adopter = new OrphanQueueAdopter({
      client,
      projectId: PID,
      worker,
      timeoutMs: 50, // fast timeout for test
    });

    await adopter.adoptNextOrphan();

    // scanInFlight should be false (released by finally)
    expect(adopter.getDiagnostics().scanInFlight).toBe(false);
  });

  test("cooldown after 3 failed attempts", async () => {
    const client = mockClient([
      {
        workflowId: "adv/change/pid-test/a",
        taskQueue: SESS_A,
        startTime: new Date(),
      },
    ]);
    const worker = mockWorker();
    worker.registerQueue.mockRejectedValue(new Error("run-error"));

    const adopter = new OrphanQueueAdopter({
      client,
      projectId: PID,
      worker,
      timeoutMs: 5000,
      maxAttempts: 3,
      cooldownMs: 300000,
    });

    // 3 attempts
    await adopter.adoptNextOrphan();
    await adopter.adoptNextOrphan();
    await adopter.adoptNextOrphan();

    // After 3rd attempt, queue should be in cooldown
    const diag = adopter.getDiagnostics();
    expect(diag.cooldownQueues).toHaveLength(1);
    expect(diag.cooldownQueues[0].queue).toBe(SESS_A);
    expect(diag.cooldownQueues[0].attemptCount).toBe(3);
  });

  test("cooldown-excluded queue is not selected", async () => {
    const t0 = new Date("2026-07-19T00:00:00Z");
    const t1 = new Date("2026-07-20T00:00:00Z");
    const client = mockClient([
      {
        workflowId: "adv/change/pid-test/inCooldown",
        taskQueue: SESS_A,
        startTime: t0,
      },
      {
        workflowId: "adv/change/pid-test/available",
        taskQueue: SESS_B,
        startTime: t1,
      },
    ]);
    const worker = mockWorker();

    const adopter = new OrphanQueueAdopter({
      client,
      projectId: PID,
      worker,
      maxAttempts: 3,
      cooldownMs: 300000,
    });

    // Force SESS_A into cooldown (3 failed attempts)
    worker.registerQueue.mockRejectedValueOnce(new Error("err"));
    worker.registerQueue.mockRejectedValueOnce(new Error("err"));
    worker.registerQueue.mockRejectedValueOnce(new Error("err"));
    await adopter.adoptNextOrphan();
    await adopter.adoptNextOrphan();
    await adopter.adoptNextOrphan();

    // Now registerQueue succeeds for SESS_B
    worker.registerQueue.mockResolvedValue(undefined);

    // Next tick: SESS_A is in cooldown, SESS_B should be selected
    await adopter.adoptNextOrphan();
    const lastCall =
      worker.registerQueue.mock.calls[
        worker.registerQueue.mock.calls.length - 1
      ];
    expect(lastCall[0]).toBe(SESS_B);
  });

  test("no-op when no orphans found", async () => {
    const client = mockClient([
      {
        workflowId: "adv/change/pid-test/a",
        taskQueue: PROJ_Q,
        startTime: new Date(),
      },
    ]);
    const worker = mockWorker([PROJ_Q]);
    const adopter = new OrphanQueueAdopter({ client, projectId: PID, worker });

    await adopter.adoptNextOrphan();

    expect(worker.registerQueue).not.toHaveBeenCalled();
    expect(adopter.getDiagnostics().adoptedQueues).toEqual([]);
  });

  test("shutdown error suppressed silently", async () => {
    const client = mockClient([
      {
        workflowId: "adv/change/pid-test/a",
        taskQueue: SESS_A,
        startTime: new Date(),
      },
    ]);
    const worker = mockWorker();
    worker.registerQueue.mockRejectedValue(
      new Error("Cannot register queue — worker is shutting down"),
    );

    const adopter = new OrphanQueueAdopter({ client, projectId: PID, worker });

    // Should not throw
    await expect(adopter.adoptNextOrphan()).resolves.toBeUndefined();
  });
});
