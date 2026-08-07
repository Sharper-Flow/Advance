/** Bounded health execution tests for the disk-backed status surface. */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { statusTools } from "./status";
import {
  createTestProject,
  createTempDir,
  cleanupTempDir,
  parseToolOutput,
} from "../__tests__/setup";
import { createDiskStore } from "../storage/store-disk";
import type { Store } from "../storage/store";
import type { ProjectStatus } from "../types";
import * as worktree from "./worktree";

const mockGetWorktreeCensus = vi.hoisted(() => vi.fn());
const mockScanSnapshotHealth = vi.hoisted(() => vi.fn());

vi.mock("../utils/worktree-census", () => ({
  getWorktreeCensus: mockGetWorktreeCensus,
}));
vi.mock("./snapshot-scan", () => ({
  scanSnapshotHealth: mockScanSnapshotHealth,
}));
vi.mock("../utils/plugin-runtime-info", () => ({
  getPluginRuntimeInfo: vi.fn(async () => ({ loaded_module_path: "test" })),
}));
vi.mock("./session/index", () => ({
  listPeerSessions: vi.fn(async () => ({ sessions: [] })),
}));
vi.mock("../utils/tool-lane-projection", () => ({
  getLaneProjections: vi.fn(async () => ({})),
  resetLaneProjectionsCache: vi.fn(),
}));
vi.mock("../utils/opencode-session-debt", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../utils/opencode-session-debt")>()),
  scanOpenCodeSessionDebt: vi.fn(async () => ({ available: false })),
}));

function healthyCensus() {
  return { total: 0, stale: [], records: [], warnings: [], classes: {} };
}

function healthySnapshot() {
  return {
    schema_version: 1,
    scan_duration_ms: 0,
    scope: "project",
    project_id: "unknown",
    summary: {
      projects_scanned: 0,
      bare_repos_scanned: 0,
      critical: 0,
      warnings: 0,
      info: 0,
    },
    findings: [],
  };
}

function syntheticStatus(): ProjectStatus {
  const recent = Array.from({ length: 57 }, (_, i) => ({
    id: `change-${String(i).padStart(3, "0")}`,
    title: `Change ${i}`,
    status: "draft" as const,
    completedTasks: 0,
    taskCount: 0,
    lastActivityAt: `2026-02-${String((i % 28) + 1).padStart(2, "0")}T00:00:00.000Z`,
    minutesSinceActivity: i,
  }));
  return {
    specs: { count: 1, capabilities: [] },
    changes: {
      active: 10,
      byStatus: { draft: 10, archived: 0, closed: 0 },
      recent: recent.slice(0, 10),
    },
    recommendations: [],
    resolvedChanges: new Map(),
    warnings: [],
    hydrationStats: { boundedOmitted: 47 },
  } as unknown as ProjectStatus;
}

describe("health view bounded pressure contract", () => {
  let tempDir: string;
  let store: Store;

  beforeEach(async () => {
    tempDir = await createTempDir("adv-status-health-pressure-");
    await createTestProject(tempDir);
    store = await createDiskStore(tempDir);
    mockGetWorktreeCensus.mockReset();
    mockGetWorktreeCensus.mockResolvedValue(healthyCensus());
    mockScanSnapshotHealth.mockReset();
    mockScanSnapshotHealth.mockResolvedValue(healthySnapshot());
  });

  afterEach(async () => {
    store.close();
    await cleanupTempDir(tempDir);
  });

  test("passes the source-ranked candidate limit into the authoritative disk read", async () => {
    const statusSpy = vi.spyOn(store, "status");
    const parsed = parseToolOutput(
      await statusTools.adv_status.execute({ view: "health" }, store),
    );

    expect(parsed.view).toBe("health");
    expect(statusSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        recentLimit: 10,
        sourceRanked: true,
      }),
    );
  });

  test("returns request-local execution metadata without Temporal providers", async () => {
    const parsed = parseToolOutput(
      await statusTools.adv_status.execute({ view: "health" }, store),
    );

    expect(parsed._health_execution).toMatchObject({
      schema_version: "1.0",
      response_deadline_ms: 8000,
      execution_cutoff_ms: 7500,
      composition_reserve_ms: 500,
      max_concurrency: 4,
      candidate_limit: 10,
    });
    expect(parsed._health_execution.outcomes).not.toHaveProperty(
      "temporal_health",
    );
  });

  test("reports the bounded omission count from the disk status read", async () => {
    store.status = vi.fn().mockResolvedValue(syntheticStatus());
    const parsed = parseToolOutput(
      await statusTools.adv_status.execute({ view: "health" }, store),
    );

    expect(parsed.changes.recent).toHaveLength(10);
    expect(parsed._health_execution.omitted_count).toBe(47);
    expect(parsed._health_execution.omitted_sample.length).toBeLessThanOrEqual(
      20,
    );
  });

  test("health view retains worktree census evidence without cleanup", async () => {
    mockGetWorktreeCensus.mockResolvedValue({
      total: 5,
      stale: [],
      records: [],
      warnings: [],
      classes: { auto: 3, legacy: 2 },
    });
    const cleanupSpy = vi
      .spyOn(worktree, "advWorktreeCleanup")
      .mockResolvedValue({ total: 0, classes: {} } as never);

    const parsed = parseToolOutput(
      await statusTools.adv_status.execute({ view: "health" }, store),
    );

    expect(parsed.worktree_census).toMatchObject({
      total: 5,
      classes: { auto: 3, legacy: 2 },
    });
    expect(cleanupSpy).not.toHaveBeenCalled();
  });

  test("hygiene view still invokes cleanup discovery", async () => {
    const cleanupSpy = vi
      .spyOn(worktree, "advWorktreeCleanup")
      .mockResolvedValue({ total: 0, classes: {} } as never);

    await statusTools.adv_status.execute({ view: "hygiene" }, store);

    expect(cleanupSpy).toHaveBeenCalled();
  });
});
