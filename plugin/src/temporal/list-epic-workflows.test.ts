import { describe, expect, it, vi } from "vitest";

import {
  buildEpicVisibilityQuery,
  listEpicWorkflows,
  listEpicWorkflowIds,
} from "./list-epic-workflows";
import { EPIC_WORKFLOW_NAME } from "./contracts";

function makeClient(
  results: Array<{ workflowId: string; startTime?: Date | null }>,
): {
  workflow: {
    list: ReturnType<typeof vi.fn>;
  };
} {
  const list = vi.fn(({ query: _query }: { query: string }) => {
    return (async function* iterate() {
      for (const r of results) yield r;
    })();
  });
  return { workflow: { list } };
}

describe("listEpicWorkflowIds", () => {
  const startTime = new Date("2026-06-25T10:00:00.000Z");

  it("defaults to active/running mode and filters project scope by workflow ID prefix", async () => {
    const client = makeClient([
      { workflowId: "adv/epic/pid-abc/cardIdentity", startTime },
      { workflowId: "adv/epic/other-pid/providerArchitecture", startTime },
      { workflowId: "adv/change/pid-abc/notAnEpic", startTime },
      { workflowId: "adv/epic/pid-abc/simplifiedChineseCardData", startTime },
    ]);

    const ids = await listEpicWorkflowIds(client, { projectId: "pid-abc" });

    expect(ids).toEqual(["cardIdentity", "simplifiedChineseCardData"]);
    expect(client.workflow.list).toHaveBeenCalledWith({
      query: `WorkflowType = "${EPIC_WORKFLOW_NAME}" AND AdvEpicStatus = "active" AND ExecutionStatus = "Running"`,
    });
  });

  it("uses structural Epic status so merged/completed running workflows do not leak into active CLI lists", () => {
    expect(buildEpicVisibilityQuery("pid-abc")).toContain(
      'AdvEpicStatus = "active"',
    );
  });

  it("supports all-executions mode with no ExecutionStatus filter", async () => {
    const client = makeClient([
      { workflowId: "adv/epic/pid-abc/cardIdentity", startTime },
    ]);

    await listEpicWorkflowIds(client, {
      projectId: "pid-abc",
      status: "all",
    });

    expect(client.workflow.list).toHaveBeenCalledWith({
      query: `WorkflowType = "${EPIC_WORKFLOW_NAME}"`,
    });
  });

  it("does not use WorkflowId LIKE in visibility query", () => {
    expect(buildEpicVisibilityQuery("pid-abc")).toBe(
      `WorkflowType = "${EPIC_WORKFLOW_NAME}" AND AdvEpicStatus = "active" AND ExecutionStatus = "Running"`,
    );
  });

  it("builds all-executions query without ExecutionStatus", () => {
    expect(buildEpicVisibilityQuery("pid-abc", "all")).toBe(
      `WorkflowType = "${EPIC_WORKFLOW_NAME}"`,
    );
  });

  it("builds running-all repair query without AdvEpicStatus but with ExecutionStatus = Running", () => {
    expect(buildEpicVisibilityQuery("pid-abc", "running")).toBe(
      `WorkflowType = "${EPIC_WORKFLOW_NAME}" AND ExecutionStatus = "Running"`,
    );
  });

  it("lists running Epic workflows without AdvEpicStatus filter", async () => {
    const client = makeClient([
      { workflowId: "adv/epic/pid-abc/cardIdentity", startTime },
      { workflowId: "adv/epic/pid-abc/addLauncherRows", startTime },
    ]);

    const ids = await listEpicWorkflowIds(client, {
      projectId: "pid-abc",
      status: "running",
    });

    expect(ids).toEqual(["cardIdentity", "addLauncherRows"]);
    expect(client.workflow.list).toHaveBeenCalledWith({
      query: `WorkflowType = "${EPIC_WORKFLOW_NAME}" AND ExecutionStatus = "Running"`,
    });
  });

  it("lists Epic workflow entries with Visibility startTime", async () => {
    const secondStart = new Date("2026-06-25T11:00:00.000Z");
    const client = makeClient([
      { workflowId: "adv/epic/pid-abc/cardIdentity", startTime },
      {
        workflowId: "adv/epic/pid-abc/addLauncherRows",
        startTime: secondStart,
      },
    ]);

    const epics = await listEpicWorkflows(client, { projectId: "pid-abc" });

    expect(epics).toEqual([
      { id: "cardIdentity", startTime },
      { id: "addLauncherRows", startTime: secondStart },
    ]);
  });

  it("keeps an Epic entry with null startTime when Visibility row lacks a valid Date", async () => {
    const client = makeClient([
      { workflowId: "adv/epic/pid-abc/missingStart" },
      {
        workflowId: "adv/epic/pid-abc/invalidStart",
        startTime: new Date("invalid"),
      },
    ]);

    const epics = await listEpicWorkflows(client, { projectId: "pid-abc" });

    expect(epics).toEqual([
      { id: "missingStart", startTime: null },
      { id: "invalidStart", startTime: null },
    ]);
  });
});
