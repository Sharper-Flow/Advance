/**
 * Tests for bounded, cancellation-aware worktree registry snapshot collection.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { createMockOwnerFromClient } from "../../temporal/__tests__/mock-owner";
import { getWorktreeRegistrySnapshot, type WorktreeStateAccess } from "./state";
import {
  createInventoryBudget,
  type InventoryBudget,
} from "./inventory-budget";

const queryFn = vi.fn();
const getHandleFn = vi.hoisted(() => vi.fn(() => ({ query: queryFn })));
const listFn = vi.hoisted(() => vi.fn());
const getServiceFn = vi.hoisted(() =>
  vi.fn(() =>
    createMockOwnerFromClient({
      client: { workflow: { list: listFn, getHandle: getHandleFn } },
    }),
  ),
);

vi.mock("../../temporal/service", () => ({
  getService: getServiceFn,
}));

const access: WorktreeStateAccess = {
  projectDir: "/repo",
  projectId: "0000123000000000000000000000000000000000",
};

function stateWithWorktree(
  changeId: string,
  branch: string,
  path: string,
): Record<string, unknown> {
  return {
    changeId,
    worktrees: {
      [branch]: {
        branch,
        path,
        status: "active",
        createdAt: "2026-01-01T00:00:00Z",
        lastSeenAt: "2026-01-01T00:00:00Z",
        baseRef: "trunk",
        headSha: "abc",
        source: "tool",
        sourceVersion: 1,
      },
    },
  };
}

beforeEach(() => {
  queryFn.mockReset();
  getHandleFn.mockClear();
  getServiceFn.mockClear();
  listFn.mockReset();
  getHandleFn.mockImplementation(() => ({ query: queryFn }));
});

function mockListChangeIds(ids: string[]) {
  listFn.mockImplementation(async function* () {
    for (const id of ids) {
      yield {
        workflowId: `adv/change/0000123000000000000000000000000000000000/${id}`,
      };
    }
  });
}

function makeSequenceBudget(allowFirstN: number): InventoryBudget {
  let calls = 0;
  const controller = new AbortController();
  return {
    signal: controller.signal,
    canStartInspection() {
      return ++calls <= allowFirstN;
    },
    stopReason() {
      return calls > allowFirstN ? "internal_budget_exhausted" : undefined;
    },
    snapshot() {
      return calls > allowFirstN
        ? { complete: false, stopReason: "internal_budget_exhausted" as const }
        : { complete: true };
    },
    dispose() {},
  };
}

describe("getWorktreeRegistrySnapshot (bounded)", () => {
  it("returns complete records when no budget is exhausted", async () => {
    mockListChangeIds(["c1", "c2"]);
    queryFn
      .mockResolvedValueOnce(stateWithWorktree("c1", "change/c1", "/wt/c1"))
      .mockResolvedValueOnce(stateWithWorktree("c2", "change/c2", "/wt/c2"));

    const result = await getWorktreeRegistrySnapshot(access);

    expect(result.complete).toBe(true);
    expect(result.stopReason).toBeUndefined();
    expect(result.records).toHaveLength(2);
    expect(result.inspectedCount).toBe(2);
    expect(result.candidateCount).toBe(2);
  });

  it("returns incomplete when the internal budget is exhausted before starting", async () => {
    const budget = createInventoryBudget({ timeoutMs: 0 });
    const result = await getWorktreeRegistrySnapshot(access, { budget });

    expect(result.complete).toBe(false);
    expect(result.stopReason).toBe("internal_budget_exhausted");
    expect(result.stoppedStage).toBe("service_check");
    expect(result.records).toHaveLength(0);
    expect(result.candidateCount).toBe(0);
    expect(result.inspectedCount).toBe(0);
  });

  it("returns partial records and omits uninspected change ids when budget stops mid-queries", async () => {
    mockListChangeIds(["c1", "c2", "c3", "c4"]);
    queryFn.mockResolvedValue(stateWithWorktree("c", "change/c", "/wt/c"));

    // service_check + client_check + list_active_worktrees + worker pre-check +
    // one query_change_workflow admission = 5 allowed calls before the budget
    // closes. This leaves three change ids unstarted.
    const budget = makeSequenceBudget(5);

    const result = await getWorktreeRegistrySnapshot(access, { budget });

    expect(result.complete).toBe(false);
    expect(result.stopReason).toBe("internal_budget_exhausted");
    expect(result.records).toHaveLength(1);
    expect(result.candidateCount).toBe(4);
    expect(result.inspectedCount).toBe(1);
    expect(result.omitted).toHaveLength(3);
    const omittedIds = result.omitted?.map((o) => o.changeId);
    expect(omittedIds).toEqual(expect.arrayContaining(["c2", "c3", "c4"]));
    // Omitted change ids are never represented as clean or deletion-safe records.
    for (const id of omittedIds ?? []) {
      expect(result.records.some((r) => r.changeId === id)).toBe(false);
    }
  });

  it("caps concurrent workflow queries at four", async () => {
    mockListChangeIds(["c1", "c2", "c3", "c4", "c5", "c6"]);
    let active = 0;
    let maxActive = 0;
    queryFn.mockImplementation(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 30));
      active -= 1;
      return stateWithWorktree("c", "change/c", "/wt/c");
    });

    await getWorktreeRegistrySnapshot(access);

    expect(maxActive).toBeLessThanOrEqual(4);
  });

  it("produces stable ordering regardless of query completion order", async () => {
    mockListChangeIds(["d", "c", "b", "a"]);
    let callIndex = 0;
    getHandleFn.mockImplementation((workflowId: string) => {
      const changeId = workflowId.split("/").pop() ?? "unknown";
      const delay = callIndex++ % 2 === 0 ? 20 : 5;
      return {
        query: async () => {
          await new Promise((resolve) => setTimeout(resolve, delay));
          return stateWithWorktree(
            changeId,
            `change/${changeId}`,
            `/wt/${changeId}`,
          );
        },
      };
    });

    const result = await getWorktreeRegistrySnapshot(access);

    const recordIds = result.records.map((r) => r.changeId);
    expect(recordIds).toEqual(["a", "b", "c", "d"]);
  });

  it("stops admitting new workflow queries after caller cancellation", async () => {
    const caller = new AbortController();
    mockListChangeIds(["c1", "c2"]);
    queryFn.mockResolvedValue(stateWithWorktree("c", "change/c", "/wt/c"));
    const result = await getWorktreeRegistrySnapshot(access, {
      signal: caller.signal,
    });

    expect(result.complete).toBe(true);
    expect(result.stopReason).toBeUndefined();

    caller.abort("caller cancelled");
    const resultAfterAbort = await getWorktreeRegistrySnapshot(access, {
      signal: caller.signal,
    });

    expect(resultAfterAbort.complete).toBe(false);
    expect(resultAfterAbort.stopReason).toBe("caller_cancelled");
  });

  it("returns partial state when an admitted workflow query outlives the budget", async () => {
    mockListChangeIds(["c1", "c2"]);
    queryFn.mockImplementation(() => new Promise(() => {}));

    const result = await getWorktreeRegistrySnapshot(access, {
      timeoutMs: 10,
    });

    expect(result).toMatchObject({
      complete: false,
      stopReason: "internal_budget_exhausted",
      candidateCount: 2,
    });
    expect(result.omitted).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scope: "query_change_workflow",
          changeId: "c1",
          reason: "inventory stopped before workflow query settled",
        }),
        expect.objectContaining({
          scope: "query_change_workflow",
          changeId: "c2",
        }),
      ]),
    );
  });
});
