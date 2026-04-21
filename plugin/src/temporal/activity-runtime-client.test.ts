import { beforeEach, describe, expect, it, vi } from "vitest";

const clientMocks = vi.hoisted(() => ({
  connectionClose: vi.fn(async () => {}),
  createTemporalClientBundle: vi.fn(async () => ({
    connection: { close: clientMocks.connectionClose },
    client: {
      workflow: {
        start: vi.fn(async () => ({ query: vi.fn(), executeUpdate: vi.fn() })),
        getHandle: vi.fn(),
      },
    },
  })),
  migrateProjectState: vi.fn(async () => ({})),
  reImportChangeState: vi.fn(async () => ({})),
}));

vi.mock("./client", async () => {
  const actual = await vi.importActual<typeof import("./client")>("./client");
  return {
    ...actual,
    createTemporalClientBundle: clientMocks.createTemporalClientBundle,
  };
});

vi.mock("./migration", () => ({
  migrateProjectState: clientMocks.migrateProjectState,
  reImportChangeState: clientMocks.reImportChangeState,
}));

vi.mock("../storage/agenda", () => ({
  loadAgenda: vi.fn(async () => ({ items: [] })),
}));

vi.mock("../storage/project-wisdom", () => ({
  listProjectWisdom: vi.fn(async () => []),
}));

vi.mock("../storage/json", () => ({
  loadAllChanges: vi.fn(async () => new Map()),
}));

import { migrateSingleProjectActivity } from "./migrate-runner";

describe("migrateSingleProjectActivity runtime client bootstrap (A3d)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("bootstraps a Temporal client from env when no client is injected", async () => {
    const result = await migrateSingleProjectActivity({
      projectPath: "/tmp/proj-env",
      loadProject: async () => ({
        projectId: "proj-env",
        initializedAt: "2026-04-20T00:00:00.000Z",
        agenda: [],
        projectWisdom: [],
        migrationLedger: [],
        changes: [],
      }),
    });

    expect(clientMocks.createTemporalClientBundle).toHaveBeenCalledTimes(1);
    expect(clientMocks.createTemporalClientBundle).toHaveBeenCalledWith(
      expect.any(Object),
    );
    expect(clientMocks.connectionClose).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("done");
  });

  it("does NOT bootstrap a runtime client when one is injected (test-injection path)", async () => {
    const injected = {
      workflow: {
        start: vi.fn(),
        getHandle: vi.fn(),
      },
    };

    await migrateSingleProjectActivity({
      projectPath: "/tmp/proj-injected",
      client: injected as unknown as {
        workflow: Parameters<
          typeof migrateSingleProjectActivity
        >[0]["client"] extends { workflow: infer W } | undefined
          ? W
          : never;
      },
      loadProject: async () => ({
        projectId: "proj-injected",
        initializedAt: "2026-04-20T00:00:00.000Z",
        agenda: [],
        projectWisdom: [],
        migrationLedger: [],
        changes: [],
      }),
    });

    expect(clientMocks.createTemporalClientBundle).not.toHaveBeenCalled();
    expect(clientMocks.connectionClose).not.toHaveBeenCalled();
  });

  it("closes the bootstrapped connection even when the activity fails", async () => {
    clientMocks.migrateProjectState.mockRejectedValueOnce(
      new Error("simulated migrateProjectState failure"),
    );

    const result = await migrateSingleProjectActivity({
      projectPath: "/tmp/proj-fail",
      loadProject: async () => ({
        projectId: "proj-fail",
        initializedAt: "2026-04-20T00:00:00.000Z",
        agenda: [],
        projectWisdom: [],
        migrationLedger: [],
        changes: [],
      }),
    });

    expect(result).toEqual({
      projectId: "proj-fail",
      migratedChanges: 0,
      status: "failed",
      detail: "simulated migrateProjectState failure",
    });
    expect(clientMocks.connectionClose).toHaveBeenCalledTimes(1);
  });
});
