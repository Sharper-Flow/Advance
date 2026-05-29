/**
 * Tests for the revived getWorktreeRecord and the read-only
 * worktreeExistsForChange existence probe (Phase G, GFD-6).
 *
 * getWorktreeRecord reads the durable change-workflow `worktrees` map (the same
 * structural source as getWorktreeRegistrySnapshot) instead of returning a null
 * stub. worktreeExistsForChange applies the GFD-2 setup-ready predicate and is
 * the structural authority for the worktree-isolation guard ALLOW path
 * (rq-worktreeMutationGuard01.4).
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

const queryFn = vi.hoisted(() => vi.fn());
const getHandleFn = vi.hoisted(() => vi.fn(() => ({ query: queryFn })));
const getServiceFn = vi.hoisted(() =>
  vi.fn(() => ({
    connection: { close: vi.fn() },
    client: { workflow: { getHandle: getHandleFn } },
  })),
);

vi.mock("../../temporal/service", () => ({
  getService: getServiceFn,
}));

import {
  getWorktreeRecord,
  worktreeExistsForChange,
  type WorktreeStateAccess,
} from "./state";

const access: WorktreeStateAccess = {
  projectDir: "/repo",
  projectId: "proj-123",
};

function stateWithWorktree(
  changeId: string,
  branch: string,
  record: Record<string, unknown>,
) {
  return {
    changeId,
    worktrees: { [branch]: record },
  };
}

beforeEach(() => {
  queryFn.mockReset();
  getHandleFn.mockClear();
  getServiceFn.mockClear();
});

describe("getWorktreeRecord", () => {
  it("returns the workflow worktrees record for a change branch (revived path)", async () => {
    queryFn.mockResolvedValueOnce(
      stateWithWorktree("myChange", "change/myChange", {
        branch: "change/myChange",
        path: "/wt/change/myChange",
        status: "active",
        setupReady: true,
        materialized: true,
        createdAt: "2026-01-01T00:00:00Z",
        lastSeenAt: "2026-01-01T00:00:00Z",
        baseRef: "trunk",
        headSha: "abc123",
        source: "adv",
        sourceVersion: 1,
      }),
    );

    const record = await getWorktreeRecord(access, "change/myChange");
    expect(record).not.toBeNull();
    expect(record?.path).toBe("/wt/change/myChange");
    expect(record?.setupReady).toBe(true);
    expect(record?.materialized).toBe(true);
    expect(record?.changeId).toBe("myChange");
    expect(getHandleFn).toHaveBeenCalledWith("adv/change/proj-123/myChange");
  });

  it("returns null for a non-change branch", async () => {
    const record = await getWorktreeRecord(access, "feature/foo");
    expect(record).toBeNull();
    expect(getServiceFn).not.toHaveBeenCalled();
  });

  it("returns null when the branch has no record in the worktrees map", async () => {
    queryFn.mockResolvedValueOnce({ changeId: "myChange", worktrees: {} });
    const record = await getWorktreeRecord(access, "change/myChange");
    expect(record).toBeNull();
  });

  it("returns null when the workflow query throws (unknown existence)", async () => {
    queryFn.mockRejectedValueOnce(new Error("workflow unreachable"));
    const record = await getWorktreeRecord(access, "change/myChange");
    expect(record).toBeNull();
  });

  it("returns null when the Temporal service is unavailable", async () => {
    getServiceFn.mockReturnValueOnce(undefined as never);
    const record = await getWorktreeRecord(access, "change/myChange");
    expect(record).toBeNull();
  });
});

describe("worktreeExistsForChange (GFD-2 predicate)", () => {
  function mockRecord(record: Record<string, unknown> | undefined) {
    queryFn.mockResolvedValueOnce(
      record
        ? stateWithWorktree("c", "change/c", record)
        : { changeId: "c", worktrees: {} },
    );
  }

  const ready = {
    branch: "change/c",
    path: "/wt/change/c",
    status: "active",
    setupReady: true,
    materialized: true,
    createdAt: "2026-01-01T00:00:00Z",
    lastSeenAt: "2026-01-01T00:00:00Z",
    baseRef: "trunk",
    headSha: "abc",
    source: "adv",
    sourceVersion: 1,
  };

  it("returns true for a materialized setup-ready worktree", async () => {
    mockRecord(ready);
    expect(await worktreeExistsForChange(access, "c")).toBe(true);
  });

  it("returns false for a setup_failed record", async () => {
    mockRecord({ ...ready, status: "setup_failed" });
    expect(await worktreeExistsForChange(access, "c")).toBe(false);
  });

  it("returns false for a setupReady:false record", async () => {
    mockRecord({ ...ready, setupReady: false });
    expect(await worktreeExistsForChange(access, "c")).toBe(false);
  });

  it("returns false for a deleted record", async () => {
    mockRecord({ ...ready, status: "deleted" });
    expect(await worktreeExistsForChange(access, "c")).toBe(false);
  });

  it("returns false when path is missing", async () => {
    mockRecord({ ...ready, path: undefined });
    expect(await worktreeExistsForChange(access, "c")).toBe(false);
  });

  it("returns false when no record exists", async () => {
    mockRecord(undefined);
    expect(await worktreeExistsForChange(access, "c")).toBe(false);
  });

  it("returns false on Temporal-unavailable (never ALLOW on unknown existence)", async () => {
    getServiceFn.mockReturnValueOnce(undefined as never);
    expect(await worktreeExistsForChange(access, "c")).toBe(false);
  });
});
