import { describe, expect, it, vi } from "vitest";

import {
  buildEpicMembersVisibilityQuery,
  queryChangeIdsByEpicId,
} from "./visibility-epic-queries";

import { createMockOwnerFromClient } from "./__tests__/mock-owner";

const PROJECT_ID = "0".repeat(40);
const PROJECT_PREFIX = `adv/change/${PROJECT_ID}/`;

// Minimal client mock matching the shape used by visibility-epic-queries.
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

describe("visibility-epic-queries: query construction (rq-epicTemporalConstraints01)", () => {
  it("builds Epic-members query scoped by AdvAffectedProjects + AdvEpicId + open lifecycle", () => {
    const query = buildEpicMembersVisibilityQuery({
      projectId: PROJECT_ID,
      epicId: "addAuthEpic",
    });

    expect(query).toBe(
      `AdvAffectedProjects = "${PROJECT_ID}" AND AdvEpicId = "addAuthEpic" AND AdvLifecycleState = "open" AND ExecutionStatus = "Running"`,
    );
  });

  it("escapes double-quotes in projectId and epicId", () => {
    const query = buildEpicMembersVisibilityQuery({
      projectId: 'evil"pid',
      epicId: 'evil"epic',
    });

    expect(query).toContain('AdvAffectedProjects = "evil\\"pid"');
    expect(query).toContain('AdvEpicId = "evil\\"epic"');
  });

  it("maps open draft status to open lifecycle filtering", () => {
    const query = buildEpicMembersVisibilityQuery({
      projectId: PROJECT_ID,
      epicId: "addAuthEpic",
      statuses: ["draft"],
    });

    expect(query).toBe(
      `AdvAffectedProjects = "${PROJECT_ID}" AND AdvEpicId = "addAuthEpic" AND AdvLifecycleState = "open" AND ExecutionStatus = "Running"`,
    );
  });

  it("preserves explicit terminal status filtering for archive sweeps", () => {
    const query = buildEpicMembersVisibilityQuery({
      projectId: PROJECT_ID,
      epicId: "addAuthEpic",
      statuses: ["archived"],
    });

    expect(query).toBe(
      `AdvAffectedProjects = "${PROJECT_ID}" AND AdvEpicId = "addAuthEpic" AND AdvChangeStatus IN ("archived")`,
    );
  });

  it("supports null statuses to disable status filter", () => {
    const query = buildEpicMembersVisibilityQuery({
      projectId: PROJECT_ID,
      epicId: "addAuthEpic",
      statuses: null,
    });

    expect(query).toBe(
      `AdvAffectedProjects = "${PROJECT_ID}" AND AdvEpicId = "addAuthEpic"`,
    );
  });
});

describe("visibility-epic-queries: queryChangeIdsByEpicId", () => {
  it("returns matching change IDs scoped by project prefix", async () => {
    const client = makeClient([
      { workflowId: `${PROJECT_PREFIX}childOne` },
      { workflowId: `${PROJECT_PREFIX}childTwo` },
    ]);
    const owner = createMockOwnerFromClient({ client });

    const ids = await queryChangeIdsByEpicId(owner, PROJECT_ID, "addAuthEpic");

    expect(ids.value).toEqual(["childOne", "childTwo"]);
    expect(client.workflow.list).toHaveBeenCalledWith({
      query: expect.stringContaining('AdvEpicId = "addAuthEpic"'),
    });
  });

  it("filters out workflows that do not match the project prefix", async () => {
    const client = makeClient([
      { workflowId: `${PROJECT_PREFIX}myChange` },
      { workflowId: "adv/change/other-pid/leaked" },
      { workflowId: "adv/project/pid-abc" },
    ]);
    const owner = createMockOwnerFromClient({ client });

    const ids = await queryChangeIdsByEpicId(owner, PROJECT_ID, "addAuthEpic");

    expect(ids.value).toEqual(["myChange"]);
  });

  it("returns empty array when no matching workflows exist", async () => {
    const client = makeClient([]);
    const owner = createMockOwnerFromClient({ client });

    const ids = await queryChangeIdsByEpicId(owner, PROJECT_ID, "missingEpic");

    expect(ids.value).toEqual([]);
  });

  it("respects the limit option", async () => {
    const client = makeClient([
      { workflowId: `${PROJECT_PREFIX}childOne` },
      { workflowId: `${PROJECT_PREFIX}childTwo` },
      { workflowId: `${PROJECT_PREFIX}childThree` },
    ]);
    const owner = createMockOwnerFromClient({ client });

    const ids = await queryChangeIdsByEpicId(owner, PROJECT_ID, "addAuthEpic", {
      limit: 2,
    });

    expect(ids.value).toEqual(["childOne", "childTwo"]);
  });
});
