import { describe, expect, it, vi } from "vitest";

import {
  buildClaimVisibilityQuery,
  buildActiveClaimsVisibilityQuery,
  queryClaimsByIssueNumber,
  queryActiveChangesByIssueNumbers,
} from "./visibility-claim-queries";

// Minimal client mock matching the shape used by visibility-claim-queries.
function makeClient(
  results: Array<{
    workflowId: string;
    searchAttributes?: Record<string, unknown>;
  }>,
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

describe("visibility-claim-queries: query construction (rq-backlogCoord01, rq-backlogCoord02)", () => {
  it("builds claim-collision query scoped by AdvAffectedProjects + AdvBacklogIssueNumber + open lifecycle", () => {
    const query = buildClaimVisibilityQuery({
      projectId: "pid-abc",
      issueNumber: 42,
    });

    expect(query).toBe(
      'AdvAffectedProjects = "pid-abc" AND AdvBacklogIssueNumber = "42" AND AdvLifecycleState = "open" AND ExecutionStatus = "Running"',
    );
  });

  it("escapes double-quotes in projectId to prevent visibility-query injection", () => {
    const query = buildClaimVisibilityQuery({
      projectId: 'evil"id',
      issueNumber: 1,
    });

    expect(query).toContain('AdvAffectedProjects = "evil\\"id"');
  });

  it("builds bulk active-claims query for multiple issue numbers using IN operator", () => {
    const query = buildActiveClaimsVisibilityQuery({
      projectId: "pid-abc",
      issueNumbers: [51, 52, 60],
    });

    expect(query).toBe(
      'AdvAffectedProjects = "pid-abc" AND AdvBacklogIssueNumber IN ("51", "52", "60") AND AdvLifecycleState = "open" AND ExecutionStatus = "Running"',
    );
  });

  it("returns null for the bulk query when issueNumbers is empty (caller should skip the Temporal call)", () => {
    const query = buildActiveClaimsVisibilityQuery({
      projectId: "pid-abc",
      issueNumbers: [],
    });

    expect(query).toBeNull();
  });
});

describe("visibility-claim-queries: queryClaimsByIssueNumber (rq-backlogCoord02 pre-create check)", () => {
  const PROJECT_PREFIX = "adv/change/pid-abc/";

  it("returns matching change IDs scoped by project prefix", async () => {
    const client = makeClient([
      { workflowId: `${PROJECT_PREFIX}existingChange` },
      { workflowId: `${PROJECT_PREFIX}anotherProjectChange` },
    ]);

    const claims = await queryClaimsByIssueNumber(client, "pid-abc", 51);

    expect(claims).toEqual([
      { changeId: "existingChange" },
      { changeId: "anotherProjectChange" },
    ]);
    expect(client.workflow.list).toHaveBeenCalledWith({
      query: expect.stringContaining('AdvBacklogIssueNumber = "51"'),
    });
  });

  it("filters out workflows that do not match the project prefix (defensive)", async () => {
    const client = makeClient([
      { workflowId: `${PROJECT_PREFIX}myChange` },
      { workflowId: "adv/change/other-pid/leaked" }, // wrong project — should be filtered
      { workflowId: "adv/project/pid-abc" }, // wrong shape — should be filtered
    ]);

    const claims = await queryClaimsByIssueNumber(client, "pid-abc", 42);

    expect(claims).toEqual([{ changeId: "myChange" }]);
  });

  it("returns empty array when no matching workflows exist", async () => {
    const client = makeClient([]);

    const claims = await queryClaimsByIssueNumber(client, "pid-abc", 999);

    expect(claims).toEqual([]);
  });
});

describe("visibility-claim-queries: queryActiveChangesByIssueNumbers (rq-backlogCoord05 O(1) lookup)", () => {
  const PROJECT_PREFIX = "adv/change/pid-abc/";

  it("returns Map keyed by issue number for matching changes", async () => {
    const client = makeClient([
      {
        workflowId: `${PROJECT_PREFIX}changeForIssue51`,
        searchAttributes: { AdvBacklogIssueNumber: ["51"] },
      },
      {
        workflowId: `${PROJECT_PREFIX}changeForIssue52`,
        searchAttributes: { AdvBacklogIssueNumber: ["52"] },
      },
    ]);

    const map = await queryActiveChangesByIssueNumbers(
      client,
      "pid-abc",
      [51, 52, 60],
    );

    expect(map.get(51)).toEqual({ changeId: "changeForIssue51" });
    expect(map.get(52)).toEqual({ changeId: "changeForIssue52" });
    expect(map.get(60)).toBeUndefined();
    expect(map.size).toBe(2);
  });

  it("returns empty Map and does NOT call Temporal when issueNumbers is empty", async () => {
    const client = makeClient([{ workflowId: `${PROJECT_PREFIX}irrelevant` }]);

    const map = await queryActiveChangesByIssueNumbers(client, "pid-abc", []);

    expect(map.size).toBe(0);
    expect(client.workflow.list).not.toHaveBeenCalled();
  });

  it("uses a single Visibility call for input arrays ≤ 100 issue numbers", async () => {
    const client = makeClient([]);
    const issueNumbers = Array.from({ length: 100 }, (_, i) => i + 1);

    await queryActiveChangesByIssueNumbers(client, "pid-abc", issueNumbers);

    expect(client.workflow.list).toHaveBeenCalledTimes(1);
  });

  it("chunks the call into batches of 100 for larger inputs", async () => {
    const client = makeClient([]);
    const issueNumbers = Array.from({ length: 250 }, (_, i) => i + 1);

    await queryActiveChangesByIssueNumbers(client, "pid-abc", issueNumbers);

    // 250 issues → ceil(250 / 100) = 3 batches
    expect(client.workflow.list).toHaveBeenCalledTimes(3);
  });

  it("filters out workflows that do not match the project prefix", async () => {
    const client = makeClient([
      {
        workflowId: `${PROJECT_PREFIX}validChange`,
        searchAttributes: { AdvBacklogIssueNumber: ["51"] },
      },
      {
        workflowId: "adv/change/other-pid/leaked",
        searchAttributes: { AdvBacklogIssueNumber: ["51"] },
      },
    ]);

    const map = await queryActiveChangesByIssueNumbers(client, "pid-abc", [51]);

    expect(map.size).toBe(1);
    expect(map.get(51)?.changeId).toBe("validChange");
  });
});
