import { describe, expect, test } from "vitest";
import type { AsyncIterable } from "node:stream";
import { listOrphanSessionQueues } from "./list-orphan-session-queues";
import { ADVANCE_TEMPORAL_TASK_QUEUE_PREFIX } from "./contracts";

/** Build a mock Visibility entry. */
function entry(
  workflowId: string,
  taskQueue: string,
  startTime: Date,
  statusName = "RUNNING",
) {
  return { workflowId, taskQueue, startTime, status: { name: statusName } };
}

/** Wrap an array as an async iterable. */
function makeList(
  pages: ReturnType<typeof entry>[][],
): (opts: { query: string }) => AsyncIterable<ReturnType<typeof entry>> {
  return async function* () {
    for (const page of pages) for (const e of page) yield e;
  };
}

const PID = "pid-abc";
const PROJ_Q = `${ADVANCE_TEMPORAL_TASK_QUEUE_PREFIX}-${PID}`;
const SESS_DEAD_1 = `${ADVANCE_TEMPORAL_TASK_QUEUE_PREFIX}-${PID}-sess_deadOne`;
const SESS_DEAD_2 = `${ADVANCE_TEMPORAL_TASK_QUEUE_PREFIX}-${PID}-sess_deadTwo`;
const SESS_LIVE = `${ADVANCE_TEMPORAL_TASK_QUEUE_PREFIX}-${PID}-sess_live`;

describe("listOrphanSessionQueues", () => {
  test("discovers session-scoped queues not already polled, sorted by oldest startTime", async () => {
    const t0 = new Date("2026-07-20T01:00:00Z");
    const t1 = new Date("2026-07-21T02:00:00Z");
    const client = {
      workflow: {
        list: makeList([
          [
            entry("adv/change/pid-abc/changeA", SESS_DEAD_1, t0),
            entry("adv/change/pid-abc/changeB", SESS_DEAD_2, t1),
            entry("adv/change/pid-abc/changeC", PROJ_Q, t0),
            entry("adv/change/pid-abc/changeD", SESS_LIVE, t0),
          ],
        ]),
      },
    };

    const result = await listOrphanSessionQueues(client, PID, [
      SESS_LIVE,
      PROJ_Q,
    ]);

    // Dead queues discovered; project + live excluded; sorted oldest-first
    expect(result).toHaveLength(2);
    expect(result[0].queue).toBe(SESS_DEAD_1);
    expect(result[0].oldestStartTime).toBe(t0);
    expect(result[1].queue).toBe(SESS_DEAD_2);
    expect(result[1].oldestStartTime).toBe(t1);
  });

  test("handles unordered Visibility pages with deterministic client-side sort", async () => {
    const tOld = new Date("2026-07-19T00:00:00Z");
    const tNew = new Date("2026-07-22T00:00:00Z");
    const client = {
      workflow: {
        // Page 2 has the older entry — Visibility may return unordered
        list: makeList([
          [entry("adv/change/pid-abc/newer", SESS_DEAD_2, tNew)],
          [entry("adv/change/pid-abc/older", SESS_DEAD_1, tOld)],
        ]),
      },
    };

    const result = await listOrphanSessionQueues(client, PID, [PROJ_Q]);

    // Sorted by oldest startTime regardless of page order
    expect(result[0].queue).toBe(SESS_DEAD_1);
    expect(result[1].queue).toBe(SESS_DEAD_2);
  });

  test("ignores epic workflows (different prefix)", async () => {
    const t = new Date();
    const client = {
      workflow: {
        list: makeList([
          [
            entry("adv/change/pid-abc/changeA", SESS_DEAD_1, t),
            entry("adv/epic/pid-abc/someEpic", SESS_DEAD_2, t),
          ],
        ]),
      },
    };

    const result = await listOrphanSessionQueues(client, PID, [PROJ_Q]);
    expect(result).toEqual([{ queue: SESS_DEAD_1, oldestStartTime: t }]);
  });

  test("skips non-RUNNING workflows", async () => {
    const t = new Date();
    const client = {
      workflow: {
        list: makeList([
          [
            entry("adv/change/pid-abc/running", SESS_DEAD_1, t, "RUNNING"),
            entry("adv/change/pid-abc/completed", SESS_DEAD_2, t, "COMPLETED"),
          ],
        ]),
      },
    };

    const result = await listOrphanSessionQueues(client, PID, [PROJ_Q]);
    expect(result).toEqual([{ queue: SESS_DEAD_1, oldestStartTime: t }]);
  });

  test("returns empty when all queues already polled", async () => {
    const t = new Date();
    const client = {
      workflow: {
        list: makeList([
          [
            entry("adv/change/pid-abc/a", PROJ_Q, t),
            entry("adv/change/pid-abc/b", SESS_LIVE, t),
          ],
        ]),
      },
    };

    const result = await listOrphanSessionQueues(client, PID, [
      PROJ_Q,
      SESS_LIVE,
    ]);
    expect(result).toEqual([]);
  });

  test("groups multiple workflows on same queue (keeps oldest startTime)", async () => {
    const tOld = new Date("2026-07-19T00:00:00Z");
    const tNew = new Date("2026-07-20T00:00:00Z");
    const client = {
      workflow: {
        list: makeList([
          [
            entry("adv/change/pid-abc/newer", SESS_DEAD_1, tNew),
            entry("adv/change/pid-abc/older", SESS_DEAD_1, tOld),
          ],
        ]),
      },
    };

    const result = await listOrphanSessionQueues(client, PID, [PROJ_Q]);
    expect(result).toHaveLength(1);
    expect(result[0].oldestStartTime).toBe(tOld);
  });
});
