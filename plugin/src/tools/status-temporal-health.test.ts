import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { statusTools } from "./status";
import { createLegacyStore, type Store } from "../storage/store";
import {
  createTempDir,
  cleanupTempDir,
  createTestProject,
  parseToolOutput,
} from "../__tests__/setup";

const mocks = vi.hoisted(() => ({
  getTemporalHealth: vi.fn(async () => ({
    server_alive: true,
    worker_alive: true,
    worker_process_alive: true,
    registered_queues: ["advance-proj123"],
    last_op_at: "2026-04-21T00:00:00.000Z",
    last_error: null,
  })),
  createTemporalClientBundle: vi.fn(async () => ({
    connection: { close: vi.fn(async () => {}) },
    client: {
      workflow: {
        getHandle: vi.fn(() => ({
          query: vi.fn(async () => [
            {
              key: "project-import",
              source: "external_state",
              status: "done",
              recordedAt: "2026-04-21T00:00:01.000Z",
              detail: "imported 3 changes",
            },
          ]),
        })),
      },
    },
  })),
  canReachTemporalAddress: vi.fn(async () => true),
}));

vi.mock("../temporal/health-probe", () => ({
  getTemporalHealth: mocks.getTemporalHealth,
}));

vi.mock("../temporal/client", async () => {
  const actual =
    await vi.importActual<typeof import("../temporal/client")>(
      "../temporal/client",
    );
  return {
    ...actual,
    createTemporalClientBundle: mocks.createTemporalClientBundle,
  };
});

vi.mock("../temporal/runtime-manager", async () => {
  const actual = await vi.importActual<
    typeof import("../temporal/runtime-manager")
  >("../temporal/runtime-manager");
  return {
    ...actual,
    canReachTemporalAddress: mocks.canReachTemporalAddress,
  };
});

describe("adv_status temporal health/migration status (C4)", () => {
  let tempDir: string;
  let store: Store;

  beforeEach(async () => {
    tempDir = await createTempDir();
    await createTestProject(tempDir);
    store = await createLegacyStore(tempDir);
  });

  afterEach(async () => {
    store.close();
    await cleanupTempDir(tempDir);
    vi.clearAllMocks();
  });

  test("includes temporal_health block when probe succeeds", async () => {
    const result = await statusTools.adv_status.execute({}, store);
    const parsed = parseToolOutput(result);

    expect(parsed.temporal_health).toEqual({
      server_alive: true,
      worker_alive: true,
      worker_process_alive: true,
      registered_queues: ["advance-proj123"],
      last_op_at: "2026-04-21T00:00:00.000Z",
      last_error: null,
    });
  });

  test("includes migration_status for current project when ledger query succeeds", async () => {
    (store.paths as { external?: string }).external =
      "/home/jrede/.local/share/opencode/plugins/advance/proj123";
    const result = await statusTools.adv_status.execute({}, store);
    const parsed = parseToolOutput(result);

    expect(parsed.migration_status).toMatchObject({
      project_id: expect.any(String),
      status: "done",
      source: "external_state",
      detail: "imported 3 changes",
      recorded_at: "2026-04-21T00:00:01.000Z",
    });
  });

  test("degrades gracefully when health probe and migration query fail", async () => {
    mocks.getTemporalHealth.mockRejectedValueOnce(new Error("boom"));
    mocks.createTemporalClientBundle.mockRejectedValueOnce(
      new Error("no temporal"),
    );

    const result = await statusTools.adv_status.execute({}, store);
    const parsed = parseToolOutput(result);

    expect(parsed.temporal_health).toEqual({
      server_alive: false,
      worker_alive: false,
      worker_process_alive: false,
      registered_queues: [],
      last_op_at: null,
      last_error: "boom",
    });
    expect(parsed.migration_status).toBeNull();
  });
});
