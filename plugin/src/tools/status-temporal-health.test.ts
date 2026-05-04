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
  getTemporalWorkerAliveness: vi.fn(() => true),
  getTemporalWorkerDiagnostics: vi.fn(() => [
    {
      kind: "out_of_process",
      queues: ["advance-proj123"],
      failedQueues: [],
      alive: true,
      diagnostics: { childPid: 4321, childRunning: true },
    },
  ]),
  getService: vi.fn(() => null),
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

vi.mock("../plugin-init", async () => {
  const actual =
    await vi.importActual<typeof import("../plugin-init")>("../plugin-init");
  return {
    ...actual,
    getTemporalWorkerAliveness: mocks.getTemporalWorkerAliveness,
    getTemporalWorkerDiagnostics: mocks.getTemporalWorkerDiagnostics,
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
    const result = await statusTools.adv_status.execute(
      { view: "health" },
      store,
    );
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

  test("renders worker lock and worker-run errors in formatted health section", async () => {
    mocks.getTemporalHealth.mockResolvedValueOnce({
      server_alive: true,
      worker_alive: false,
      worker_process_alive: false,
      registered_queues: ["advance-proj123"],
      last_op_at: "2026-04-21T00:00:00.000Z",
      last_error: null,
      fallback_counts: getTemporalFallbackTelemetry(),
      stale_queues: [],
      reconnect_count: 0,
      op_counters: [],
      worker_lock: {
        holder_pid: 4242,
        last_heartbeat_at: "2026-04-21T00:00:02.000Z",
        heartbeat_age_ms: 1234,
        schema_version: 2,
      },
      last_worker_run_error: {
        queue: "advance-proj123",
        message: "Worker.run rejected",
        at: "2026-04-21T00:00:03.000Z",
      },
    });

    const result = await statusTools.adv_status.execute(
      { view: "health" },
      store,
    );
    const parsed = parseToolOutput(result);

    expect(parsed.formatted.healthSection).toContain(
      "Worker lock: pid=4242 v2 heartbeat=1234ms last=2026-04-21T00:00:02.000Z",
    );
    expect(parsed.formatted.healthSection).toContain(
      "Last worker run error: advance-proj123: Worker.run rejected @ 2026-04-21T00:00:03.000Z",
    );
  });

  test("omits null worker lock and worker-run error from formatted health section", async () => {
    mocks.getTemporalHealth.mockResolvedValueOnce({
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
      worker_lock: null,
      last_worker_run_error: null,
    });

    const result = await statusTools.adv_status.execute(
      { view: "health" },
      store,
    );
    const parsed = parseToolOutput(result);

    expect(parsed.formatted.healthSection).not.toContain("Worker lock:");
    expect(parsed.formatted.healthSection).not.toContain(
      "Last worker run error:",
    );
  });

  test("includes migration_status for current project when ledger query succeeds", async () => {
    (store.paths as { external?: string }).external =
      "/home/jrede/.local/share/opencode/plugins/advance/proj123";
    const result = await statusTools.adv_status.execute(
      { view: "health" },
      store,
    );
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

    const result = await statusTools.adv_status.execute(
      { view: "health" },
      store,
    );
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
      op_counters: [],
      worker_lock: null,
      last_worker_run_error: null,
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

    const result = await statusTools.adv_status.execute(
      { view: "health" },
      store,
    );
    const parsed = parseToolOutput(result);

    expect(parsed.temporal_health.stale_queues).toEqual([
      { queue: "advance-target-proj", running_count: 42 },
    ]);
    expect(parsed.recommendations).toEqual(
      expect.arrayContaining([expect.stringContaining("Stale Temporal queue")]),
    );
  });

  test("#33 suppresses stale queue recommendation when serviceability is proven by fresh poller", async () => {
    mocks.getTemporalWorkerAliveness.mockReturnValue(false);
    mocks.getTemporalWorkerDiagnostics.mockReturnValue([]);
    mocks.getTemporalHealth.mockResolvedValueOnce({
      server_alive: true,
      worker_alive: false,
      worker_process_alive: false,
      registered_queues: [],
      last_op_at: "2026-04-21T00:00:00.000Z",
      last_error: null,
      fallback_counts: getTemporalFallbackTelemetry(),
      stale_queues: [{ queue: "advance-target-proj", running_count: 42 }],
      reconnect_count: 0,
      op_counters: [],
      worker_lock: null,
      last_worker_run_error: null,
    });
    mocks.getService.mockReturnValueOnce({
      namespace: "default",
      connection: {
        workflowService: {
          describeTaskQueue: vi.fn(async () => ({
            pollers: [{ lastAccessTime: new Date() }],
          })),
        },
      },
    } as any);

    (store.paths as { external?: string }).external =
      "/home/jrede/.local/share/opencode/plugins/advance/target-proj";

    const result = await statusTools.adv_status.execute(
      { view: "health" },
      store,
    );
    const parsed = parseToolOutput(result);

    expect(parsed.temporal_queue_serviceability.status).toBe("serviceable");
    expect(parsed.temporal_queue_serviceability.confidence).toBe("server");
    expect(parsed.recommendations).not.toEqual(
      expect.arrayContaining([expect.stringContaining("Stale Temporal queue")]),
    );
  });

  test("renders target queue serviceability separately from worker process health", async () => {
    mocks.getTemporalWorkerAliveness.mockReturnValue(false);
    mocks.getTemporalWorkerDiagnostics.mockReturnValue([]);
    mocks.getTemporalHealth.mockResolvedValueOnce({
      server_alive: true,
      worker_alive: false,
      worker_process_alive: false,
      registered_queues: [],
      last_op_at: "2026-04-21T00:00:00.000Z",
      last_error: null,
      fallback_counts: getTemporalFallbackTelemetry(),
      stale_queues: [{ queue: "advance-target-proj", running_count: 42 }],
      reconnect_count: 0,
      op_counters: [],
      worker_lock: {
        holder_pid: 4242,
        last_heartbeat_at: null,
        heartbeat_age_ms: null,
        schema_version: 1,
      },
      last_worker_run_error: null,
    });
    (store.paths as { external?: string }).external =
      "/home/jrede/.local/share/opencode/plugins/advance/target-proj";

    const result = await statusTools.adv_status.execute(
      { view: "health" },
      store,
    );
    const parsed = parseToolOutput(result);

    expect(parsed.diagnostics.temporalWorker).toBe("degraded");
    expect(parsed.temporal_queue_serviceability).toMatchObject({
      projectId: "target-proj",
      expectedQueue: "advance-target-proj",
      status: "not_serviceable",
    });
    expect(parsed.formatted.healthSection).toContain(
      "Queue serviceability: not_serviceable",
    );
    expect(parsed.formatted.healthSection).toContain(
      "Worker process: degraded",
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

    const result = await statusTools.adv_status.execute(
      { view: "health" },
      store,
    );
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
    const result = await statusTools.adv_status.execute(
      { view: "health" },
      store,
    );
    const parsed = parseToolOutput(result);

    expect(parsed.temporal_health).toHaveProperty("op_counters");
    expect(Array.isArray(parsed.temporal_health.op_counters)).toBe(true);
  });
});
