import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { statusTools } from "./status";
import { getTemporalFallbackTelemetry } from "../temporal/fallback-telemetry";
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
    fallback_counts: getTemporalFallbackTelemetry(),
    stale_queues: [],
    reconnect_count: 0,
    op_counters: [],
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
      fallback_counts: { changes: 0, tasks: 0, wisdom: 0, gates: 0 },
      stale_queues: [],
      reconnect_count: 0,
      op_counters: [],
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
      fallback_counts: getTemporalFallbackTelemetry(),
      stale_queues: [],
      reconnect_count: 0,
    });
    expect(parsed.migration_status).toBeNull();
  });

  test("surfaces stale queue recommendation when temporal health reports stale queues", async () => {
    mocks.getTemporalHealth.mockResolvedValueOnce({
      server_alive: true,
      worker_alive: true,
      worker_process_alive: true,
      registered_queues: ["advance-proj123"],
      last_op_at: "2026-04-21T00:00:00.000Z",
      last_error: null,
      fallback_counts: getTemporalFallbackTelemetry(),
      stale_queues: [{ queue: "advance-target-proj", running_count: 42 }],
      reconnect_count: 0,
    });

    (store.paths as { external?: string }).external =
      "/home/jrede/.local/share/opencode/plugins/advance/target-proj";

    const result = await statusTools.adv_status.execute({}, store);
    const parsed = parseToolOutput(result);

    expect(parsed.temporal_health.stale_queues).toEqual([
      { queue: "advance-target-proj", running_count: 42 },
    ]);
    expect(parsed.recommendations).toEqual(
      expect.arrayContaining([expect.stringContaining("Stale Temporal queue")]),
    );
  });

  test("surfaces fast-follow lineage in active list and recommendations", async () => {
    const parentResult = await store.changes.create("Parent Change");
    const parent = await store.changes.get(parentResult.changeId);
    expect(parent.success).toBe(true);
    parent.data!.status = "archived";
    await store.changes.save(parent.data!);

    const child = await store.changes.get("addFeature");
    expect(child.success).toBe(true);
    child.data!.fast_follow_of = {
      parent_change_id: parentResult.changeId,
      linked_at: "2026-01-01T01:00:00Z",
    };
    await store.changes.save(child.data!);

    const result = await statusTools.adv_status.execute({}, store);
    const parsed = parseToolOutput(result);

    expect(parsed.formatted.activeSection).toContain("↳ addFeature");
    expect(parsed.recommendations).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          `Change \`addFeature\` (fast-follow of \`${parentResult.changeId} (archived)\`)`,
        ),
      ]),
    );
  });

  it("surfaces per-op counters in temporal_health (KD-3)", async () => {
    const result = await statusTools.adv_status.execute({}, store);
    const parsed = parseToolOutput(result);

    expect(parsed.temporal_health).toHaveProperty("op_counters");
    expect(Array.isArray(parsed.temporal_health.op_counters)).toBe(true);
  });
});
