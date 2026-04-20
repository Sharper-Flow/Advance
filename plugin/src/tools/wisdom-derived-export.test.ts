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
  return {
    executeUpdate,
    query,
    close,
    createTemporalClientBundle: vi.fn(async () => ({
      connection: { close },
      client: { workflow: { getHandle: vi.fn(() => ({ executeUpdate, query })) } },
    })),
    writeJsonlAtomic: vi.fn(async () => {}),
  };
});

vi.mock("../temporal/client", async () => {
  const actual = await vi.importActual<typeof import("../temporal/client")>("../temporal/client");
  return {
    ...actual,
    createTemporalClientBundle: mocks.createTemporalClientBundle,
  };
});

vi.mock("../storage/jsonl-atomic-writer", () => ({
  writeJsonlAtomic: mocks.writeJsonlAtomic,
}));

import { wisdomTools } from "./wisdom";

describe("adv_wisdom_add derived-export path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses project workflow update/query + writeJsonlAtomic when promote=true and temporal is available", async () => {
    const store = {
      paths: {
        root: "/repo",
        wisdom: "/home/jrede/.local/share/opencode/plugins/advance/proj123/wisdom.jsonl",
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
    expect(mocks.createTemporalClientBundle).toHaveBeenCalledTimes(1);
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
    expect(mocks.close).toHaveBeenCalledTimes(1);
  });
});
