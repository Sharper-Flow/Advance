import { describe, expect, test } from "bun:test";

import {
  buildLiveEpicListFailure,
  buildLiveEpicListPayload,
  listEpicIdsFromVisibility,
  loadCurrentChildByEpicId,
} from "./epic-list";
import { mkdtemp, mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

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
    const payload = buildLiveEpicListPayload(
      ["cardIdentity", "providerArchitecture"],
      {
        projectId: "pid-abc",
        now,
        currentChildByEpicId: new Map([["cardIdentity", "codifyScopedPricingSpec"]]),
      },
    );

    expect(payload).toEqual({
      source: "temporal",
      live: true,
      stale: false,
      generated_at: "2026-06-26T03:00:00.000Z",
      project_id: "pid-abc",
      epics: [
        { id: "cardIdentity", currentChildChangeId: "codifyScopedPricingSpec" },
        { id: "providerArchitecture" },
      ],
    });
  });

  test("loads first current child per Epic from persisted active membership", async () => {
    const root = await mkdtemp(join(tmpdir(), "adv-epic-list-"));
    const changesDir = join(root, "changes");
    await mkdir(join(changesDir, "olderChild"), { recursive: true });
    await mkdir(join(changesDir, "newerChild"), { recursive: true });
    await mkdir(join(changesDir, "closedChild"), { recursive: true });
    await mkdir(join(changesDir, "shellOnlyOtherEpic"), { recursive: true });

    await writeFile(
      join(changesDir, "olderChild", "change.json"),
      JSON.stringify({
        id: "olderChild",
        title: "Older child",
        status: "draft",
        created_at: "2026-06-25T00:00:00.000Z",
        lastSignalAt: "2026-06-26T00:00:00.000Z",
        tasks: [],
        epic_membership: { epic_id: "cardIdentity", title: "Older child" },
      }),
    );
    await writeFile(
      join(changesDir, "newerChild", "change.json"),
      JSON.stringify({
        id: "newerChild",
        title: "Newer child",
        status: "draft",
        created_at: "2026-06-25T00:00:00.000Z",
        lastSignalAt: "2026-06-27T00:00:00.000Z",
        tasks: [],
        epic_membership: { epic_id: "cardIdentity", title: "Newer child" },
      }),
    );
    await writeFile(
      join(changesDir, "closedChild", "change.json"),
      JSON.stringify({
        id: "closedChild",
        title: "Closed child",
        status: "closed",
        created_at: "2026-06-28T00:00:00.000Z",
        tasks: [],
        epic_membership: { epic_id: "providerArchitecture", title: "Closed" },
      }),
    );
    await writeFile(
      join(changesDir, "shellOnlyOtherEpic", "change.json"),
      JSON.stringify({
        id: "shellOnlyOtherEpic",
        title: "No epic membership",
        status: "draft",
        created_at: "2026-06-28T00:00:00.000Z",
        tasks: [],
      }),
    );

    const byEpic = await loadCurrentChildByEpicId(root);

    expect(byEpic.get("cardIdentity")).toBe("newerChild");
    expect(byEpic.has("providerArchitecture")).toBe(false);
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
