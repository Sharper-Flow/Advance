import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const executeUpdate = vi.fn(async () => ({
    id: "pw-123",
    type: "convention",
    content: "Always validate inputs at boundary",
    sourceChange: "addFeature",
    sourceTask: "tk-task0001",
    promotedAt: "2026-04-20T00:00:00.000Z",
  }));
  const query = vi.fn(async () => [
    {
      id: "pw-123",
      type: "convention",
      content: "Always validate inputs at boundary",
      sourceChange: "addFeature",
      sourceTask: "tk-task0001",
      promotedAt: "2026-04-20T00:00:00.000Z",
    },
  ]);
  const close = vi.fn(async () => {});
  const addProjectWisdom = vi.fn(async () => ({
    id: "pw-fallback",
    type: "convention",
    content: "Always validate inputs at boundary",
    source_change: "addFeature",
    source_task: "tk-task0001",
    promoted_at: "2026-04-20T00:00:00.000Z",
  }));
  const compactProjectWisdom = vi.fn(async () => {});
  const listProjectWisdom = vi.fn(async () => []);
  return {
    executeUpdate,
    query,
    close,
    canReachTemporalAddress: vi.fn(async () => true),
    getTemporalWorkerAliveness: vi.fn(() => true),
    getRegisteredTemporalWorkerQueues: vi.fn(() => ["advance-proj123"]),
    addProjectWisdom,
    compactProjectWisdom,
    listProjectWisdom,
    getService: vi.fn(() => ({
      connection: { close },
      client: {
        workflow: { getHandle: vi.fn(() => ({ executeUpdate, query })) },
      },
    })),
    writeJsonlAtomic: vi.fn(async () => {}),
  };
});

vi.mock("../temporal/service", async () => {
  const actual = await vi.importActual<typeof import("../temporal/service")>(
    "../temporal/service",
  );
  return {
    ...actual,
    getService: mocks.getService,
  };
});

vi.mock("../storage/jsonl-atomic-writer", () => ({
  writeJsonlAtomic: mocks.writeJsonlAtomic,
}));

vi.mock("../storage/project-wisdom", () => ({
  addProjectWisdom: mocks.addProjectWisdom,
  compactProjectWisdom: mocks.compactProjectWisdom,
  listProjectWisdom: mocks.listProjectWisdom,
}));

vi.mock("../temporal/runtime-manager", async () => {
  const actual = await vi.importActual<
    typeof import("../temporal/runtime-manager")
  >("../temporal/runtime-manager");
  return {
    ...actual,
    canReachTemporalAddress: mocks.canReachTemporalAddress,
  };
});

vi.mock("../plugin-init", async () => {
  const actual =
    await vi.importActual<typeof import("../plugin-init")>("../plugin-init");
  return {
    ...actual,
    getTemporalWorkerAliveness: mocks.getTemporalWorkerAliveness,
    getRegisteredTemporalWorkerQueues: mocks.getRegisteredTemporalWorkerQueues,
  };
});

import { wisdomTools } from "./wisdom";

describe("adv_wisdom_add derived-export path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listProjectWisdom.mockResolvedValue([]);
    mocks.canReachTemporalAddress.mockResolvedValue(true);
    mocks.getTemporalWorkerAliveness.mockReturnValue(true);
    mocks.getRegisteredTemporalWorkerQueues.mockReturnValue([
      "advance-proj123",
    ]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses project workflow update/query + writeJsonlAtomic when promote=true and temporal is available", async () => {
    const store = {
      paths: {
        root: "/repo",
        wisdom:
          "/home/jrede/.local/share/opencode/plugins/advance/proj123/wisdom.jsonl",
      },
      wisdom: {
        add: vi.fn(async () => ({
          id: "ws-1",
          type: "convention",
          content: "Always validate inputs at boundary",
          source_task: "tk-task0001",
          recorded_at: "2026-04-20T00:00:00.000Z",
        })),
      },
    } as any;

    const result = await wisdomTools.adv_wisdom_add.execute(
      {
        changeId: "addFeature",
        type: "convention",
        content: "Always validate inputs at boundary",
        sourceTask: "tk-task0001",
        promote: true,
      },
      store,
    );
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
    expect(mocks.executeUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(mocks.writeJsonlAtomic).toHaveBeenCalledWith(
      "/home/jrede/.local/share/opencode/plugins/advance/proj123/wisdom.jsonl",
      [
        {
          id: "pw-123",
          type: "convention",
          content: "Always validate inputs at boundary",
          source_change: "addFeature",
          source_task: "tk-task0001",
          promoted_at: "2026-04-20T00:00:00.000Z",
          tags: undefined,
          invalidated_by: undefined,
        },
      ],
    );
    expect(mocks.addProjectWisdom).not.toHaveBeenCalled();
    expect(mocks.close).toHaveBeenCalledTimes(1);
  });

  it("returns success+warning and does NOT fall back to addProjectWisdom when derived wisdom.jsonl write fails after workflow update", async () => {
    mocks.writeJsonlAtomic.mockRejectedValueOnce(new Error("disk full"));
    const store = {
      paths: {
        root: "/repo",
        wisdom:
          "/home/jrede/.local/share/opencode/plugins/advance/proj123/wisdom.jsonl",
      },
      wisdom: {
        add: vi.fn(async () => ({
          id: "ws-legacy-should-not-run",
          type: "convention",
          content: "duplicate",
        })),
      },
    } as any;

    const result = await wisdomTools.adv_wisdom_add.execute(
      {
        changeId: "addFeature",
        type: "convention",
        content: "Always validate inputs at boundary",
        sourceTask: "tk-task0001",
        promote: true,
      },
      store,
    );
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
    expect(parsed.warning).toContain("derived wisdom.jsonl write failed");
    expect(store.wisdom.add).toHaveBeenCalledTimes(1); // change-level wisdom only
    expect(mocks.executeUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.addProjectWisdom).not.toHaveBeenCalled();
  });

  it("falls back immediately without opening Temporal client when fast preflight fails", async () => {
    mocks.canReachTemporalAddress.mockResolvedValueOnce(false);
    const store = {
      paths: {
        root: "/repo",
        wisdom:
          "/home/jrede/.local/share/opencode/plugins/advance/proj123/wisdom.jsonl",
      },
      wisdom: {
        add: vi.fn(async () => ({
          id: "ws-1",
          type: "convention",
          content: "Always validate inputs at boundary",
          source_task: "tk-task0001",
          recorded_at: "2026-04-20T00:00:00.000Z",
        })),
      },
    } as any;

    const result = await wisdomTools.adv_wisdom_add.execute(
      {
        changeId: "addFeature",
        type: "convention",
        content: "Always validate inputs at boundary",
        sourceTask: "tk-task0001",
        promote: true,
      },
      store,
    );
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
    expect(mocks.addProjectWisdom).toHaveBeenCalledTimes(1);
  });
});
