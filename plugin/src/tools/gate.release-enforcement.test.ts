/**
 * Release-gate structural enforcement for rq-releaseFinalization01.
 */

import { describe, expect, test, vi, beforeEach } from "vitest";
import { gateTools } from "./gate";
import type { Store } from "../storage/store";
import type { Change, Gates } from "../types";

const mocks = vi.hoisted(() => {
  const handleMock = { signal: vi.fn(), query: vi.fn() };
  return {
    handleMock,
    getService: vi.fn(() => ({ client: { workflow: { getHandle: vi.fn() } } })),
    getProjectId: vi.fn(async () => "test-project-id"),
    fireSignalAndRefresh: vi.fn(async () => {}),
    querySignal: vi.fn(),
    getChangeHandle: vi.fn(() => handleMock),
    detectArchiveMode: vi.fn(() => ({ archiveMode: "direct", autoPush: true })),
    resolveMainCheckout: vi.fn(() => "/tmp/main"),
    detectDefaultBranch: vi.fn(() => ({
      branch: "trunk",
      source: "local-trunk",
    })),
    verifyChangeBranchReachable: vi.fn(() => ({
      reachable: false,
      unmergedCommits: ["abc123 task commit"],
    })),
  };
});

vi.mock("../temporal/service", () => ({ getService: mocks.getService }));
vi.mock("../utils/project-id", async () => {
  const actual = await vi.importActual<typeof import("../utils/project-id")>(
    "../utils/project-id",
  );
  return { ...actual, getProjectId: mocks.getProjectId };
});
vi.mock("./_adapters", () => ({
  fireSignalAndRefresh: mocks.fireSignalAndRefresh,
  querySignal: mocks.querySignal,
  getChangeHandle: mocks.getChangeHandle,
}));
vi.mock("./archive-helpers/git-finalize", async () => {
  const actual = await vi.importActual<
    typeof import("./archive-helpers/git-finalize")
  >("./archive-helpers/git-finalize");
  return {
    ...actual,
    detectArchiveMode: mocks.detectArchiveMode,
    resolveMainCheckout: mocks.resolveMainCheckout,
    detectDefaultBranch: mocks.detectDefaultBranch,
    verifyChangeBranchReachable: mocks.verifyChangeBranchReachable,
  };
});

function releaseReadyGates(): Gates {
  return {
    proposal: { status: "done" },
    discovery: { status: "done" },
    design: { status: "done" },
    planning: { status: "done" },
    execution: { status: "done" },
    acceptance: { status: "done" },
    release: { status: "pending" },
  } as Gates;
}

function createMockStore(): Store {
  const gates = releaseReadyGates();
  const change: Change = {
    id: "example",
    title: "Example",
    status: "active",
    created_at: "2026-01-01T00:00:00Z",
    created_by: "test",
    tasks: [],
    deltas: {},
    wisdom: [],
    gates,
  };

  return {
    paths: {
      root: "/tmp/worktree/change/example",
      changes: "/tmp/worktree/.adv/changes",
    } as Store["paths"],
    config: {
      name: "test",
      archive_mode: "direct",
      auto_push: true,
      features: { worktree_guard_enforce: false },
    } as unknown as Store["config"],
    init: vi.fn(),
    sync: vi.fn(),
    close: vi.fn(),
    flush: vi.fn(),
    specs: {} as Store["specs"],
    changes: {
      list: vi.fn(),
      get: vi.fn(async () => ({ success: true, data: change })),
      create: vi.fn(),
      save: vi.fn(),
      updateArtifacts: vi.fn(),
      close: vi.fn(),
      closeBatch: vi.fn(),
      refresh: vi.fn(async () => undefined),
    } as Store["changes"],
    tasks: {} as Store["tasks"],
    wisdom: {} as Store["wisdom"],
    gates: {} as Store["gates"],
    status: vi.fn(),
  } as unknown as Store;
}

describe("release gate trunk-merge enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.querySignal.mockReset();
    mocks.querySignal.mockResolvedValueOnce(releaseReadyGates());
    mocks.querySignal.mockResolvedValueOnce({ status: "done" });
  });

  test("rejects release completion when the change branch is not reachable from default branch", async () => {
    const result = await gateTools.adv_gate_complete.execute(
      { changeId: "example", gateId: "release", completedBy: "user:signoff" },
      createMockStore(),
    );

    const parsed = JSON.parse(result);
    expect(parsed.error).toContain("RELEASE_REQUIRES_TRUNK_MERGE");
    expect(parsed.requirement).toBe("rq-releaseFinalization01");
    expect(parsed.remediation).toContain("/adv-archive example");
    expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
  });

  test("allows release completion when the change branch is reachable", async () => {
    mocks.verifyChangeBranchReachable.mockReturnValueOnce({
      reachable: true,
      unmergedCommits: [],
    });

    const result = await gateTools.adv_gate_complete.execute(
      { changeId: "example", gateId: "release", completedBy: "user:signoff" },
      createMockStore(),
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(mocks.fireSignalAndRefresh).toHaveBeenCalledTimes(1);
  });
});
