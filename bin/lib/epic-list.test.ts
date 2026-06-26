import { describe, expect, test } from "bun:test";

import {
  buildLiveEpicListFailure,
  buildLiveEpicListPayload,
  listEpicIdsFromVisibility,
} from "./epic-list";

function fakeEpicClient(workflowIds: string[], listError?: Error) {
  const queries: string[] = [];
  return {
    queries,
    workflow: {
      list: (opts: { query: string }) => {
        if (listError) throw listError;
        queries.push(opts.query);
        async function* iter() {
          for (const workflowId of workflowIds) yield { workflowId };
        }
        return iter();
      },
    },
  };
}

describe("epic list CLI helper", () => {
  const now = new Date("2026-06-26T03:00:00.000Z");

  test("builds a live payload with stable Epic entry objects", () => {
    const payload = buildLiveEpicListPayload(["cardIdentity", "providerArchitecture"], {
      projectId: "pid-abc",
      now,
    });

    expect(payload).toEqual({
      source: "temporal",
      live: true,
      stale: false,
      generated_at: "2026-06-26T03:00:00.000Z",
      project_id: "pid-abc",
      epics: [{ id: "cardIdentity" }, { id: "providerArchitecture" }],
    });
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
      "adv/epic/pid-abc/cardIdentity",
      "adv/epic/other-pid/providerArchitecture",
      "adv/change/pid-abc/notEpic",
      "adv/epic/pid-abc/",
      "adv/epic/pid-abc/addLauncherRows",
    ]);

    const ids = await listEpicIdsFromVisibility(client, {
      projectId: "pid-abc",
      timeoutMs: 1000,
    });

    expect(ids).toEqual(["cardIdentity", "addLauncherRows"]);
    expect(client.queries).toEqual(['WorkflowType = "epicWorkflow"']);
  });

  test("fails closed by throwing when Visibility listing fails", async () => {
    const client = fakeEpicClient([], new Error("visibility unavailable"));

    await expect(
      listEpicIdsFromVisibility(client, { projectId: "pid-abc", timeoutMs: 1000 }),
    ).rejects.toThrow("visibility unavailable");
  });
});
