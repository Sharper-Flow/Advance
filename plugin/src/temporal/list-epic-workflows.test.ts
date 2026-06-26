import { describe, expect, it, vi } from "vitest";

import {
  buildEpicVisibilityQuery,
  listEpicWorkflowIds,
} from "./list-epic-workflows";

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
  it("uses workflow type only and filters project scope by workflow ID prefix", async () => {
    const client = makeClient([
      { workflowId: "adv/epic/pid-abc/cardIdentity" },
      { workflowId: "adv/epic/other-pid/providerArchitecture" },
      { workflowId: "adv/change/pid-abc/notAnEpic" },
      { workflowId: "adv/epic/pid-abc/simplifiedChineseCardData" },
    ]);

    const ids = await listEpicWorkflowIds(client, { projectId: "pid-abc" });

    expect(ids).toEqual(["cardIdentity", "simplifiedChineseCardData"]);
    expect(client.workflow.list).toHaveBeenCalledWith({
      query: 'WorkflowType = "epicWorkflow"',
    });
  });

  it("does not use WorkflowId LIKE in visibility query", () => {
    expect(buildEpicVisibilityQuery("pid-abc")).toBe(
      'WorkflowType = "epicWorkflow"',
    );
  });
});
