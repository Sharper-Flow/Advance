import { describe, expect, test } from "bun:test";

import {
  buildLiveStatusPayload,
  buildLiveStatusPayloadFromSummaries,
  buildSummaryFromSearchAttributes,
  listLiveChangeStates,
  QUERY_TIMEOUT_MS,
  summariesFromVisibility,
} from "./live-status";

function fakeVisibilityClient(
  executions: Array<{
    id: string;
    attrs: Record<string, unknown[]>;
    executionStatus?: "Running" | "Completed";
  }>,
  listError?: Error,
) {
  const queries: string[] = [];
  return {
    queries,
    workflow: {
      list: (opts: { query: string }) => {
        if (listError) throw listError;
        queries.push(opts.query);
        async function* iter() {
          const requiresRunning = /ExecutionStatus\s*=\s*"Running"/.test(
            opts.query,
          );
          for (const exec of executions) {
            if (
              requiresRunning &&
              exec.executionStatus !== undefined &&
              exec.executionStatus !== "Running"
            ) {
              continue;
            }
            yield {
              workflowId: `adv/change/project123/${exec.id}`,
              searchAttributes: exec.attrs,
            };
          }
        }
        return iter();
      },
    },
  };
}

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

describe("visibility search-attribute status reader", () => {
  const now = new Date("2026-06-05T17:00:00.000Z");

  test("builds a summary from search attributes and synthesizes gate progress", () => {
    const summary = buildSummaryFromSearchAttributes(
      "hardenMigrationSafety",
      {
        AdvChangeTitle: ["Harden migration safety"],
        AdvChangeStatus: ["draft"],
        AdvCurrentGate: ["release"],
        AdvLastSignalAt: ["2026-06-05T16:55:26.526Z"],
        AdvCreatedAt: ["2026-06-05T16:05:54.815Z"],
      },
      now,
    );

    expect(summary).not.toBeNull();
    expect(summary?.id).toBe("hardenMigrationSafety");
    expect(summary?.title).toBe("Harden migration safety");
    expect(summary?.status).toBe("draft");
    expect(summary?.firstIncompleteGate).toBe("release");
    expect(summary?.gateProgressStr).toBe("✓ ✓ ✓ ✓ ✓ ✓ ○");
    expect(summary?.lastActivityAt).toBe("2026-06-05T16:55:26.526Z");
  });

  test("excludes terminal-complete changes (AdvCurrentGate done)", () => {
    const summary = buildSummaryFromSearchAttributes(
      "alreadyDone",
      {
        AdvChangeTitle: ["Done change"],
        AdvChangeStatus: ["draft"],
        AdvCurrentGate: ["done"],
        AdvLastSignalAt: ["2026-06-05T16:00:00.000Z"],
      },
      now,
    );

    expect(summary).toBeNull();
  });

  test("decodes Datetime values returned as Date objects", () => {
    const summary = buildSummaryFromSearchAttributes(
      "dateChange",
      {
        AdvChangeTitle: ["Date change"],
        AdvChangeStatus: ["active"],
        AdvCurrentGate: ["execution"],
        AdvLastSignalAt: [new Date("2026-06-05T16:30:00.000Z")],
      },
      now,
    );

    expect(summary?.lastActivityAt).toBe("2026-06-05T16:30:00.000Z");
    expect(summary?.gateProgressStr).toBe("✓ ✓ ✓ ✓ ○ ○ ○");
    expect(summary?.firstIncompleteGate).toBe("execution");
  });

  test("falls back to changeId title and proposal gate when attrs are sparse", () => {
    const summary = buildSummaryFromSearchAttributes(
      "sparse",
      { AdvCreatedAt: ["2026-06-05T15:00:00.000Z"] },
      now,
    );

    expect(summary?.title).toBe("sparse");
    expect(summary?.status).toBe("draft");
    expect(summary?.firstIncompleteGate).toBe("proposal");
    expect(summary?.gateProgressStr).toBe("○ ○ ○ ○ ○ ○ ○");
    expect(summary?.lastActivityAt).toBe("2026-06-05T15:00:00.000Z");
  });

  test("summariesFromVisibility maps executions, drops terminal-complete, sorts by activity desc", async () => {
    const summaries = await summariesFromVisibility(
      fakeVisibilityClient([
        {
          id: "older",
          attrs: {
            AdvChangeTitle: ["Older"],
            AdvChangeStatus: ["draft"],
            AdvCurrentGate: ["proposal"],
            AdvLastSignalAt: ["2026-06-05T10:00:00.000Z"],
          },
        },
        {
          id: "doneChange",
          attrs: {
            AdvChangeTitle: ["Done"],
            AdvChangeStatus: ["draft"],
            AdvCurrentGate: ["done"],
            AdvLastSignalAt: ["2026-06-05T16:00:00.000Z"],
          },
        },
        {
          id: "newer",
          attrs: {
            AdvChangeTitle: ["Newer"],
            AdvChangeStatus: ["active"],
            AdvCurrentGate: ["execution"],
            AdvLastSignalAt: ["2026-06-05T12:00:00.000Z"],
          },
        },
      ]),
      { projectId: "project123", now },
    );

    expect(summaries.map((s) => s.id)).toEqual(["newer", "older"]);
  });

  test("filters active rows to running executions so stale completed workflows are excluded", async () => {
    const client = fakeVisibilityClient([
      {
        id: "archivedButStaleActive",
        executionStatus: "Completed",
        attrs: {
          AdvChangeTitle: ["Archived but stale active"],
          AdvChangeStatus: ["active"],
          AdvCurrentGate: ["release"],
          AdvLastSignalAt: ["2026-06-05T16:30:00.000Z"],
        },
      },
      {
        id: "runningActive",
        executionStatus: "Running",
        attrs: {
          AdvChangeTitle: ["Running active"],
          AdvChangeStatus: ["active"],
          AdvCurrentGate: ["execution"],
          AdvLastSignalAt: ["2026-06-05T16:45:00.000Z"],
        },
      },
    ]);

    const summaries = await summariesFromVisibility(client, {
      projectId: "project123",
      now,
    });

    expect(client.queries).toHaveLength(1);
    expect(client.queries[0]).toContain('AdvAffectedProjects = "project123"');
    expect(client.queries[0]).toContain(
      'AdvChangeStatus IN ("draft", "pending", "active")',
    );
    expect(client.queries[0]).toContain('ExecutionStatus = "Running"');
    expect(summaries.map((s) => s.id)).toEqual(["runningActive"]);
  });

  test("summariesFromVisibility fails closed when visibility listing fails", async () => {
    await expect(
      summariesFromVisibility(
        fakeVisibilityClient([], new Error("visibility unavailable")),
        { projectId: "project123", now },
      ),
    ).rejects.toThrow("visibility unavailable");
  });

  test("buildLiveStatusPayloadFromSummaries marks live and carries counts", () => {
    const payload = buildLiveStatusPayloadFromSummaries(
      [
        buildSummaryFromSearchAttributes(
          "c1",
          {
            AdvChangeTitle: ["C1"],
            AdvChangeStatus: ["draft"],
            AdvCurrentGate: ["design"],
            AdvLastSignalAt: ["2026-06-05T16:00:00.000Z"],
          },
          now,
        )!,
      ],
      { projectId: "project123", archivedCount: 3, closedCount: 0, now },
    );

    expect(payload.source).toBe("temporal");
    expect(payload.live).toBe(true);
    expect(payload.stale).toBe(false);
    expect(payload.changes.map((c) => c.id)).toEqual(["c1"]);
    expect(payload.counts).toEqual({ active: 1, archived: 3, closed: 0 });
  });
});
