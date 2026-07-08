import { describe, expect, it, vi } from "vitest";

import {
  buildEpicVisibilityQuery,
  listEpicWorkflowIds,
} from "./list-epic-workflows";
import { EPIC_WORKFLOW_NAME } from "./contracts";

function makeClient(results: Array<{ workflowId: string }>): {
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
  it("defaults to active/running mode and filters project scope by workflow ID prefix", async () => {
    const client = makeClient([
      { workflowId: "adv/epic/pid-abc/cardIdentity" },
      { workflowId: "adv/epic/other-pid/providerArchitecture" },
      { workflowId: "adv/change/pid-abc/notAnEpic" },
      { workflowId: "adv/epic/pid-abc/simplifiedChineseCardData" },
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
      { workflowId: "adv/epic/pid-abc/cardIdentity" },
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
      { workflowId: "adv/epic/pid-abc/cardIdentity" },
      { workflowId: "adv/epic/pid-abc/addLauncherRows" },
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
});
