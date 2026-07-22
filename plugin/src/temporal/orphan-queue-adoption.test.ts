import { describe, expect, test, vi } from "vitest";
import type { AsyncIterable } from "node:stream";
import {
  discoverOrphanedSessionQueues,
  adoptOrphanedSessionQueues,
} from "./orphan-queue-adoption";
import { ADVANCE_TEMPORAL_TASK_QUEUE_PREFIX } from "./contracts";

/** Build a mock workflow list result entry. */
function wf(workflowId: string, taskQueue: string, status = "RUNNING") {
  return {
    workflowId,
    taskQueue,
    status: { code: 1, name: status },
  };
}

/** Wrap an array as an async iterable (mimics client.workflow.list). */
function makeList(
  entries: ReturnType<typeof wf>[],
): (opts: { query: string }) => AsyncIterable<ReturnType<typeof wf>> {
  return async function* () {
    for (const e of entries) yield e;
  };
}

const PROJECT_ID = "pid-abc";
const PROJECT_QUEUE = `${ADVANCE_TEMPORAL_TASK_QUEUE_PREFIX}-${PROJECT_ID}`;
const SESS_DEAD_1 = `${ADVANCE_TEMPORAL_TASK_QUEUE_PREFIX}-${PROJECT_ID}-sess_deadOne`;
const SESS_DEAD_2 = `${ADVANCE_TEMPORAL_TASK_QUEUE_PREFIX}-${PROJECT_ID}-sess_deadTwo`;
const SESS_LIVE = `${ADVANCE_TEMPORAL_TASK_QUEUE_PREFIX}-${PROJECT_ID}-sess_live`;

describe("discoverOrphanedSessionQueues", () => {
  test("discovers session-scoped queues not already polled (rq-orphanSessionAdoption01)", async () => {
    const client = {
      workflow: {
        list: makeList([
          wf("adv/change/pid-abc/changeA", SESS_DEAD_1),
          wf("adv/change/pid-abc/changeB", SESS_DEAD_2),
          wf("adv/change/pid-abc/changeC", PROJECT_QUEUE),
          wf("adv/change/pid-abc/changeD", SESS_LIVE),
        ]),
      },
    };

    // Worker already polls the live session queue + project queue
    const registered = [SESS_LIVE, PROJECT_QUEUE];

    const orphans = await discoverOrphanedSessionQueues(
      client,
      PROJECT_ID,
      registered,
    );

    // Dead session queues should be discovered; project + live should not
    expect(orphans).toContain(SESS_DEAD_1);
    expect(orphans).toContain(SESS_DEAD_2);
    expect(orphans).not.toContain(PROJECT_QUEUE);
    expect(orphans).not.toContain(SESS_LIVE);
    expect(orphans).toHaveLength(2);
  });

  test("ignores non-change workflows (epic workflows use different prefix)", async () => {
    const client = {
      workflow: {
        list: makeList([
          wf("adv/change/pid-abc/changeA", SESS_DEAD_1),
          wf("adv/epic/pid-abc/someEpic", SESS_DEAD_2),
        ]),
      },
    };

    const orphans = await discoverOrphanedSessionQueues(client, PROJECT_ID, [
      PROJECT_QUEUE,
    ]);

    // Only the change workflow's queue should be discovered
    expect(orphans).toEqual([SESS_DEAD_1]);
  });

  test("skips completed/terminated workflows (only RUNNING need pollers)", async () => {
    const client = {
      workflow: {
        list: makeList([
          wf("adv/change/pid-abc/running", SESS_DEAD_1, "RUNNING"),
          wf("adv/change/pid-abc/completed", SESS_DEAD_2, "COMPLETED"),
          wf("adv/change/pid-abc/terminated", SESS_DEAD_2, "TERMINATED"),
        ]),
      },
    };

    const orphans = await discoverOrphanedSessionQueues(client, PROJECT_ID, [
      PROJECT_QUEUE,
    ]);

    expect(orphans).toEqual([SESS_DEAD_1]);
  });

  test("returns empty when all queues are already registered", async () => {
    const client = {
      workflow: {
        list: makeList([
          wf("adv/change/pid-abc/changeA", PROJECT_QUEUE),
          wf("adv/change/pid-abc/changeB", SESS_LIVE),
        ]),
      },
    };

    const orphans = await discoverOrphanedSessionQueues(client, PROJECT_ID, [
      PROJECT_QUEUE,
      SESS_LIVE,
    ]);

    expect(orphans).toEqual([]);
  });
});

describe("adoptOrphanedSessionQueues", () => {
  test("registers each discovered queue via worker.registerQueue", async () => {
    const registerQueue = vi.fn().mockResolvedValue(undefined);
    const worker = { registerQueue };

    const result = await adoptOrphanedSessionQueues(worker, [
      SESS_DEAD_1,
      SESS_DEAD_2,
    ]);

    expect(registerQueue).toHaveBeenCalledWith(SESS_DEAD_1);
    expect(registerQueue).toHaveBeenCalledWith(SESS_DEAD_2);
    expect(registerQueue).toHaveBeenCalledTimes(2);
    expect(result.adopted).toEqual([SESS_DEAD_1, SESS_DEAD_2]);
    expect(result.failed).toEqual([]);
  });

  test("records failed adoptions without throwing", async () => {
    const registerQueue = vi.fn((q: string) => {
      if (q === SESS_DEAD_2) {
        return Promise.reject(new Error("connection refused"));
      }
      return Promise.resolve();
    });
    const worker = { registerQueue };

    const result = await adoptOrphanedSessionQueues(worker, [
      SESS_DEAD_1,
      SESS_DEAD_2,
    ]);

    expect(result.adopted).toEqual([SESS_DEAD_1]);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].queue).toBe(SESS_DEAD_2);
    expect(result.failed[0].error).toBe("connection refused");
  });

  test("handles empty input gracefully", async () => {
    const registerQueue = vi.fn();
    const worker = { registerQueue };

    const result = await adoptOrphanedSessionQueues(worker, []);

    expect(registerQueue).not.toHaveBeenCalled();
    expect(result.adopted).toEqual([]);
    expect(result.failed).toEqual([]);
  });
});
