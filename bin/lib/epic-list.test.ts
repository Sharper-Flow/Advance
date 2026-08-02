import { describe, expect, test } from "bun:test";

import {
  buildLiveEpicListFailure,
  buildLiveEpicListPayload,
  listEpicsFromVisibility,
} from "./epic-list";

const PROJECT_ID = "e".repeat(40);

function fakeEpicOwner(
  workflowRows: Array<{ workflowId: string; startTime?: Date | null }>,
  listError?: Error,
) {
  const queries: string[] = [];
  return {
    queries,
    list: async <T extends { workflowId: string; startTime?: Date | null }>(
      _ctx: unknown,
      query: string,
      _options?: { limit?: number; nextPageToken?: string },
    ): Promise<{ kind: "complete"; value: T[]; truncated: boolean }> => {
      if (listError) throw listError;
      queries.push(query);
      return { kind: "complete", value: workflowRows as T[], truncated: false };
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
        projectId: PROJECT_ID,
        now,
      },
    );

    expect(payload).toEqual({
      source: "temporal",
      live: true,
      stale: false,
      generated_at: "2026-06-26T03:00:00.000Z",
      project_id: PROJECT_ID,
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
        projectId: PROJECT_ID,
        now,
      },
    );

    expect(payload.epics).toEqual([{ id: "cardIdentity", startTime: null }]);
  });

  test("builds fail-closed JSON metadata", () => {
    const payload = buildLiveEpicListFailure(
      PROJECT_ID,
      new Error("Temporal unavailable"),
      now,
    );

    expect(payload.source).toBe("temporal");
    expect(payload.live).toBe(false);
    expect(payload.stale).toBe(false);
    expect(payload.project_id).toBe(PROJECT_ID);
    expect(payload.epics).toEqual([]);
    expect(payload.error).toBe("Temporal unavailable");
    expect(payload.remediation).toContain("Temporal");
  });

  test("lists only Epic IDs in the current project prefix", async () => {
    const client = fakeEpicOwner([
      {
        workflowId: `adv/epic/${PROJECT_ID}/cardIdentity`,
        startTime: new Date("2026-06-25T10:00:00.000Z"),
      },
      {
        workflowId: "adv/epic/other-pid/providerArchitecture",
        startTime: new Date("2026-06-25T10:01:00.000Z"),
      },
      {
        workflowId: `adv/change/${PROJECT_ID}/notEpic`,
        startTime: new Date("2026-06-25T10:02:00.000Z"),
      },
      {
        workflowId: `adv/epic/${PROJECT_ID}/`,
        startTime: new Date("2026-06-25T10:03:00.000Z"),
      },
      {
        workflowId: `adv/epic/${PROJECT_ID}/addLauncherRows`,
        startTime: null,
      },
    ]);

    const epics = await listEpicsFromVisibility(client, {
      projectId: PROJECT_ID,
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
    const client = fakeEpicOwner([
      {
        workflowId: `adv/epic/${PROJECT_ID}/cardIdentity`,
        startTime: new Date("2026-06-25T10:00:00.000Z"),
      },
    ]);

    await listEpicsFromVisibility(client, {
      projectId: PROJECT_ID,
      timeoutMs: 1000,
      status: "all",
    });

    expect(client.queries).toEqual(['WorkflowType = "epicWorkflow"']);
  });

  test("fails closed by throwing when Visibility listing fails", async () => {
    const client = fakeEpicOwner([], new Error("visibility unavailable"));

    await expect(
      listEpicsFromVisibility(client, { projectId: PROJECT_ID, timeoutMs: 1000 }),
    ).rejects.toThrow("visibility unavailable");
  });
});
