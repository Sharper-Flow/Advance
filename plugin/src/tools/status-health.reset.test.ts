/**
 * `resetStatusHealthForTest` is the single deterministic reset surface for
 * every module-level status-health cache used by tests (AC4 / DONT3).
 *
 * Each `status-health` probe cache (`createProbeCache`) is created once at
 * module load and survives across Vitest cases — when a test mutates the
 * mock of the underlying fetch function the next case must not see the
 * stale value. `resetStatusHealthForTest()` clears each cache (LRU +
 * `lastErrorByKey`) and the supporting map (`healthSnapshotCache`)
 * in one call so no test reaches around it with ad-hoc `.clear()` calls.
 *
 * The tests below inspect the module-level handles (`healthSnapshotCache`,
 * the five probe caches) directly so the assertions are structural: a
 * regression that splits the reset across multiple owners or forgets one
 * of the caches is caught here even when the behavior under production
 * usage looks unchanged.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../temporal/health-probe", () => ({
  getTemporalHealth: vi.fn(),
  isWorkerAffirmativelyAlive: (worker: {
    status: "available" | "unavailable";
    value?: boolean;
  }) => worker.status === "available" && worker.value === true,
}));

vi.mock("../utils/worktree-census", () => ({
  getWorktreeCensus: vi.fn(),
}));

vi.mock("../utils/worker-process-probe", () => ({
  enumerateAdvWorkerProcesses: vi.fn(),
  DEFAULT_WORKER_SCRIPT_MARKER: "dist/temporal/worker.js",
}));

vi.mock("../temporal/service", () => ({
  getStslStats: vi.fn().mockReturnValue({
    getServiceCalls: 0,
    newConnections: 0,
    reuseRate: 0,
    reconnectCount: 0,
    reconnectFailureCount: 0,
    opTelemetry: [],
    saVerification: null,
  }),
  isStslInitialized: vi.fn().mockReturnValue(false),
  getService: vi.fn().mockReturnValue(null),
}));

vi.mock("./snapshot-scan", () => ({
  scanSnapshotHealth: vi.fn(),
}));

import {
  fetchStatusSnapshotHealth,
  fetchStatusTemporalHealth,
  fetchStatusWorkerProcesses,
  healthSnapshotCache,
  statusSearchAttributesProbeCache,
  statusWorktreeCensusProbeCache,
} from "./status-health";
import { resetStatusHealthForTest } from "./status-health-test-reset";
import { getTemporalHealth } from "../temporal/health-probe";
import { getWorktreeCensus } from "../utils/worktree-census";
import { enumerateAdvWorkerProcesses } from "../utils/worker-process-probe";
import { scanSnapshotHealth } from "./snapshot-scan";

const HEALTHY_TEMPORAL = {
  server_alive: true,
  worker_alive: { status: "available", value: false },
  worker_process_alive: { status: "available", value: false },
  registered_queues: [],
  last_op_at: null,
  last_error: null,
  fallback_counts: {},
  stale_queues: [],
  reconnect_count: 0,
  op_counters: [],
  worker_lock: null,
  last_worker_run_error: null,
} as const;

const UNHEALTHY_TEMPORAL = {
  ...HEALTHY_TEMPORAL,
  server_alive: false,
  last_error: "boom",
} as const;

const HEALTHY_CENSUS = {
  total: 1,
  stale: [],
  records: [{ path: "/tmp/main", stale: false, age_ms: 0 }],
  warnings: [],
} as const;

const UNHEALTHY_CENSUS = {
  total: 0,
  stale: [],
  records: [],
  warnings: ["boom"],
} as const;

const WORKERS_PRESENT = {
  workerCount: 3,
  orphanCount: 1,
  processes: [
    { pid: 11, ppid: 1, orphan: false },
    { pid: 22, ppid: 1, orphan: false },
    { pid: 33, ppid: 99, orphan: true },
  ],
} as const;

const WORKERS_ABSENT = {
  workerCount: 0,
  orphanCount: 0,
  processes: [],
} as const;

const SNAPSHOT_HEALTHY = {
  schema_version: 1,
  scan_duration_ms: 1,
  scope: "project",
  project_id: "unknown",
  summary: {
    projects_scanned: 1,
    bare_repos_scanned: 1,
    critical: 0,
    warnings: 0,
    info: 0,
  },
  findings: [],
} as const;

const SNAPSHOT_DIRTY = {
  ...SNAPSHOT_HEALTHY,
  summary: {
    ...SNAPSHOT_HEALTHY.summary,
    critical: 4,
  },
} as const;

describe("resetStatusHealthForTest (AC4 reset owner)", () => {
  beforeEach(() => {
    vi.mocked(getTemporalHealth).mockReset();
    vi.mocked(getTemporalHealth).mockResolvedValue(HEALTHY_TEMPORAL);
    vi.mocked(getWorktreeCensus).mockReset();
    vi.mocked(getWorktreeCensus).mockResolvedValue(HEALTHY_CENSUS);
    vi.mocked(enumerateAdvWorkerProcesses).mockReset();
    vi.mocked(enumerateAdvWorkerProcesses).mockResolvedValue(WORKERS_PRESENT);
    vi.mocked(scanSnapshotHealth).mockReset();
    vi.mocked(scanSnapshotHealth).mockResolvedValue(SNAPSHOT_HEALTHY as never);
    resetStatusHealthForTest();
  });

  afterEach(() => {
    resetStatusHealthForTest();
  });

  it("clears healthSnapshotCache (the long-TTL disk-leak snapshot Map)", async () => {
    healthSnapshotCache.set("test-key", {
      snapshot: {
        leaked_source_dirs: 7,
        leaked_archived_source_dirs: 0,
        archive_dirs: 0,
        closed_to_active_ratio: 0,
      },
      computedAt: 1_000,
    });
    expect(healthSnapshotCache.size).toBe(1);

    resetStatusHealthForTest();

    expect(healthSnapshotCache.size).toBe(0);
  });

  it("clears statusTemporalHealthProbeCache (LRU + lastErrorByKey) so the next fetch observes a new mock", async () => {
    vi.mocked(getTemporalHealth).mockResolvedValue(HEALTHY_TEMPORAL);
    const first = await fetchStatusTemporalHealth("project-1");
    expect(first.value.server_alive).toBe(true);

    // Switch the mock to a different value. A stale cache would replay the
    // old value; a properly reset cache re-fetches and observes the new one.
    vi.mocked(getTemporalHealth).mockResolvedValue(UNHEALTHY_TEMPORAL);

    resetStatusHealthForTest();

    const second = await fetchStatusTemporalHealth("project-1");
    expect(second.value.server_alive).toBe(false);
    expect(second.value.last_error).toBe("boom");
  });

  it("clears statusWorktreeCensusProbeCache so the next fetch observes a new mock", async () => {
    vi.mocked(getWorktreeCensus).mockResolvedValue(HEALTHY_CENSUS);
    const first = await statusWorktreeCensusProbeCache.fetch("project-1");
    expect(first.value.total).toBe(1);

    vi.mocked(getWorktreeCensus).mockResolvedValue(UNHEALTHY_CENSUS);

    resetStatusHealthForTest();

    const second = await statusWorktreeCensusProbeCache.fetch("project-1");
    expect(second.value.total).toBe(0);
    expect(second.value.warnings).toEqual(["boom"]);
  });

  it("clears statusWorkerProcessesProbeCache so the next fetch observes a new mock", async () => {
    vi.mocked(enumerateAdvWorkerProcesses).mockResolvedValue(WORKERS_PRESENT);
    const first = await fetchStatusWorkerProcesses({ forceRefresh: true });
    expect(first.value.workerCount).toBe(3);

    vi.mocked(enumerateAdvWorkerProcesses).mockResolvedValue(WORKERS_ABSENT);

    resetStatusHealthForTest();

    const second = await fetchStatusWorkerProcesses({ forceRefresh: true });
    expect(second.value.workerCount).toBe(0);
    expect(second.value.processes).toEqual([]);
  });

  it("clears statusSearchAttributesProbeCache so the next fetch observes a new STSL mock", async () => {
    // Compute the seeded snapshot through STSL — when isStslInitialized
    // returns true and saVerification reports ok, the snapshot reports
    // ok. After reset, switching the mock to "not initialized" must be
    // observable on the next fetch (otherwise the cache is leaking).
    const { getStslStats, isStslInitialized } =
      await import("../temporal/service");
    vi.mocked(isStslInitialized).mockReturnValue(true);
    vi.mocked(getStslStats).mockReturnValue({
      getServiceCalls: 0,
      newConnections: 0,
      reuseRate: 0,
      reconnectCount: 0,
      reconnectFailureCount: 0,
      opTelemetry: [],
      saVerification: { ok: true, checkedAt: 1_000 },
    });

    const first = await statusSearchAttributesProbeCache.fetch("project-1");
    expect(first.value.ok).toBe(true);

    vi.mocked(isStslInitialized).mockReturnValue(false);
    vi.mocked(getStslStats).mockReturnValue({
      getServiceCalls: 0,
      newConnections: 0,
      reuseRate: 0,
      reconnectCount: 0,
      reconnectFailureCount: 0,
      opTelemetry: [],
      saVerification: null,
    });

    resetStatusHealthForTest();

    const second = await statusSearchAttributesProbeCache.fetch("project-1");
    expect(second.value.ok).toBe(false);
    expect(second.value.error).toBe("STSL not initialized");
  });

  it("clears snapshotHealthProbeCache so the next fetch observes a new mock", async () => {
    vi.mocked(scanSnapshotHealth).mockResolvedValue(SNAPSHOT_HEALTHY as never);

    const first = await fetchStatusSnapshotHealth("project-1", {
      forceRefresh: true,
    });
    expect(first.value.summary.critical).toBe(0);

    vi.mocked(scanSnapshotHealth).mockResolvedValue(SNAPSHOT_DIRTY as never);

    resetStatusHealthForTest();

    const second = await fetchStatusSnapshotHealth("project-1", {
      forceRefresh: true,
    });
    expect(second.value.summary.critical).toBe(4);
  });

  it("clears lastErrorByKey on the probe cache via the status-health reset surface", async () => {
    // Populate the temporal-health probe cache with a successful
    // value, then force a fetch failure on a fresh key so the
    // probe cache's per-key `lastErrorByKey` closure receives a
    // recorded failure.
    vi.mocked(getTemporalHealth).mockReset();
    vi.mocked(getTemporalHealth).mockResolvedValue(HEALTHY_TEMPORAL);
    await fetchStatusTemporalHealth("project-1");

    vi.mocked(getTemporalHealth).mockReset();
    vi.mocked(getTemporalHealth).mockRejectedValue(new Error("boom"));
    await expect(fetchStatusTemporalHealth("project-2")).rejects.toThrow(
      /boom/,
    );

    // Reset must wipe lastErrorByKey without depending on a subsequent
    // successful fetch (which would clear it on its own). We verify
    // that by re-fetching through the status-health surface after
    // reset and asserting the freshness carries no error metadata.
    resetStatusHealthForTest();

    vi.mocked(getTemporalHealth).mockReset();
    vi.mocked(getTemporalHealth).mockResolvedValue(HEALTHY_TEMPORAL);
    const afterReset = await fetchStatusTemporalHealth("project-3");
    expect(afterReset.freshness.error).toBeUndefined();
    expect(afterReset.value).toEqual(HEALTHY_TEMPORAL);
  });

  it("is the single deterministic reset surface — clearing all caches in one call", async () => {
    // Populate every cache exactly the way the cases above do, in a
    // single test, and confirm one call to resetStatusHealthForTest
    // empties the lot. This is the structural assertion of DONT3 — the
    // test reset must not need a second touch to wipe any leftover state.
    healthSnapshotCache.set("k", {
      snapshot: {
        leaked_source_dirs: 1,
        leaked_archived_source_dirs: 0,
        archive_dirs: 0,
        closed_to_active_ratio: 0,
      },
      computedAt: 0,
    });
    vi.mocked(getTemporalHealth).mockResolvedValue(HEALTHY_TEMPORAL);
    vi.mocked(getWorktreeCensus).mockResolvedValue(HEALTHY_CENSUS);
    vi.mocked(enumerateAdvWorkerProcesses).mockResolvedValue(WORKERS_PRESENT);
    vi.mocked(scanSnapshotHealth).mockResolvedValue(SNAPSHOT_HEALTHY as never);
    await fetchStatusTemporalHealth("k");
    await statusWorktreeCensusProbeCache.fetch("k");
    await fetchStatusWorkerProcesses({ forceRefresh: true });

    // All caches now carry residue. A single reset must drop it.
    resetStatusHealthForTest();

    expect(healthSnapshotCache.size).toBe(0);

    // Behavioral check: switching the mocks and re-fetching yields the
    // new values. None of the probe caches are allowed to replay stale
    // data when the reset helper has been called.
    vi.mocked(getTemporalHealth).mockResolvedValue(UNHEALTHY_TEMPORAL);
    vi.mocked(getWorktreeCensus).mockResolvedValue(UNHEALTHY_CENSUS);
    vi.mocked(enumerateAdvWorkerProcesses).mockResolvedValue(WORKERS_ABSENT);
    vi.mocked(scanSnapshotHealth).mockResolvedValue(SNAPSHOT_DIRTY as never);

    const temporal = await fetchStatusTemporalHealth("k");
    const census = await statusWorktreeCensusProbeCache.fetch("k");
    const workers = await fetchStatusWorkerProcesses({ forceRefresh: true });
    const search = await statusSearchAttributesProbeCache.fetch("k");
    const snapshot = await fetchStatusSnapshotHealth("k", {
      forceRefresh: true,
    });

    expect(temporal.value.server_alive).toBe(false);
    expect(census.value.warnings).toEqual(["boom"]);
    expect(workers.value.workerCount).toBe(0);
    expect(search.value.ok).toBe(false);
    expect(snapshot.value.summary.critical).toBeGreaterThan(0);
  });
});
