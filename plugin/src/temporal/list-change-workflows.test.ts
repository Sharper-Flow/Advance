/**
 * listChangeWorkflowIds — unit tests for the Visibility-API-backed change
 * enumeration path.
 *
 * Tests cover:
 *   - Visibility query construction (AdvAffectedProjects + AdvChangeStatus filter)
 *   - Pagination correctness via async-iterator drain
 *   - Default statuses (excludes archived + closed)
 *   - Custom statuses override
 *   - Limit cap stops iteration early
 *   - Workflow IDs that don't match the change pattern are filtered
 *
 * The async iterator simulates Temporal SDK's `client.workflow.list()`
 * which already handles pagination internally — we test the consumer logic.
 */

import { describe, expect, it } from "vitest";
import { performance } from "node:perf_hooks";

import {
  listChangeWorkflowIds,
  buildVisibilityQuery,
} from "./list-change-workflows";

interface FakeWorkflow {
  workflowId: string;
  searchAttributes?: Record<string, unknown>;
}

function makeFakeClient(workflows: FakeWorkflow[]): {
  workflow: {
    list: (opts: { query: string }) => AsyncIterable<FakeWorkflow>;
  };
  lastQuery?: string;
} {
  const captured = { lastQuery: "" };
  return {
    get lastQuery() {
      return captured.lastQuery;
    },
    workflow: {
      list: (opts: { query: string }) => {
        captured.lastQuery = opts.query;
        return {
          async *[Symbol.asyncIterator]() {
            for (const wf of workflows) yield wf;
          },
        };
      },
    },
  };
}

describe("buildVisibilityQuery", () => {
  it("filters by projectId + default statuses (excludes archived + closed)", () => {
    const q = buildVisibilityQuery({
      projectId: "abc123",
    });
    expect(q).toContain('AdvAffectedProjects = "abc123"');
    expect(q).not.toContain("AdvProjectId");
    expect(q).toContain('AdvLifecycleState = "open"');
    expect(q).toContain('ExecutionStatus = "Running"');
    expect(q).not.toContain("AdvChangeStatus");
    expect(q).not.toContain('"archived"');
    expect(q).not.toContain('"closed"');
  });

  it("respects explicit statuses override", () => {
    const q = buildVisibilityQuery({
      projectId: "abc",
      statuses: ["archived"],
    });
    expect(q).toContain('"archived"');
    expect(q).not.toContain('"draft"');
    expect(q).not.toContain("ExecutionStatus");
  });

  it("adds a running execution guard for explicit active-status queries", () => {
    const q = buildVisibilityQuery({
      projectId: "abc",
      statuses: ["active"],
    });
    expect(q).toContain('AdvLifecycleState = "open"');
    expect(q).toContain('ExecutionStatus = "Running"');
  });

  it("omits status filter when statuses=null (all-statuses mode)", () => {
    const q = buildVisibilityQuery({
      projectId: "abc",
      statuses: null,
    });
    expect(q).toContain('AdvAffectedProjects = "abc"');
    expect(q).not.toContain("AdvChangeStatus");
    expect(q).not.toContain("ExecutionStatus");
  });

  it("escapes double-quotes in projectId to prevent query injection", () => {
    const q = buildVisibilityQuery({
      projectId: 'malicious"OR"1=1',
    });
    // Either reject or escape — we choose escape
    expect(q).not.toContain('"OR"1=1');
    expect(q).toContain('AdvAffectedProjects = "malicious\\"OR\\"1=1"');
  });
});

describe("listChangeWorkflowIds", () => {
  it("returns change IDs from matching workflows", async () => {
    const fakeClient = makeFakeClient([
      { workflowId: "adv/change/proj1/changeA" },
      { workflowId: "adv/change/proj1/changeB" },
    ]);
    const ids = await listChangeWorkflowIds(fakeClient, {
      projectId: "proj1",
    });
    expect(ids.sort((a, b) => a.localeCompare(b))).toEqual([
      "changeA",
      "changeB",
    ]);
  });

  it("filters out workflow IDs that do not belong to the project", async () => {
    const fakeClient = makeFakeClient([
      { workflowId: "adv/change/proj1/changeA" },
      { workflowId: "adv/change/proj2/changeStranger" },
      { workflowId: "adv/project/proj1" }, // PSW workflow, must skip
      { workflowId: "totally-unrelated" },
    ]);
    const ids = await listChangeWorkflowIds(fakeClient, {
      projectId: "proj1",
    });
    expect(ids).toEqual(["changeA"]);
  });

  it("respects the `limit` cap and stops iteration early", async () => {
    const workflows: FakeWorkflow[] = Array.from({ length: 50 }, (_, i) => ({
      workflowId: `adv/change/proj1/c${i}`,
    }));
    const fakeClient = makeFakeClient(workflows);
    const ids = await listChangeWorkflowIds(fakeClient, {
      projectId: "proj1",
      limit: 10,
    });
    expect(ids).toHaveLength(10);
  });

  it("constructs the correct visibility query for the SDK", async () => {
    const fakeClient = makeFakeClient([]);
    await listChangeWorkflowIds(fakeClient, {
      projectId: "proj1",
      statuses: ["active"],
    });
    expect(fakeClient.lastQuery).toContain('AdvAffectedProjects = "proj1"');
    expect(fakeClient.lastQuery).toContain('AdvLifecycleState = "open"');
    expect(fakeClient.lastQuery).toContain('ExecutionStatus = "Running"');
  });

  it("handles 1500 paginated results without dropping any", async () => {
    const N = 1500;
    const workflows: FakeWorkflow[] = Array.from({ length: N }, (_, i) => ({
      workflowId: `adv/change/proj1/c${i}`,
    }));
    const fakeClient = makeFakeClient(workflows);
    const ids = await listChangeWorkflowIds(fakeClient, {
      projectId: "proj1",
    });
    expect(ids).toHaveLength(N);
    // Spot-check edge ids
    expect(ids).toContain("c0");
    expect(ids).toContain("c1499");
  });

  // AC1 measurement: 552 changes in <2s p99 for the listChangeWorkflowIds path
  it("processes 552 changes well under AC1 budget (<2s p99)", async () => {
    const N = 552;
    const workflows: FakeWorkflow[] = Array.from({ length: N }, (_, i) => ({
      workflowId: `adv/change/proj1/c${i}`,
    }));

    const samples: number[] = [];
    for (let iter = 0; iter < 10; iter++) {
      const fakeClient = makeFakeClient(workflows);
      const t = performance.now();
      const ids = await listChangeWorkflowIds(fakeClient, {
        projectId: "proj1",
      });
      samples.push(performance.now() - t);
      expect(ids).toHaveLength(N);
    }

    samples.sort((a, b) => a - b);
    const p99 = samples[Math.floor(samples.length * 0.99)];
    // 2000ms is the AC1 budget; we expect orders of magnitude better in the
    // synthetic case (sub-ms). The assertion guards against pathological
    // O(N²) regressions.
    expect(p99).toBeLessThan(2000);
  });
});
