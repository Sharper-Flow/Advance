import { describe, expect, it, vi } from "vitest";
import { createMockOwnerFromClient } from "../temporal/__tests__/mock-owner";

import {
  buildEpicVisibilityQuery,
  listEpicWorkflows,
  listEpicWorkflowIds,
} from "./list-epic-workflows";
import { EPIC_WORKFLOW_NAME } from "./contracts";

/** Canonical 40-character lowercase hex project ID used across these tests. */
const PROJECT_ID = "0".repeat(40);
const EPIC_PREFIX = `adv/epic/${PROJECT_ID}/`;

function makeOwner(
  results: Array<{ workflowId: string; startTime?: Date | null }>,
): {
  owner: ReturnType<typeof createMockOwnerFromClient>;
  client: {
    workflow: {
      list: ReturnType<typeof vi.fn>;
    };
  };
} {
  const list = vi.fn(({ query: _query }: { query: string }) => {
    return (async function* iterate() {
      for (const r of results) yield r;
    })();
  });
  const client = { workflow: { list } };
  return { owner: createMockOwnerFromClient(client), client };
}

describe("listEpicWorkflowIds", () => {
  const startTime = new Date("2026-06-25T10:00:00.000Z");

  it("defaults to active/running mode and filters project scope by workflow ID prefix", async () => {
    const otherProjectId = "1".repeat(40);
    const { owner, client } = makeOwner([
      { workflowId: `${EPIC_PREFIX}cardIdentity`, startTime },
      {
        workflowId: `adv/epic/${otherProjectId}/providerArchitecture`,
        startTime,
      },
      { workflowId: `adv/change/${PROJECT_ID}/notAnEpic`, startTime },
      { workflowId: `${EPIC_PREFIX}simplifiedChineseCardData`, startTime },
    ]);

    const outcome = await listEpicWorkflowIds(owner, {
      projectId: PROJECT_ID,
    });

    expect(outcome.kind).toBe("complete");
    expect((outcome as { kind: "complete"; value: string[] }).value).toEqual([
      "cardIdentity",
      "simplifiedChineseCardData",
    ]);
    expect(client.workflow.list).toHaveBeenCalledWith({
      query: `WorkflowType = "${EPIC_WORKFLOW_NAME}" AND AdvEpicStatus = "active" AND ExecutionStatus = "Running"`,
    });
  });

  it("uses structural Epic status so merged/completed running workflows do not leak into active CLI lists", () => {
    expect(buildEpicVisibilityQuery(PROJECT_ID)).toContain(
      'AdvEpicStatus = "active"',
    );
  });

  it("supports all-executions mode with no ExecutionStatus filter", async () => {
    const { owner, client } = makeOwner([
      { workflowId: `${EPIC_PREFIX}cardIdentity`, startTime },
    ]);

    await listEpicWorkflowIds(owner, {
      projectId: PROJECT_ID,
      status: "all",
    });

    expect(client.workflow.list).toHaveBeenCalledWith({
      query: `WorkflowType = "${EPIC_WORKFLOW_NAME}"`,
    });
  });

  it("does not use WorkflowId LIKE in visibility query", () => {
    expect(buildEpicVisibilityQuery(PROJECT_ID)).toBe(
      `WorkflowType = "${EPIC_WORKFLOW_NAME}" AND AdvEpicStatus = "active" AND ExecutionStatus = "Running"`,
    );
  });

  it("builds all-executions query without ExecutionStatus", () => {
    expect(buildEpicVisibilityQuery(PROJECT_ID, "all")).toBe(
      `WorkflowType = "${EPIC_WORKFLOW_NAME}"`,
    );
  });

  it("builds running-all repair query without AdvEpicStatus but with ExecutionStatus = Running", () => {
    expect(buildEpicVisibilityQuery(PROJECT_ID, "running")).toBe(
      `WorkflowType = "${EPIC_WORKFLOW_NAME}" AND ExecutionStatus = "Running"`,
    );
  });

  it("lists running Epic workflows without AdvEpicStatus filter", async () => {
    const { owner, client } = makeOwner([
      { workflowId: `${EPIC_PREFIX}cardIdentity`, startTime },
      { workflowId: `${EPIC_PREFIX}addLauncherRows`, startTime },
    ]);

    const outcome = await listEpicWorkflowIds(owner, {
      projectId: PROJECT_ID,
      status: "running",
    });

    expect(outcome.kind).toBe("complete");
    expect((outcome as { kind: "complete"; value: string[] }).value).toEqual([
      "cardIdentity",
      "addLauncherRows",
    ]);
    expect(client.workflow.list).toHaveBeenCalledWith({
      query: `WorkflowType = "${EPIC_WORKFLOW_NAME}" AND ExecutionStatus = "Running"`,
    });
  });

  it("lists Epic workflow entries with Visibility startTime", async () => {
    const secondStart = new Date("2026-06-25T11:00:00.000Z");
    const { owner } = makeOwner([
      { workflowId: `${EPIC_PREFIX}cardIdentity`, startTime },
      {
        workflowId: `${EPIC_PREFIX}addLauncherRows`,
        startTime: secondStart,
      },
    ]);

    const outcome = await listEpicWorkflows(owner, {
      projectId: PROJECT_ID,
    });

    expect(outcome.kind).toBe("complete");
    expect(
      (
        outcome as {
          kind: "complete";
          value: { id: string; startTime: Date | null }[];
        }
      ).value,
    ).toEqual([
      { id: "cardIdentity", startTime },
      { id: "addLauncherRows", startTime: secondStart },
    ]);
  });

  it("keeps an Epic entry with null startTime when Visibility row lacks a valid Date", async () => {
    const { owner } = makeOwner([
      { workflowId: `${EPIC_PREFIX}missingStart` },
      {
        workflowId: `${EPIC_PREFIX}invalidStart`,
        startTime: new Date("invalid"),
      },
    ]);

    const outcome = await listEpicWorkflows(owner, {
      projectId: PROJECT_ID,
    });

    expect(outcome.kind).toBe("complete");
    expect(
      (
        outcome as {
          kind: "complete";
          value: { id: string; startTime: Date | null }[];
        }
      ).value,
    ).toEqual([
      { id: "missingStart", startTime: null },
      { id: "invalidStart", startTime: null },
    ]);
  });
});
