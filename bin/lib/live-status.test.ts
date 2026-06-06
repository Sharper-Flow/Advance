import { describe, expect, test } from "bun:test";

import {
  buildLiveStatusPayload,
  listLiveChangeStates,
  QUERY_TIMEOUT_MS,
} from "./live-status";

function fakeClient(states: Record<string, unknown>, listError?: Error) {
  return {
    workflow: {
      list: () => {
        if (listError) throw listError;
        async function* iter() {
          for (const id of Object.keys(states)) {
            yield { workflowId: `adv/change/project123/${id}` };
          }
        }
        return iter();
      },
      getHandle: (workflowId: string) => ({
        query: async (queryName: string) => {
          expect(queryName).toBe("adv.change.getState");
          const id = workflowId.slice("adv/change/project123/".length);
          const value = states[id];
          if (value instanceof Error) throw value;
          return value;
        },
      }),
    },
  };
}

const liveState = {
  id: "liveChange",
  title: "Live change",
  status: "draft",
  createdAt: "2026-06-05T10:00:00.000Z",
  tasks: [{ id: "t1", title: "Task", status: "done" }],
  gates: {
    proposal: { status: "done", completed_at: "2026-06-05T10:01:00.000Z" },
  },
  wisdom: [],
};

describe("live status reader", () => {
  test("lists and queries live Temporal workflow states by string query name", async () => {
    const states = await listLiveChangeStates(
      fakeClient({ liveChange: liveState }),
      {
        projectId: "project123",
      },
    );

    expect(states.map((state) => state.id)).toEqual(["liveChange"]);
    expect(states[0]?.created_at).toBe("2026-06-05T10:00:00.000Z");
  });

  test("does not include disk-only active changes in the live payload", async () => {
    const payload = buildLiveStatusPayload(
      [
        {
          id: "liveChange",
          title: "Live change",
          status: "draft",
          created_at: "2026-06-05T10:00:00.000Z",
          tasks: [],
          gates: {},
        },
      ],
      {
        projectId: "project123",
        archivedCount: 2,
        closedCount: 1,
        now: new Date("2026-06-05T10:05:00.000Z"),
      },
    );

    expect(payload.source).toBe("temporal");
    expect(payload.live).toBe(true);
    expect(payload.stale).toBe(false);
    expect(payload.changes.map((change) => change.id)).toEqual(["liveChange"]);
    expect(payload.changes.map((change) => change.id)).not.toContain(
      "diskOnly",
    );
    expect(payload.counts).toEqual({ active: 1, archived: 2, closed: 1 });
  });

  test("fails closed when visibility listing fails", async () => {
    await expect(
      listLiveChangeStates(
        fakeClient({}, new Error("visibility unavailable")),
        {
          projectId: "project123",
        },
      ),
    ).rejects.toThrow("visibility unavailable");
  });

  test("fails closed when any enumerated workflow query fails", async () => {
    await expect(
      listLiveChangeStates(fakeClient({ broken: new Error("query timeout") }), {
        projectId: "project123",
      }),
    ).rejects.toThrow("query timeout");
  });

  test("uses bounded query timeout constant", () => {
    expect(QUERY_TIMEOUT_MS).toBe(5_000);
  });
});
