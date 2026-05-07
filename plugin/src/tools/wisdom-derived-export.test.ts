import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const signal = vi.fn(async () => {});
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
    signal,
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
        workflow: {
          getHandle: vi.fn(() => ({ executeUpdate, query, signal })),
          start: vi.fn(async () => ({ executeUpdate, query, signal })),
        },
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

vi.mock("../utils/project-id", async () => {
  const actual = await vi.importActual<typeof import("../utils/project-id")>(
    "../utils/project-id",
  );
  return {
    ...actual,
    getProjectId: vi.fn(async () => "proj123"),
  };
});

import { wisdomTools } from "./wisdom";

describe("adv_wisdom_add signal-driven path", () => {
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

  it("fires wisdomAddedSignal to change workflow when Temporal is available", async () => {
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
      changes: { refresh: vi.fn(async () => undefined) },
    } as any;

    const result = await wisdomTools.adv_wisdom_add.execute(
      {
        changeId: "addFeature",
        type: "convention",
        content: "Always validate inputs at boundary",
        sourceTask: "tk-task0001",
        promote: false,
      },
      store,
    );
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
    expect(mocks.signal).toHaveBeenCalledTimes(1);
    const signalCall = mocks.signal.mock.calls[0];
    expect(signalCall[0].name).toBe("adv.change.wisdomAdded");
    expect(signalCall[1]).toMatchObject({
      entry: {
        type: "convention",
        content: "Always validate inputs at boundary",
        source_task: "tk-task0001",
      },
    });
    expect(store.wisdom.add).not.toHaveBeenCalled();
  });

  it("uses addProjectWisdom directly when promote=true and temporal is available", async () => {
    mocks.addProjectWisdom.mockResolvedValueOnce({
      id: "pw-123",
      type: "convention",
      content: "Always validate inputs at boundary",
      source_change: "addFeature",
      source_task: "tk-task0001",
      promoted_at: "2026-04-20T00:00:00.000Z",
    });
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
      changes: {
        refresh: vi.fn(async () => undefined),
        get: vi.fn(async () => ({
          success: true,
          data: {
            id: "addFeature",
            title: "Add Feature",
            tasks: [
              { id: "tk-task0001", title: "Done", status: "done" },
              { id: "tk-task0002", title: "Pending", status: "pending" },
            ],
          },
        })),
      },
      gates: {
        get: vi.fn(async () => ({
          proposal: { status: "done" },
          discovery: { status: "done" },
          design: { status: "pending" },
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
    // Signal-driven: wisdomAddedSignal fired first
    expect(mocks.signal).toHaveBeenCalledTimes(1);
    // Project workflow retired; addProjectWisdom is called directly
    expect(mocks.addProjectWisdom).toHaveBeenCalledTimes(1);
  });

  it("returns error when addProjectWisdom fails during promote", async () => {
    mocks.addProjectWisdom.mockRejectedValueOnce(new Error("disk full"));
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
      changes: { refresh: vi.fn(async () => undefined) },
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

    expect(parsed.error).toContain("disk full");
  });

  it("falls back to disk store when Temporal is unavailable", async () => {
    mocks.getService.mockReturnValueOnce(null);
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
      changes: { refresh: vi.fn(async () => undefined) },
    } as any;

    const result = await wisdomTools.adv_wisdom_add.execute(
      {
        changeId: "addFeature",
        type: "convention",
        content: "Always validate inputs at boundary",
        sourceTask: "tk-task0001",
        promote: false,
      },
      store,
    );
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
    expect(mocks.signal).not.toHaveBeenCalled();
    expect(store.wisdom.add).toHaveBeenCalledTimes(1);
  });
});

describe("adv_wisdom_list signal-driven path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("queries change workflow state when changeId is provided and Temporal is available", async () => {
    const stateWisdom = [
      {
        id: "ws-1",
        type: "pattern",
        content: "Use signals",
        recorded_at: "2026-05-01T00:00:00Z",
      },
      {
        id: "ws-2",
        type: "gotcha",
        content: "Beware edge cases",
        recorded_at: "2026-05-02T00:00:00Z",
      },
    ];
    mocks.query.mockResolvedValueOnce({ wisdom: stateWisdom });

    const store = {
      paths: { root: "/repo" },
      wisdom: {
        list: vi.fn(async () => []),
      },
    } as any;

    const result = await wisdomTools.adv_wisdom_list.execute(
      { changeId: "myChange", type: "pattern" },
      store,
    );
    const parsed = JSON.parse(result);

    expect(parsed.wisdom).toHaveLength(1);
    expect(parsed.wisdom[0].type).toBe("pattern");
    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(store.wisdom.list).not.toHaveBeenCalled();
  });

  it("falls back to disk store when Temporal is unavailable", async () => {
    mocks.getService.mockReturnValueOnce(null);

    const store = {
      paths: { root: "/repo" },
      wisdom: {
        list: vi.fn(async () => [
          {
            id: "ws-1",
            type: "pattern",
            content: "Use signals",
            recorded_at: "2026-05-01T00:00:00Z",
          },
        ]),
      },
    } as any;

    const result = await wisdomTools.adv_wisdom_list.execute(
      { changeId: "myChange" },
      store,
    );
    const parsed = JSON.parse(result);

    expect(parsed.wisdom).toHaveLength(1);
    expect(store.wisdom.list).toHaveBeenCalledTimes(1);
  });
});

describe("adv_project_wisdom_list signal-driven path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads project wisdom from disk when Temporal is available", async () => {
    mocks.listProjectWisdom.mockResolvedValueOnce([
      {
        id: "pw-1",
        type: "convention",
        content: "Validate inputs",
        source_task: "tk-1",
        promoted_at: "2026-05-01T00:00:00Z",
      },
    ]);

    const store = {
      paths: { root: "/repo", wisdom: "/ext/wisdom.jsonl" },
    } as any;

    const result = await wisdomTools.adv_project_wisdom_list.execute({}, store);
    const parsed = JSON.parse(result);

    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0].type).toBe("convention");
    expect(mocks.listProjectWisdom).toHaveBeenCalledTimes(1);
  });

  it("falls back to disk read when Temporal is unavailable", async () => {
    mocks.getService.mockReturnValueOnce(null);
    mocks.listProjectWisdom.mockResolvedValueOnce([
      {
        id: "pw-1",
        type: "convention",
        content: "Validate inputs",
        source_task: "tk-1",
        promoted_at: "2026-05-01T00:00:00Z",
      },
    ]);

    const store = {
      paths: { root: "/repo", wisdom: "/ext/wisdom.jsonl" },
    } as any;

    const result = await wisdomTools.adv_project_wisdom_list.execute({}, store);
    const parsed = JSON.parse(result);

    expect(parsed.entries).toHaveLength(1);
    expect(mocks.listProjectWisdom).toHaveBeenCalledTimes(1);
  });
});
