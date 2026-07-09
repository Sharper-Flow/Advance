import { describe, expect, test } from "bun:test";

import {
  buildLiveEpicListFailure,
  buildLiveEpicListPayload,
  listEpicsFromVisibility,
} from "./epic-list";

function fakeEpicClient(
  workflowRows: Array<{ workflowId: string; startTime?: Date | null }>,
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
          for (const row of workflowRows) yield row;
        }
        return iter();
      },
    },
  };
}

describe("epic list CLI helper", () => {
  const now = new Date("2026-06-26T03:00:00.000Z");

  test("builds a live payload with stable Epic entry objects", () => {
    const payload = buildLiveEpicListPayload(
      [
        {
          id: "cardIdentity",
          startTime: new Date("2026-06-25T10:00:00.000Z"),
        },
        {
          id: "providerArchitecture",
          startTime: new Date("2026-06-25T11:00:00.000Z"),
        },
      ],
      {
        projectId: "pid-abc",
        now,
      },
    );

    expect(payload).toEqual({
      source: "temporal",
      live: true,
      stale: false,
      generated_at: "2026-06-26T03:00:00.000Z",
      project_id: "pid-abc",
      epics: [
        { id: "cardIdentity", startTime: "2026-06-25T10:00:00.000Z" },
        {
          id: "providerArchitecture",
          startTime: "2026-06-25T11:00:00.000Z",
        },
      ],
    });
  });

  test("keeps an Epic row with null startTime when Visibility lacks a valid timestamp", () => {
    const payload = buildLiveEpicListPayload(
      [{ id: "cardIdentity", startTime: null }],
      {
        projectId: "pid-abc",
        now,
      },
    );

    expect(payload.epics).toEqual([{ id: "cardIdentity", startTime: null }]);
  });

  test("builds fail-closed JSON metadata", () => {
    const payload = buildLiveEpicListFailure(
      "pid-abc",
      new Error("Temporal unavailable"),
      now,
    );

    expect(payload.source).toBe("temporal");
    expect(payload.live).toBe(false);
    expect(payload.stale).toBe(false);
    expect(payload.project_id).toBe("pid-abc");
    expect(payload.epics).toEqual([]);
    expect(payload.error).toBe("Temporal unavailable");
    expect(payload.remediation).toContain("Temporal");
  });

  test("lists only Epic IDs in the current project prefix", async () => {
    const client = fakeEpicClient([
      {
        workflowId: "adv/epic/pid-abc/cardIdentity",
        startTime: new Date("2026-06-25T10:00:00.000Z"),
      },
      {
        workflowId: "adv/epic/other-pid/providerArchitecture",
        startTime: new Date("2026-06-25T10:01:00.000Z"),
      },
      {
        workflowId: "adv/change/pid-abc/notEpic",
        startTime: new Date("2026-06-25T10:02:00.000Z"),
      },
      {
        workflowId: "adv/epic/pid-abc/",
        startTime: new Date("2026-06-25T10:03:00.000Z"),
      },
      {
        workflowId: "adv/epic/pid-abc/addLauncherRows",
        startTime: null,
      },
    ]);

    const epics = await listEpicsFromVisibility(client, {
      projectId: "pid-abc",
      timeoutMs: 1000,
    });

    expect(epics).toEqual([
      {
        id: "cardIdentity",
        startTime: new Date("2026-06-25T10:00:00.000Z"),
      },
      { id: "addLauncherRows", startTime: null },
    ]);
    expect(client.queries).toEqual([
      'WorkflowType = "epicWorkflow" AND AdvEpicStatus = "active" AND ExecutionStatus = "Running"',
    ]);
  });

  test("can request all execution statuses without ExecutionStatus filter", async () => {
    const client = fakeEpicClient([
      {
        workflowId: "adv/epic/pid-abc/cardIdentity",
        startTime: new Date("2026-06-25T10:00:00.000Z"),
      },
    ]);

    await listEpicsFromVisibility(client, {
      projectId: "pid-abc",
      timeoutMs: 1000,
      status: "all",
    });

    expect(client.queries).toEqual(['WorkflowType = "epicWorkflow"']);
  });

  test("fails closed by throwing when Visibility listing fails", async () => {
    const client = fakeEpicClient([], new Error("visibility unavailable"));

    await expect(
      listEpicsFromVisibility(client, { projectId: "pid-abc", timeoutMs: 1000 }),
    ).rejects.toThrow("visibility unavailable");
  });
});
