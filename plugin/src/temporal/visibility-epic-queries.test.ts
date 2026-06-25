import { describe, expect, it, vi } from "vitest";

import {
  buildEpicMembersVisibilityQuery,
  queryChangeIdsByEpicId,
} from "./visibility-epic-queries";

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
      projectId: "pid-abc",
      epicId: "addAuthEpic",
    });

    expect(query).toBe(
      'AdvAffectedProjects = "pid-abc" AND AdvEpicId = "addAuthEpic" AND AdvLifecycleState = "open" AND ExecutionStatus = "Running"',
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

  it("maps legacy open custom statuses to open lifecycle filtering", () => {
    const query = buildEpicMembersVisibilityQuery({
      projectId: "pid-abc",
      epicId: "addAuthEpic",
      statuses: ["active"],
    });

    expect(query).toBe(
      'AdvAffectedProjects = "pid-abc" AND AdvEpicId = "addAuthEpic" AND AdvLifecycleState = "open" AND ExecutionStatus = "Running"',
    );
  });

  it("preserves explicit terminal status filtering for archive sweeps", () => {
    const query = buildEpicMembersVisibilityQuery({
      projectId: "pid-abc",
      epicId: "addAuthEpic",
      statuses: ["archived"],
    });

    expect(query).toBe(
      'AdvAffectedProjects = "pid-abc" AND AdvEpicId = "addAuthEpic" AND AdvChangeStatus IN ("archived")',
    );
  });

  it("supports null statuses to disable status filter", () => {
    const query = buildEpicMembersVisibilityQuery({
      projectId: "pid-abc",
      epicId: "addAuthEpic",
      statuses: null,
    });

    expect(query).toBe(
      'AdvAffectedProjects = "pid-abc" AND AdvEpicId = "addAuthEpic"',
    );
  });
});

describe("visibility-epic-queries: queryChangeIdsByEpicId", () => {
  const PROJECT_PREFIX = "adv/change/pid-abc/";

  it("returns matching change IDs scoped by project prefix", async () => {
    const client = makeClient([
      { workflowId: `${PROJECT_PREFIX}childOne` },
      { workflowId: `${PROJECT_PREFIX}childTwo` },
    ]);

    const ids = await queryChangeIdsByEpicId(client, "pid-abc", "addAuthEpic");

    expect(ids).toEqual(["childOne", "childTwo"]);
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

    const ids = await queryChangeIdsByEpicId(client, "pid-abc", "addAuthEpic");

    expect(ids).toEqual(["myChange"]);
  });

  it("returns empty array when no matching workflows exist", async () => {
    const client = makeClient([]);

    const ids = await queryChangeIdsByEpicId(client, "pid-abc", "missingEpic");

    expect(ids).toEqual([]);
  });

  it("respects the limit option", async () => {
    const client = makeClient([
      { workflowId: `${PROJECT_PREFIX}childOne` },
      { workflowId: `${PROJECT_PREFIX}childTwo` },
      { workflowId: `${PROJECT_PREFIX}childThree` },
    ]);

    const ids = await queryChangeIdsByEpicId(client, "pid-abc", "addAuthEpic", {
      limit: 2,
    });

    expect(ids).toEqual(["childOne", "childTwo"]);
  });
});
