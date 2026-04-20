import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const executeUpdate = vi.fn(async () => ({
    id: "ag-123",
    title: "Write docs",
    priority: "medium",
    status: "pending",
    created_at: "2026-04-20T00:00:00.000Z",
    tdd_phase: "none",
  }));
  const query = vi.fn(async () => [
    {
      id: "ag-123",
      title: "Write docs",
      priority: "medium",
      status: "pending",
      created_at: "2026-04-20T00:00:00.000Z",
      tdd_phase: "none",
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

import { agendaTools } from "./agenda";

describe("adv_agenda_add derived-export path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses project workflow update/query + writeJsonlAtomic when temporal is available", async () => {
    const result = await agendaTools.adv_agenda_add.execute(
      { title: "Write docs" },
      "/repo",
      "/home/jrede/.local/share/opencode/plugins/advance/proj123/agenda.jsonl",
    );
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
    expect(mocks.createTemporalClientBundle).toHaveBeenCalledTimes(1);
    expect(mocks.executeUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(mocks.writeJsonlAtomic).toHaveBeenCalledWith(
      "/home/jrede/.local/share/opencode/plugins/advance/proj123/agenda.jsonl",
      [
        {
          id: "ag-123",
          title: "Write docs",
          priority: "medium",
          status: "pending",
          created_at: "2026-04-20T00:00:00.000Z",
          tdd_phase: "none",
        },
      ],
    );
    expect(mocks.close).toHaveBeenCalledTimes(1);
  });
});
